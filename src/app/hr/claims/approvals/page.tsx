"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Paperclip, Search, X } from "lucide-react";
import { Modal, btnBlue, btnLine, field } from "@/components/hr/ui";
import { ClaimBadge } from "@/components/claims/ui";
import { fmtDate } from "@/lib/hr/rules";
import { LEVEL_NAME, rm, taxPortion, total } from "@/lib/claims/rules";
import { TODAY, checkClaim } from "@/lib/claims/sample";
import { approversNow, routeFor, useClaims } from "@/lib/claims/store";
import { useT } from "@/lib/i18n";

const LEVEL_OF = { manager: 1, finance: 2, director: 3 } as const;
const daysAgo = (d?: string) => (d ? Math.round((new Date(`${TODAY}T00:00:00Z`).getTime() - new Date(`${d}T00:00:00Z`).getTime()) / 86400000) : 0);

export default function ClaimApprovals() {
  const { t } = useT();
  const { role, data, decide, canDecide, isFinance, isDirector, live: isLive, receiptLink } = useClaims();
  const [busy, setBusy] = useState(false);
  const CLAIMS = data.claims, CATEGORIES = data.categories;
  const person = (id: string) => data.staff.find((e) => e.id === id)!;
  const catName = (code: string) => t(CATEGORIES.find((x) => x.code === code)?.name ?? code);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [deciding, setDeciding] = useState<{ ids: string[]; action: "Approved" | "Rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const [dept, setDept] = useState("");
  const [cat, setCat] = useState("");
  const [flagged, setFlagged] = useState(false);
  const [q, setQ] = useState("");

  const isApprover = isLive ? (isFinance || isDirector || role === "manager") : role !== "employee";
  if (!isApprover) return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{t("Claim approvals are for managers, Finance and Directors. Switch “Viewing as” above to try them.")}</p>;
  const level = LEVEL_OF[role as keyof typeof LEVEL_OF] ?? (isDirector ? 3 : isFinance ? 2 : 1);
  // my queue: claims waiting at my level, where I am one of the approvers; nobody approves their own claim
  const queue = CLAIMS.filter((c) => canDecide(c) && (isLive || approversNow(data, c)?.level === level))
    .map((c) => ({ c, flags: checkClaim(c, CLAIMS, CATEGORIES, data.settings) }))
    .filter(({ c, flags }) => (!dept || person(c.empId).dept === dept) && (!cat || c.items.some((i) => i.cat === cat)) && (!flagged || flags.length > 0)
      && (!q || `${c.no} ${c.title} ${person(c.empId).name}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => (a.c.submittedAt ?? "").localeCompare(b.c.submittedAt ?? ""));
  const depts = [...new Set(CLAIMS.map((c) => person(c.empId).dept))].sort();
  const live = picked.filter((id) => queue.some((x) => x.c.id === id));
  const nextAfter = (empId: string) => { const r = routeFor(data, empId).find((x) => x.level > level); return r ? (r.level === 2 ? t("Finance") : t("a Director")) : t("Finance for payment"); };
  const next = level === 1 ? (data.settings.levels.finance ? t("Finance") : data.settings.levels.director ? t("a Director") : t("Finance for payment")) : level === 2 ? (data.settings.levels.director ? t("a Director") : t("Finance for payment")) : t("Finance for payment");
  // own claims waiting at my step go to someone else in the group; warn when there is nobody else
  const stuck = isLive ? [] : CLAIMS.filter((c) => { const w = approversNow(data, c); return w?.level === level && w.who.length === 0; });
  const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

  async function finish() {
    if (!deciding) return;
    setBusy(true);
    const r = await decide(deciding.ids, deciding.action, note);
    setBusy(false);
    if (!r.ok) { setErr(r.text); return; }
    setErr("");
    setPicked((p) => p.filter((id) => !deciding.ids.includes(id)));
    setMsg(`${t(r.text)}${deciding.action === "Approved" ? (deciding.ids.length === 1 ? ` ${t("Next")}: ${nextAfter(CLAIMS.find((c) => c.id === deciding.ids[0])!.empId)}.` : "") : ` ${t("The employee sees your comment.")}`}`);
    setDeciding(null); setNote("");
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">{t("Claim approvals")}</h1>
      <p className="text-slate-500">{t("{role} approval (step {n} of 3). Oldest first. Approved claims go to {next}.", { role: t(LEVEL_NAME[level]), n: level, next })}</p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="relative"><Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Name, title or claim no.")} className="w-56 rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm" /></label>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={sel} aria-label={t("Department")}><option value="">{t("All departments")}</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={cat} onChange={(e) => setCat(e.target.value)} className={sel} aria-label={t("Category")}><option value="">{t("All categories")}</option>{CATEGORIES.map((c) => <option key={c.code} value={c.code}>{t(c.name)}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} className="h-4 w-4" /> {t("Only flagged")}</label>
      </div>

      {queue.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2">
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={queue.every((x) => picked.includes(x.c.id))} onChange={(e) => setPicked(e.target.checked ? queue.map((x) => x.c.id) : [])} className="h-4 w-4" /> {t("Select all {n}", { n: queue.length })}</label>
          <button disabled={!live.length} onClick={() => setDeciding({ ids: live, action: "Approved" })} className={`${btnBlue} !py-1.5 text-sm`}><Check size={16} /> {t("Approve")} {live.length || ""} ({rm(queue.filter((x) => live.includes(x.c.id)).reduce((s, x) => s + total(x.c), 0))})</button>
        </div>
      )}
      {msg && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t(msg)}</p>}
      {stuck.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{stuck.map((c) => c.no).join(", ")} {t(stuck.length === 1 ? "is waiting at this step but nobody else can approve it (people cannot approve their own claims). Give a second person this role in Users." : "are waiting at this step but nobody else can approve them (people cannot approve their own claims). Give a second person this role in Users.")}</p>}

      <ul className="mt-3 space-y-2">
        {queue.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">{t("Nothing waiting for you. All caught up.")}</li>}
        {queue.map(({ c, flags }) => {
          const who = person(c.empId), isOpen = open === c.id;
          return (
            <li key={c.id} className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-start gap-3 p-4">
                <input type="checkbox" checked={picked.includes(c.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.id] : p.filter((x) => x !== c.id)))} className="mt-1 h-4 w-4" aria-label={`${t("Select")} ${c.no}`} />
                <button onClick={() => setOpen(isOpen ? null : c.id)} className="min-w-0 flex-1 text-left" aria-expanded={isOpen}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{who.name}<span className="ml-2 text-sm font-normal text-slate-500">{who.dept}</span></span>
                    <span className="font-display text-lg font-semibold text-slate-900">{rm(total(c))}</span>
                  </div>
                  <div className="text-sm text-slate-600">{c.title} · {c.no} · {c.items.length} {t(c.items.length === 1 ? "item" : "items")}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-500">{t("sent {date}", { date: fmtDate(c.submittedAt!) })} ({daysAgo(c.submittedAt)} {t(daysAgo(c.submittedAt) === 1 ? "day" : "days")} {t("ago")})</span>
                    {flags.length > 0 && <span className="inline-flex items-center gap-1 text-amber-700"><AlertTriangle size={14} /> {flags.length} {t(flags.length === 1 ? "flag" : "flags")}</span>}
                    <ChevronDown size={16} className={`ml-auto text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>
              </div>
              {isOpen && (
                <div className="border-t border-slate-100 px-4 pb-4 pt-3">
                  <ul className="divide-y divide-slate-100 text-sm">
                    {c.items.map((i) => (
                      <li key={i.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0"><div className="text-slate-900">{i.desc || catName(i.cat)}</div><div className="text-slate-500">{fmtDate(i.date)} · {catName(i.cat)}{i.km ? ` · ${i.km} km` : ""}</div>
                          {i.receipt ? <button onClick={async () => { const u = await receiptLink(i.receipt!); if (u) window.open(u, "_blank", "noopener"); else setMsg(t(isLive ? "The receipt could not be opened." : "Sample receipt: in the live system this opens the photo.")); }} className="mt-0.5 inline-flex items-center gap-1 font-medium text-blue-600 hover:underline"><Paperclip size={13} /> {t("View receipt")}</button> : i.cat !== "MIL" && <span className="text-amber-700">{t("No receipt")}</span>}</div>
                        <div className="text-right"><div className="font-medium">{rm(i.amount)}</div>{i.tax !== "none" && <div className="text-xs text-slate-500">SST {taxPortion(i.amount, i.tax).toFixed(2)}</div>}</div>
                      </li>
                    ))}
                  </ul>
                  {flags.length > 0 && <ul className="mt-2 list-disc rounded-lg bg-amber-50 py-2 pl-8 pr-3 text-sm text-amber-900">{flags.map((f) => <li key={f.text}>{t(f.text)}</li>)}</ul>}
                  {c.steps.filter((s) => s.action === "Approved").map((s) => <p key={s.at + s.by} className="mt-2 text-sm text-slate-600">{t("Approved by {name} ({role}) on {date}", { name: s.byName, role: t(LEVEL_NAME[s.level!]), date: fmtDate(s.at) })}{s.note ? `: “${s.note}”` : ""}</p>)}
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                    <button onClick={() => setDeciding({ ids: [c.id], action: "Approved" })} className={`${btnBlue} !py-2`}><Check size={16} /> {t("Approve")}</button>
                    <button onClick={() => setDeciding({ ids: [c.id], action: "Rejected" })} className={`${btnLine} !py-2 !text-rose-700`}><X size={16} /> {t("Reject")}</button>
                    <Link href={`/hr/claims/${c.id}`} className="self-center text-sm font-medium text-blue-600 hover:underline sm:ml-auto">{t("Full details")}</Link>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {deciding && (
        <Modal title={deciding.action === "Approved" ? (deciding.ids.length === 1 ? t("Approve this claim?") : t("Approve {n} claims?", { n: deciding.ids.length })) : t("Reject this claim?")} onClose={() => setDeciding(null)}>
          <p className="text-sm text-slate-600">{deciding.action === "Approved" ? t("It goes on to {next}.", { next }) : t("The claim stops here. The employee sees your comment and can send a corrected claim.")}</p>
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{t(err)}</p>}
          <label className="mt-3 block text-sm font-medium text-slate-700">{t("Comment")}{deciding.action === "Rejected" ? ` (${t("required")})` : ` (${t("optional")})`}<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={field} placeholder={deciding.action === "Rejected" ? t("For example: receipt missing for the hotel") : ""} autoFocus /></label>
          <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => setDeciding(null)} className={btnLine}>{t("Cancel")}</button><button disabled={(deciding.action === "Rejected" && !note.trim()) || busy} onClick={finish} className={deciding.action === "Rejected" ? `${btnBlue} !bg-rose-600 hover:!bg-rose-700` : btnBlue}>{t(deciding.action === "Approved" ? "Approve" : "Reject")}</button></div>
        </Modal>
      )}
      <p className="mt-4 text-xs text-slate-500">{t("Status shown for each claim")}: <ClaimBadge s={level === 1 ? "Pending manager" : level === 2 ? "Pending finance" : "Pending director"} /></p>
    </div>
  );
}
