"use client";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart, Legend } from "recharts";
import { ScoreBadge, useAr } from "@/components/ar";
import { Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { useState } from "react";
import { balanceOf, bucketOf, BUCKETS, daysPastDue, dsoSeries, isOpen, paidOf, recoverySeries, SCORE_NOTE, scoreFor } from "@/lib/ar";
import { money } from "@/lib/finance";

export default function Reports() {
  const { customers, invoices, today, customer, currency } = useAr();
  const [busy, setBusy] = useState(false);
  const recovery = recoverySeries(invoices, today);

  async function exportExcel() {
    setBusy(true);
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const head = (t: string) => ({ value: t, fontWeight: "bold" as const, backgroundColor: "#e9eded" });
    const open = invoices.filter(isOpen);
    const total = open.reduce((s, i) => s + balanceOf(i), 0);
    const aging = BUCKETS.map((b, k) => {
      const list = open.filter((i) => bucketOf(i, today) === k);
      const amt = list.reduce((s, i) => s + balanceOf(i), 0);
      return [{ value: b.label }, { value: list.length, type: Number }, { value: amt, type: Number, format: "#,##0.00" }, { value: total ? amt / total : 0, type: Number, format: "0.0%" }];
    });
    await writeExcelFile([
      { sheet: "Aging summary", data: [[head("Bucket"), head("Invoices"), head("Balance (RM)"), head("% of AR")], ...aging, [{ value: "Total", fontWeight: "bold" }, { value: open.length, type: Number }, { value: total, type: Number, format: "#,##0.00", fontWeight: "bold" }, { value: 1, type: Number, format: "0.0%" }]], columns: [{ width: 18 }, { width: 10 }, { width: 16 }, { width: 10 }] },
      { sheet: "Open invoices", data: [[head("Invoice"), head("Customer"), head("Issued"), head("Due"), head("Days past due"), head("Aging"), head("Total (RM)"), head("Paid (RM)"), head("Balance (RM)")],
        ...open.sort((a, b) => daysPastDue(b, today) - daysPastDue(a, today)).map((i) => [{ value: i.no }, { value: customer(i.customerId).name }, { value: i.issue }, { value: i.due }, { value: Math.max(0, daysPastDue(i, today)), type: Number }, { value: BUCKETS[bucketOf(i, today)].label }, { value: i.total, type: Number, format: "#,##0.00" }, { value: paidOf(i), type: Number, format: "#,##0.00" }, { value: balanceOf(i), type: Number, format: "#,##0.00" }])],
        columns: [{ width: 16 }, { width: 32 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }] },
      { sheet: "Customer scores", data: [[head("Customer"), head("Score"), head("Worst lateness (days)"), head("Late invoices"), head("Owes now (RM)")],
        ...rows.map((r) => [{ value: r.c.name }, { value: r.score }, { value: Math.max(0, r.worstDays), type: Number }, { value: r.late, type: Number }, { value: r.owed, type: Number, format: "#,##0.00" }])],
        columns: [{ width: 32 }, { width: 8 }, { width: 20 }, { width: 14 }, { width: 16 }] },
      { sheet: "Recovery rate", data: [[head("Month"), head("Billed (RM)"), head("Collected (RM)"), head("Recovery rate")],
        ...recovery.map((r) => [{ value: r.month }, { value: r.billed, type: Number, format: "#,##0.00" }, { value: r.collected, type: Number, format: "#,##0.00" }, { value: r.billed > 0 ? r.collected / r.billed : 0, type: Number, format: "0.0%" }])],
        columns: [{ width: 10 }, { width: 16 }, { width: 16 }, { width: 14 }] },
    ]).toFile(`ar-report-${today}.xlsx`);
    setBusy(false);
  }

  const last = recovery[recovery.length - 1];
  const trend = dsoSeries(invoices, today);
  const rows = customers.map((c) => {
    const s = scoreFor(c.id, invoices, today);
    const mine = invoices.filter((i) => i.customerId === c.id);
    const open = mine.filter(isOpen);
    return { c, ...s, billed: mine.reduce((t, i) => t + i.total, 0), owed: open.reduce((t, i) => t + balanceOf(i), 0), late: open.filter((i) => daysPastDue(i, today) > 0).length };
  }).sort((a, b) => b.worstDays - a.worstDays);

  return (
    <>
      <PageHeader title="Reports" sub="How well we are collecting, and which customers pay on time."
        right={<button disabled={busy} onClick={() => void exportExcel()} className="rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "Preparing…" : "Export to Excel"}</button>} />
      <KpiStrip cols="lg:grid-cols-3">
        <Kpi label={`Recovery rate · ${last.month}`} value={last.rate === null ? "—" : `${last.rate}%`} sub="Collected as a share of billed that month" tone={(last.rate ?? 0) >= 75 ? "good" : "warn"} pct={last.rate ?? 0} />
        <Kpi label="Days sales outstanding" value={`${trend[trend.length - 1].dso} days`} sub="Last 90 days" />
        <Kpi label="Customers rated C or D" value={String(rows.filter((r) => r.score === "C" || r.score === "D").length)} sub={`of ${rows.length} customers`} tone="warn" />
      </KpiStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Monthly recovery rate" right={<span className="text-sm text-slate-500">Billed this month vs payments received this month</span>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recovery}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8dedf" />
                <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} tickFormatter={(v: number) => `${v / 1000}k`} />
                <Tooltip formatter={(v) => money(Number(v), currency)} />
                <Legend />
                <Bar dataKey="billed" name="Billed" fill="#bfc8cb" radius={[3, 3, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#4f46e5" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-sm text-slate-500">Recovery rate: {recovery.map((r) => `${r.month} ${r.rate === null ? "no billing" : r.rate + "%"}`).join(" · ")}</p>
        </Card>
        <Card title="DSO trend" right={<span className="text-sm text-slate-500">Lower is better</span>}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8dedf" />
                <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} domain={[0, "dataMax + 10"]} />
                <Tooltip formatter={(v) => `${v} days`} />
                <Line type="monotone" dataKey="dso" name="DSO (days)" stroke="#4f46e5" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card title="Customer payment behaviour" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th>Score</Th><Th>What it means</Th><Th right>Worst lateness</Th><Th right>Late invoices</Th><Th right>Owes now</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.c.id} className="border-b border-slate-100">
                  <Td first className="font-medium text-slate-900">{r.c.name}</Td>
                  <Td><ScoreBadge score={r.score} /></Td>
                  <Td className="text-slate-600">{SCORE_NOTE[r.score]}</Td>
                  <Td right>{r.worstDays > 0 ? `${r.worstDays} days` : "on time"}</Td>
                  <Td right>{r.late}</Td>
                  <Td right>{money(r.owed, currency)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-500">Score uses each customer&rsquo;s worst case: the latest payment, or an invoice still unpaid. A: never late. B: up to 14 days. C: 15 to 45 days. D: over 45 days. D-rated customers trigger a warning when you place a new order for them.</p>
      </Card>
    </>
  );
}
