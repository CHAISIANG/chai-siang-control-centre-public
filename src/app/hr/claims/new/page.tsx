"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Car, Paperclip, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui";
import { btnBlue, btnLine, field } from "@/components/hr/ui";
import { fmtDate } from "@/lib/hr/rules";
import { mileageAmount, r2, rm, TAXES, taxPortion, total, type Claim, type ClaimItem, type TaxCode } from "@/lib/claims/rules";
import { TODAY, checkClaim } from "@/lib/claims/sample";
import { routeFor, useClaims } from "@/lib/claims/store";
import { useT } from "@/lib/i18n";

const MAX_FILE = 5 * 1024 * 1024;
let n = 0;
const newId = () => `new${++n}${Date.now() % 1000}`;
const blankItem = (mileage = false, cat = "MEL"): ClaimItem => (mileage
  ? { id: newId(), date: TODAY, cat: "MIL", desc: "", amount: 0, tax: "none", from: "Office", to: "", km: 0 }
  : { id: newId(), date: TODAY, cat, desc: "", amount: 0, tax: "none" });

export default function NewClaimPage() {
  const { t } = useT();
  return <Suspense fallback={<p className="py-10 text-center text-slate-500">{t("Loading…")}</p>}><NewClaim /></Suspense>;
}

function NewClaim() {
  const { t } = useT();
  const { data, meId, saveClaim, deleteDraft } = useClaims();
  const router = useRouter();
  const SETTINGS = data.settings, CATEGORIES = data.categories, CLAIMS = data.claims;
  const person = (id: string) => data.staff.find((e) => e.id === id)!;
  const params = useSearchParams();
  const editId = params.get("id"), copyId = params.get("copy");
  const draft = editId ? CLAIMS.find((c) => c.id === editId && c.empId === meId && c.status === "Draft") : undefined;
  const copyOf = copyId ? CLAIMS.find((c) => c.id === copyId && c.empId === meId) : undefined;
  const start = draft ?? copyOf;
  const [title, setTitle] = useState(start ? (copyOf ? `${copyOf.title} (${t("resent")})` : start.title) : "");
  const [items, setItems] = useState<ClaimItem[]>(start?.items.map((i) => ({ ...i, id: copyOf ? newId() : i.id })) ?? [blankItem(false, CATEGORIES.find((c) => c.active && !c.mileage)?.code ?? "MEL")]);
  const [fileErr, setFileErr] = useState<Record<string, string>>({});
  const [done, setDone] = useState<"" | "draft" | "sent">("");
  const [result, setResult] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(send: boolean) {
    setErr(""); setBusy(true);
    const r = await saveClaim({ ...claim, id: draft?.id ?? "new" }, send);
    setBusy(false);
    if (!r.ok) { setErr(r.text); return; }
    setResult(r.text); setDone(send ? "sent" : "draft");
  }

  const set = (id: string, patch: Partial<ClaimItem>) => setItems((list) => list.map((i) => {
    if (i.id !== id) return i;
    const x = { ...i, ...patch };
    if (x.cat === "MIL") { x.amount = mileageAmount(x.km ?? 0, SETTINGS.mileageRate); x.tax = "none"; x.desc = [x.from, x.to].filter(Boolean).join(" – "); }
    return x;
  }));
  const pick = (id: string, f: File | undefined) => {
    if (!f) return;
    if (!/\.(pdf|jpe?g|png|heic)$/i.test(f.name)) { setFileErr((e) => ({ ...e, [id]: t("Use a photo (JPG, PNG) or a PDF.") })); return; }
    if (f.size > MAX_FILE) { setFileErr((e) => ({ ...e, [id]: t("The file is bigger than 5 MB.") })); return; }
    setFileErr((e) => ({ ...e, [id]: "" })); set(id, { receipt: f.name, file: f });
  };

  const claim: Claim = { id: draft?.id ?? "new", no: draft?.no ?? "", empId: meId, title, status: "Draft", items, steps: [], createdAt: TODAY };
  const warnings = checkClaim(claim, CLAIMS, CATEGORIES, SETTINGS);
  const sum = total(claim), sst = r2(items.reduce((s, i) => s + taxPortion(i.amount, i.tax), 0));
  const blockers = [
    !title.trim() && t("Give the claim a short title."),
    items.length === 0 && t("Add at least one item."),
    items.some((i) => !(i.amount > 0)) && t("Every item needs an amount (or kilometres for mileage)."),
    items.some((i) => i.cat !== "MIL" && !i.desc.trim()) && t("Describe every item."),
    items.some((i) => i.cat === "MIL" && !(i.to ?? "").trim()) && t("Say where each trip went."),
  ].filter(Boolean) as string[];
  const route = routeFor(data, meId);
  const mgr = route.some((r) => r.level === 1) ? person(meId).managerId : null;
  const routeText = route.map((r) => (r.level === 1 ? t("{name} (your manager)", { name: person(mgr!).name.split(" ")[0] }) : r.level === 2 ? t("Finance") : t("a Director"))).join(`, ${t("then")} `) || t("Finance for payment");

  if (done) return (
    <div className="mx-auto max-w-md text-center">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-lg font-semibold text-emerald-900">{t(done === "sent" ? "Claim sent" : "Draft saved")}</p>
        <p className="mt-1 text-emerald-800">{rm(sum)} · {items.length} {t(items.length === 1 ? "item" : "items")}. {t(result)} {t(done === "sent" ? "Once sent, it cannot be changed." : "You can finish it later from My claims.")}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2"><Link href="/hr/claims" className={btnLine}>{t("My claims")}</Link><button onClick={() => { router.replace("/hr/claims/new"); setDone(""); setTitle(""); setItems([blankItem()]); }} className={btnBlue}>{t("New claim")}</button></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">{t(draft ? "Finish your draft" : copyOf ? "Send a corrected claim" : "New expense claim")}</h1>
      {copyOf && <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Copied from")} {copyOf.no}{copyOf.steps.find((x) => x.action === "Rejected")?.note ? `, ${t("rejected")}: “${copyOf.steps.find((x) => x.action === "Rejected")!.note}”` : ""}. {t("Fix what was asked, then send it as a new claim.")}</p>}
      <p className="text-slate-500">{t("Enter each receipt as one item, with the amount you paid (SST included).")} {t("Mileage is paid at RM {rate} a km.", { rate: SETTINGS.mileageRate.toFixed(2) })}</p>

      <label className="mt-4 block text-sm font-medium text-slate-700">{t("Title")}<input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("For example: Customer visits, week of 10 Nov")} className={field} /></label>

      <div className="mt-4 space-y-3">
        {items.map((i, k) => {
          const cat = CATEGORIES.find((c) => c.code === i.cat);
          const itemWarn = warnings.filter((w) => w.itemId === i.id);
          return (
            <Card key={i.id} title={`${t("Item")} ${k + 1}${i.cat === "MIL" ? ` · ${t("mileage")}` : ""}`} right={items.length > 1 && <button onClick={() => setItems((l) => l.filter((x) => x.id !== i.id))} className="inline-flex items-center gap-1 text-sm text-rose-700 hover:underline"><Trash2 size={15} /> {t("Remove")}</button>}>
              <div className="grid grid-cols-2 gap-3 text-sm font-medium text-slate-700 sm:grid-cols-4">
                <label>{t("Date")}<input type="date" value={i.date} max={TODAY} onChange={(e) => set(i.id, { date: e.target.value })} className={field} /></label>
                <label className="col-span-1 sm:col-span-3">{t("Category")}<select value={i.cat} onChange={(e) => set(i.id, e.target.value === "MIL" ? { cat: "MIL", from: i.from ?? "Office", to: i.to ?? "", km: i.km ?? 0 } : { cat: e.target.value, km: undefined, from: undefined, to: undefined })} className={field}>
                  {CATEGORIES.filter((c) => c.active).map((c) => <option key={c.code} value={c.code}>{t(c.name)}{c.perItemLimit ? ` (${t("up to")} RM ${c.perItemLimit})` : ""}</option>)}
                </select></label>
                {i.cat === "MIL" ? (
                  <>
                    <label>{t("From")}<input value={i.from ?? ""} onChange={(e) => set(i.id, { from: e.target.value })} className={field} /></label>
                    <label>{t("To")}<input value={i.to ?? ""} onChange={(e) => set(i.id, { to: e.target.value })} placeholder={t("Customer or town")} className={field} /></label>
                    <label>{t("Kilometres")}<input type="number" min={0} step={1} value={i.km || ""} onChange={(e) => set(i.id, { km: Number(e.target.value) })} inputMode="numeric" className={field} /></label>
                    <div><span>{t("Amount")}</span><div className="mt-1 rounded-lg bg-slate-50 px-3 py-2.5 text-base font-semibold text-slate-900">{rm(i.amount)}</div></div>
                  </>
                ) : (
                  <>
                    <label className="col-span-2 sm:col-span-4">{t("What it was for")}<input value={i.desc} onChange={(e) => set(i.id, { desc: e.target.value })} placeholder={t("For example: Lunch with customer, 3 pax")} className={field} /></label>
                    <label>{t("Amount paid (RM)")}<input type="number" min={0} step={0.01} value={i.amount || ""} onChange={(e) => set(i.id, { amount: Number(e.target.value) })} inputMode="decimal" className={field} /></label>
                    <label>{t("SST on receipt")}<select value={i.tax} onChange={(e) => set(i.id, { tax: e.target.value as TaxCode })} className={field}>{TAXES.map((x) => <option key={x.code} value={x.code}>{t(x.label)}</option>)}</select></label>
                    <div className="col-span-2 flex flex-col">
                      <span>{t("Receipt")}{cat?.receiptRequired ? "" : ` (${t("optional")})`}</span>
                      <label className={`${btnLine} mt-1 cursor-pointer !py-2 text-sm`}><Paperclip size={16} /> <span className="truncate">{i.receipt ?? t("Photo or PDF of the receipt")}</span><input type="file" accept="image/*,.pdf" capture="environment" className="sr-only" onChange={(e) => pick(i.id, e.target.files?.[0])} /></label>
                      {fileErr[i.id] && <span className="mt-1 text-rose-700">{fileErr[i.id]}</span>}
                    </div>
                  </>
                )}
              </div>
              {i.tax !== "none" && i.amount > 0 && <p className="mt-2 text-sm text-slate-500">{t("Includes {amt} SST.", { amt: rm(taxPortion(i.amount, i.tax)) })}</p>}
              {itemWarn.map((w) => <p key={w.text} className="mt-2 inline-flex items-start gap-1.5 text-sm text-amber-800"><AlertTriangle size={15} className="mt-0.5 shrink-0" />{t(w.text)}</p>)}
            </Card>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <button onClick={() => setItems((l) => [...l, blankItem()])} className={`${btnLine} !py-2 text-sm`}><Plus size={16} /> {t("Add expense")}</button>
        <button onClick={() => setItems((l) => [...l, blankItem(true)])} className={`${btnLine} !py-2 text-sm`}><Car size={16} /> {t("Add mileage")}</button>
      </div>

      <Card className="mt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xs text-slate-500">{t("Items")}</div><div className="font-display text-2xl font-semibold text-slate-900">{items.length}</div></div>
          <div><div className="text-xs text-slate-500">{t("SST included")}</div><div className="font-display text-2xl font-semibold text-slate-900">{sst.toFixed(2)}</div></div>
          <div><div className="text-xs text-slate-500">{t("Total claim")}</div><div className="font-display text-2xl font-semibold text-blue-600">{sum.toFixed(2)}</div></div>
        </div>
        {warnings.filter((w) => !w.itemId).length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">{t("Worth a look before you send (you can still send it):")}</p>
            <ul className="mt-1 list-disc pl-5">{warnings.filter((w) => !w.itemId).map((w) => <li key={w.text}>{t(w.text)}</li>)}</ul>
          </div>
        )}
      </Card>

      {blockers.length > 0 && <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
      {err && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{t(err)}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button onClick={() => save(false)} disabled={!title.trim() || busy} className={btnLine}>{t("Save draft")}</button>
        <button onClick={() => save(true)} disabled={blockers.length > 0 || busy} className={btnBlue}>{t(busy ? "Sending…" : "Send for approval")}</button>
      </div>
      {draft && <button onClick={async () => { if (confirm(t("Delete this draft? This cannot be undone."))) { const r = await deleteDraft(draft.id); if (r.ok) router.push("/hr/claims"); else setErr(r.text); } }} className="mt-3 w-full text-center text-sm font-medium text-rose-700 hover:underline">{t("Delete draft")}</button>}
      <p className="mt-2 text-center text-xs text-slate-500">{t("Once sent, a claim cannot be changed.")} {t("It goes to")} {routeText}. {t("Claims count in the month of their first receipt")}{draft ? ` (${t("started")} ${fmtDate(draft.createdAt)})` : ""}. {t("Limit")}: RM {SETTINGS.monthlyLimit.toLocaleString()} {t("a month")}.</p>
    </div>
  );
}
