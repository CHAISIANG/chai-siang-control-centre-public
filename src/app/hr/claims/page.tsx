"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Landmark, Plus } from "lucide-react";
import { Card } from "@/components/ui";
import { Modal, Stat, btnBlue, btnLine, field } from "@/components/hr/ui";
import { ClaimBadge } from "@/components/claims/ui";
import { fmtDate } from "@/lib/hr/rules";
import { claimMonth, rm, total, type ClaimStatus } from "@/lib/claims/rules";
import { TODAY, YEAR } from "@/lib/claims/sample";
import { monthClaimedIn, useClaims } from "@/lib/claims/store";
import { useT } from "@/lib/i18n";

const OPEN: ClaimStatus[] = ["Pending manager", "Pending finance", "Pending director"];
const BANK_LIST = ["Maybank", "CIMB Bank", "Public Bank", "RHB Bank", "Hong Leong Bank", "AmBank", "Bank Islam", "Bank Rakyat", "BSN", "OCBC Bank", "UOB", "HSBC", "Standard Chartered", "Alliance Bank", "Affin Bank", "Agrobank", "MBSB Bank", "Bank Muamalat"];

export default function MyClaims() {
  const { t, locale } = useT();
  const { data, meId, saveBank } = useClaims();
  const me = data.staff.find((e) => e.id === meId);
  const s = data.settings;
  const mine = data.claims.filter((c) => c.empId === meId).sort((a, b) => (b.submittedAt ?? b.createdAt).localeCompare(a.submittedAt ?? a.createdAt) || b.no.localeCompare(a.no));
  const month = TODAY.slice(0, 7);
  const used = monthClaimedIn(data, meId, month);
  const pct = Math.min(100, (used / s.monthlyLimit) * 100);
  const ytd = mine.filter((c) => c.status === "Paid" && claimMonth(c).startsWith(String(YEAR))).reduce((sum, c) => sum + total(c), 0);
  const waiting = mine.filter((c) => OPEN.includes(c.status));
  const toBePaid = mine.filter((c) => c.status === "Approved" || c.status === "Processing");
  const [filter, setFilter] = useState<"all" | "open" | "done">("all");
  const bank = data.banks.find((b) => b.empId === meId);
  const [form, setForm] = useState<{ bank: string; accountName: string; accountNo: string } | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const shown = mine.filter((c) => filter === "all" || (filter === "open" ? !["Paid", "Rejected"].includes(c.status) : ["Paid", "Rejected"].includes(c.status)));
  const monthName = new Date(`${TODAY}T00:00:00Z`).toLocaleDateString(locale, { month: "long", timeZone: "UTC" });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">{t("My expense claims")}</h1><p className="text-slate-500">{t("Claim what you spent for work. Each claim goes to your manager, then Finance, then a Director, before it is paid.")}</p></div>
        <Link href="/hr/claims/new" className={btnBlue}><Plus size={18} /> {t("New claim")}</Link>
      </div>
      {msg && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t(msg)}</p>}

      <Card className="mt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-slate-600">{t("Claimed in {month}", { month: monthName })}</span>
          <span className="text-sm text-slate-500">{t("limit")} {rm(s.monthlyLimit)}</span>
        </div>
        <div className="mt-1 font-display text-3xl font-semibold text-slate-900">{rm(used)}</div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={t("Share of monthly limit used")}>
          <div className={`h-full rounded-full ${used > s.monthlyLimit ? "bg-rose-500" : pct > 80 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-1 text-sm text-slate-500">{used > s.monthlyLimit ? t("{amt} over the limit. You can still claim; approvers will see it is over.", { amt: rm(used - s.monthlyLimit) }) : t("{amt} left this month. Drafts and rejected claims do not count.", { amt: rm(s.monthlyLimit - used) })}</p>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("Waiting approval")} value={String(waiting.length)} sub={rm(waiting.reduce((sum, c) => sum + total(c), 0))} tone={waiting.length ? "amber" : "slate"} />
        <Stat label={t("Approved, to be paid")} value={String(toBePaid.length)} sub={rm(toBePaid.reduce((sum, c) => sum + total(c), 0))} tone="blue" />
        <Stat label={t("Paid in {year}", { year: YEAR })} value={rm(ytd).replace("RM ", "")} sub={t("ringgit")} tone="green" />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="inline-flex min-w-0 items-center gap-2 text-slate-700"><Landmark size={18} className="shrink-0 text-blue-500" />{bank ? <span className="truncate">{t("Paid to")} {bank.bank} ····{bank.accountNo.replace(/\s/g, "").slice(-4)}</span> : <span className="text-rose-700">{t("No bank details yet. Finance cannot pay you until you add them.")}</span>}</span>
        <button onClick={() => { setErr(""); setForm({ bank: bank?.bank ?? "", accountName: bank?.accountName ?? (me?.name ?? "").toUpperCase(), accountNo: bank?.accountNo ?? "" }); }} className="shrink-0 font-medium text-blue-600 hover:underline">{t(bank ? "Change" : "Add")}</button>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">{t("My claims")}</h2>
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">
          {([["all", "All"], ["open", "In progress"], ["done", "Finished"]] as const).map(([k, l]) => <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1 ${filter === k ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{t(l)}</button>)}
        </div>
      </div>
      <ul className="mt-2 space-y-2">
        {shown.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">{t("No claims here.")} <Link href="/hr/claims/new" className="font-medium text-blue-600 hover:underline">{t("Make a claim")}</Link></li>}
        {shown.map((c) => (
          <li key={c.id}>
            <Link href={c.status === "Draft" ? `/hr/claims/new?id=${c.id}` : `/hr/claims/${c.id}`} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 hover:border-blue-300">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2"><span className="font-medium text-slate-900">{c.title}</span><ClaimBadge s={c.status} /></div>
                <div className="text-sm text-slate-500">{c.no} · {c.items.length} {t(c.items.length === 1 ? "item" : "items")} · {c.submittedAt ? t("sent {date}", { date: fmtDate(c.submittedAt) }) : t("draft, not sent yet")}</div>
              </div>
              <span className="font-display text-lg font-semibold text-slate-900">{rm(total(c))}</span>
              <ChevronRight size={18} className="shrink-0 text-slate-400" />
            </Link>
          </li>
        ))}
      </ul>

      {form && (
        <Modal title={t("Bank details for claim payments")} onClose={() => setForm(null)}>
          <p className="text-sm text-slate-600">{t("Only you, Finance and HR can see this. It must be an account in your own name")}{me ? ` (${me.name})` : ""}.</p>
          <div className="mt-3 space-y-3 text-sm font-medium text-slate-700">
            <label className="block">{t("Bank")}<select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} className={field}><option value="">{t("Choose your bank")}</option>{BANK_LIST.map((b) => <option key={b}>{b}</option>)}</select></label>
            <label className="block">{t("Name on the account")}<input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} className={field} /></label>
            <label className="block">{t("Account number")}<input value={form.accountNo} onChange={(e) => setForm({ ...form, accountNo: e.target.value })} inputMode="numeric" className={field} /></label>
          </div>
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{t(err)}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => setForm(null)} className={btnLine}>{t("Cancel")}</button><button onClick={async () => { const r = await saveBank({ empId: meId, ...form }); if (r.ok) { setForm(null); setMsg(r.text); } else setErr(r.text); }} className={btnBlue}>{t("Save")}</button></div>
        </Modal>
      )}
    </div>
  );
}
