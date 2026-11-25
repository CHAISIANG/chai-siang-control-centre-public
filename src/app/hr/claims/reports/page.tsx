"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Card, Td, Th } from "@/components/ui";
import { btnBlue } from "@/components/hr/ui";
import { r2, rm, TAXES, taxPortion, type ClaimStatus } from "@/lib/claims/rules";
import { TODAY } from "@/lib/claims/sample";
import { useClaims } from "@/lib/claims/store";
import { useT } from "@/lib/i18n";

const APPROVED: ClaimStatus[] = ["Approved", "Processing", "Paid"];
const PENDING: ClaimStatus[] = ["Pending manager", "Pending finance", "Pending director"];
const shift = (ym: string, n: number) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const num = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A labelled horizontal bar: the length is the value's share of the largest value shown. */
function Bar({ value, max, tone = "bg-blue-500", over = false }: { value: number; max: number; tone?: string; over?: boolean }) {
  return <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${over ? "bg-rose-500" : tone}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} /></div>;
}

export default function ClaimReports() {
  const { t, locale } = useT();
  const { data, canReports } = useClaims();
  const CLAIMS = data.claims, CATEGORIES = data.categories;
  const person = (id: string) => data.staff.find((e) => e.id === id)!;
  const catName = (code: string) => t(CATEGORIES.find((x) => x.code === code)?.name ?? code);
  const label = (ym: string) => new Date(`${ym}-01T00:00:00Z`).toLocaleDateString(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
  const now = TODAY.slice(0, 7);
  const [from, setFrom] = useState(shift(now, -5));
  const [to, setTo] = useState(now);
  const [dept, setDept] = useState("");
  const [withPending, setWithPending] = useState(false);
  if (!canReports) return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{t("Claim reports are for Finance and Directors. Switch “Viewing as” above to see them.")}</p>;

  const counted = withPending ? [...APPROVED, ...PENDING] : APPROVED;
  const months: string[] = []; for (let m = from; m <= to; m = shift(m, 1)) months.push(m);
  // every expense line in range, with who and which department
  const lines = CLAIMS.filter((c) => counted.includes(c.status)).flatMap((c) => c.items.map((i) => ({ c, i, e: person(c.empId), m: i.date.slice(0, 7) })))
    .filter((x) => x.m >= from && x.m <= to && (!dept || x.e.dept === dept));
  const sum = (xs: typeof lines) => r2(xs.reduce((s, x) => s + x.i.amount, 0));
  const grand = sum(lines);
  const depts = [...new Set(CLAIMS.map((c) => person(c.empId).dept))].sort();

  const byDept = depts.filter((d) => !dept || d === dept).map((d) => ({ d, months: months.map((m) => sum(lines.filter((x) => x.e.dept === d && x.m === m))), all: sum(lines.filter((x) => x.e.dept === d)) }));
  const ranking = [...new Set(lines.map((x) => x.e.id))].map((id) => { const xs = lines.filter((x) => x.e.id === id); return { e: person(id), amount: sum(xs), claims: new Set(xs.map((x) => x.c.id)).size }; }).sort((a, b) => b.amount - a.amount);
  const byCat = CATEGORIES.map((c) => ({ c, amount: sum(lines.filter((x) => x.i.cat === c.code)) })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount);
  const trend = Array.from({ length: 12 }, (_, k) => shift(now, k - 11)).map((m) => ({ m, amount: r2(CLAIMS.filter((c) => counted.includes(c.status)).flatMap((c) => c.items.map((i) => ({ i, e: person(c.empId) }))).filter((x) => x.i.date.startsWith(m) && (!dept || x.e.dept === dept)).reduce((s, x) => s + x.i.amount, 0)) }));
  const tMax = Math.max(...trend.map((t) => t.amount), 1);
  const budget = CATEGORIES.filter((c) => c.monthlyBudget).map((c) => { const b = (c.monthlyBudget ?? 0) * months.length, a = sum(lines.filter((x) => x.i.cat === c.code)); return { c, budget: b, actual: a, pct: b ? Math.round((a / b) * 100) : 0 }; });
  const sst = TAXES.filter((t) => t.code !== "none").map((t) => { const xs = lines.filter((x) => x.i.tax === t.code); return { t, gross: sum(xs), tax: r2(xs.reduce((s, x) => s + taxPortion(x.i.amount, x.i.tax), 0)) }; });
  const sstTotal = r2(sst.reduce((s, x) => s + x.tax, 0));

  function exportCsv() {
    const head = ["Claim no", "Status", "Employee code", "Name", "Department", "Expense date", "Category", "Description", "Amount (RM)", "SST type", "SST (RM)", "Kilometres"];
    const body = lines.map((x) => [x.c.no, x.c.status, x.e.code, x.e.name, x.e.dept, x.i.date, catName(x.i.cat), x.i.desc, x.i.amount.toFixed(2), TAXES.find((t) => t.code === x.i.tax)!.label, taxPortion(x.i.amount, x.i.tax).toFixed(2), x.i.km ?? ""]);
    const text = "﻿" + [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `Expense claims ${from} to ${to}.csv` }).click();
    URL.revokeObjectURL(url);
  }
  const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">{t("Claim reports")}</h1><p className="text-slate-500">{t(withPending ? "Approved, paid and still-waiting claims" : "Approved and paid claims")}, {t("by the date of each expense.")}</p></div>
        <button onClick={exportCsv} disabled={!lines.length} className={`${btnBlue} !py-2 text-sm`}><Download size={16} /> {t("Export CSV")}</button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="text-sm text-slate-600">{t("From")} <input type="month" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={sel} /></label>
        <label className="text-sm text-slate-600">{t("to")} <input type="month" value={to} min={from} max={now} onChange={(e) => setTo(e.target.value)} className={sel} /></label>
        <select value={dept} onChange={(e) => setDept(e.target.value)} className={sel} aria-label={t("Department")}><option value="">{t("All departments")}</option>{depts.map((d) => <option key={d}>{d}</option>)}</select>
        <label className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={withPending} onChange={(e) => setWithPending(e.target.checked)} className="h-4 w-4" /> {t("Include claims still waiting")}</label>
        <span className="ml-auto text-sm text-slate-600">{t("Total")} <b className="text-slate-900">{rm(grand)}</b> · {lines.length} {t("lines")}</span>
      </div>

      <Card className="mt-4" title={t("By department and month")}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Department</Th>{months.map((m) => <Th key={m} right>{label(m)}</Th>)}<Th right>Total</Th></tr></thead>
            <tbody>
              {byDept.map((r) => <tr key={r.d} className="border-b border-slate-100"><Td first>{r.d}</Td>{r.months.map((v, k) => <Td key={k} right><span className={v ? "" : "text-slate-300"}>{v ? num(v) : "–"}</span></Td>)}<Td right className="font-medium">{num(r.all)}</Td></tr>)}
              <tr><Td first className="font-semibold">{t("All")}</Td>{months.map((m) => <Td key={m} right className="font-semibold">{num(sum(lines.filter((x) => x.m === m)))}</Td>)}<Td right className="font-semibold">{num(grand)}</Td></tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("Who claims most")}>
          <ol className="space-y-2.5">
            {ranking.map((r, k) => (
              <li key={r.e.id} className="text-sm">
                <div className="flex justify-between gap-2"><span><span className="mr-2 text-slate-400">{k + 1}</span>{r.e.name}<span className="ml-2 text-slate-500">{r.e.dept}</span></span><span className="font-medium">{rm(r.amount)}</span></div>
                <div className="mt-1 flex items-center gap-2"><Bar value={r.amount} max={ranking[0]?.amount ?? 1} /><span className="w-16 shrink-0 text-right text-xs text-slate-500">{r.claims} {t(r.claims === 1 ? "claim" : "claims")}</span></div>
              </li>
            ))}
            {ranking.length === 0 && <li className="text-sm text-slate-500">{t("No claims in this period.")}</li>}
          </ol>
        </Card>
        <Card title={t("By category")}>
          <ul className="space-y-2.5">
            {byCat.map((x) => (
              <li key={x.c.code} className="text-sm">
                <div className="flex justify-between gap-2"><span>{t(x.c.name)}</span><span><b className="font-medium">{rm(x.amount)}</b><span className="ml-2 text-slate-500">{grand ? Math.round((x.amount / grand) * 100) : 0}%</span></span></div>
                <div className="mt-1"><Bar value={x.amount} max={byCat[0]?.amount ?? 1} /></div>
              </li>
            ))}
            {byCat.length === 0 && <li className="text-sm text-slate-500">{t("No claims in this period.")}</li>}
          </ul>
        </Card>
      </div>

      <Card className="mt-4" title={t("Last 12 months")} right={<span className="text-sm text-slate-500">{dept || t("All departments")}</span>}>
        <div className="flex h-44 items-end gap-1.5" role="img" aria-label={`${t("Claims per month")}: ${trend.map((t) => `${label(t.m)} ${num(t.amount)}`).join(", ")}`}>
          {trend.map((t) => (
            <div key={t.m} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={`${label(t.m)}: ${rm(t.amount)}`}>
              {t.amount > 0 && <span className="text-[10px] text-slate-500">{t.amount >= 1000 ? `${(t.amount / 1000).toFixed(1)}k` : Math.round(t.amount)}</span>}
              <div className={`w-full rounded-t ${t.m === now ? "bg-blue-300" : "bg-blue-500"}`} style={{ height: `${(t.amount / tMax) * 80}%`, minHeight: t.amount ? 2 : 0 }} />
              <span className="text-[10px] text-slate-500">{label(t.m).split(" ")[0]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">{t("Lighter bar: this month, still running.")}</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("Budget against actual")} right={<span className="text-sm text-slate-500">{months.length} {t(months.length === 1 ? "month" : "months")}</span>}>
          <ul className="space-y-2.5">
            {budget.map((b) => (
              <li key={b.c.code} className="text-sm">
                <div className="flex justify-between gap-2"><span>{t(b.c.name)}</span><span><b className={b.pct > 100 ? "font-medium text-rose-700" : "font-medium"}>{rm(b.actual)}</b><span className="text-slate-500"> {t("of")} {rm(b.budget)} · {b.pct}%</span></span></div>
                <div className="mt-1"><Bar value={b.actual} max={b.budget} over={b.pct > 100} tone={b.pct > 80 ? "bg-amber-500" : "bg-blue-500"} /></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("SST in claims")}>
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Tax</Th><Th right>Amount incl. SST</Th><Th right>SST</Th></tr></thead>
            <tbody>
              {sst.map((x) => <tr key={x.t.code} className="border-b border-slate-100"><Td first>{t(x.t.label)}</Td><Td right>{num(x.gross)}</Td><Td right>{num(x.tax)}</Td></tr>)}
              <tr><Td first className="font-semibold">{t("Total")}</Td><Td right className="font-semibold">{num(sst.reduce((s, x) => s + x.gross, 0))}</Td><Td right className="font-semibold">{num(sstTotal)}</Td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">{t("Service tax")} {num(sst.filter((x) => x.t.kind === "service").reduce((s, x) => s + x.tax, 0))} · {t("sales tax")} {num(sst.filter((x) => x.t.kind === "sales").reduce((s, x) => s + x.tax, 0))}. {t("Worked out from receipt totals that include SST.")}</p>
        </Card>
      </div>
    </div>
  );
}
