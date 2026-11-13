"use client";
import Link from "next/link";
import { bucketCls, ScoreBadge, useAr } from "@/components/ar";
import { Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { balanceOf, bucketOf, BUCKETS, daysPastDue, dso, isOpen } from "@/lib/ar";
import { money } from "@/lib/finance";

export default function Aging() {
  const { invoices, customers, score, today, currency } = useAr();
  const open = invoices.filter(isOpen);
  const totalAr = open.reduce((s, i) => s + balanceOf(i), 0);
  const overdue = open.filter((i) => daysPastDue(i, today) > 0).reduce((s, i) => s + balanceOf(i), 0);
  const buckets = BUCKETS.map((b, k) => {
    const list = open.filter((i) => bucketOf(i, today) === k);
    const amount = list.reduce((s, i) => s + balanceOf(i), 0);
    return { ...b, count: list.length, amount, pct: totalAr ? (amount / totalAr) * 100 : 0 };
  });
  const debtors = customers.map((c) => {
    const mine = open.filter((i) => i.customerId === c.id);
    return { c, owed: mine.reduce((s, i) => s + balanceOf(i), 0), late: mine.filter((i) => daysPastDue(i, today) > 0).reduce((s, i) => s + balanceOf(i), 0), n: mine.length };
  }).filter((d) => d.owed > 0).sort((a, b) => b.owed - a.owed).slice(0, 10);
  const maxOwed = debtors[0]?.owed || 1;

  return (
    <>
      <PageHeader title="Who owes us" sub="Money still to collect, grouped by how many days past the due date." />
      <KpiStrip cols="lg:grid-cols-3">
        <Kpi label="Total receivable" value={money(totalAr, currency)} sub={`${open.length} open invoices`} />
        <Kpi label="Total overdue" value={money(overdue, currency)} tone={overdue ? "bad" : "good"} pct={totalAr ? (overdue / totalAr) * 100 : 0} sub={`${totalAr ? Math.round((overdue / totalAr) * 100) : 0}% of receivables`} />
        <Kpi label="Days sales outstanding" value={`${dso(invoices, 90, today)} days`} sub="Average time to get paid, last 90 days" />
      </KpiStrip>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {buckets.map((b) => {
          const cls = bucketCls[b.tone];
          return (
            <Link key={b.key} href="/finance/ar/invoices" className={`block rounded-xl border p-4 transition hover:shadow-sm ${cls.card}`}>
              <div className={`text-base font-semibold ${cls.text}`}>{b.label}</div>
              <div className="text-sm text-slate-500">{b.range === "late" ? "days past due" : "past due, includes not yet due"}</div>
              <div className="mt-2 font-display text-[28px] font-semibold leading-tight text-slate-900">{money(b.amount, currency)}</div>
              <div className="mt-1 text-[15px] text-slate-600">{b.count} invoice{b.count === 1 ? "" : "s"} · {b.pct.toFixed(0)}% of total</div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-sm bg-white/70"><div className={`h-full ${cls.bar}`} style={{ width: `${b.pct}%` }} /></div>
            </Link>
          );
        })}
      </div>

      <Card title="Top debtors" className="mt-4" right={<span className="text-sm text-slate-500">Largest balances first</span>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>#</Th><Th>Customer</Th><Th>Payment record</Th><Th right>Open invoices</Th><Th right>Overdue</Th><Th>Balance</Th></tr></thead>
            <tbody>
              {debtors.length === 0 && <tr><Td first className="text-slate-500">Nothing is owed right now.</Td></tr>}
              {debtors.map((d, n) => (
                <tr key={d.c.id} className="border-b border-slate-100">
                  <Td first className="text-slate-400">{n + 1}</Td>
                  <Td><span className="font-medium text-slate-900">{d.c.name}</span></Td>
                  <Td><ScoreBadge score={score(d.c.id)} /></Td>
                  <Td right>{d.n}</Td>
                  <Td right className={d.late ? "font-medium text-rose-700" : "text-slate-400"}>{money(d.late, currency)}</Td>
                  <Td className="min-w-48">
                    <div className="flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-sm bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${(d.owed / maxOwed) * 100}%` }} /></div><span className="w-28 text-right tabular-nums text-slate-800">{money(d.owed, currency)}</span></div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
