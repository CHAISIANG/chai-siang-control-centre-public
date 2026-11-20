"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { useData } from "@/components/data";
import { BUCKET_NAMES, bySalesman, salesmanCode, topOverdue, totalsOf } from "@/lib/finAging";
import { useAging } from "@/lib/finAgingStore";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const barTone = ["bg-slate-300", "bg-amber-300", "bg-amber-500", "bg-rose-400", "bg-rose-600"];

/** What customers owe us today, from the latest aging report. */
export default function FinanceOverview() {
  const { list, asAt, loading, sample, error } = useAging();
  const { salesmen } = useData();
  const name = (code: string) => salesmen.find((s) => s.code === code)?.name ?? code;
  const tot = useMemo(() => totalsOf(list), [list]);
  const reps = useMemo(() => bySalesman(list), [list]);
  const top = useMemo(() => topOverdue(list, 10), [list]);
  const share = (v: number) => (tot.owed ? (v / tot.owed) * 100 : 0);

  return (
    <>
      <PageHeader title="Finance" sub={asAt ? `What customers owe us, from the aging report as at ${day(asAt)}.` : "What customers owe us."}
        right={<Link href="/finance/invoices" className="rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700">All invoices</Link>} />
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">The aging could not be loaded: {error}</p>}
      {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data, not the real aging.</p>}
      <KpiStrip>
        <Kpi label="Owed to us" value={`RM ${money(tot.owed)}`} sub={`${tot.invoices.toLocaleString()} open invoices from ${tot.customers.toLocaleString()} customers`} />
        <Kpi label="Overdue" value={`RM ${money(tot.overdue)}`} tone={tot.overdue ? "bad" : "good"} pct={share(tot.overdue)} sub={`${share(tot.overdue).toFixed(1)}% of what is owed`} />
        <Kpi label="Over 60 days late" value={`RM ${money(tot.over60)}`} tone={tot.over60 ? "bad" : "good"} sub="Needs the most attention" />
        <Kpi label="Customers overdue" value={tot.overdueCustomers.toLocaleString()} tone={tot.overdueCustomers ? "warn" : "good"} sub={`of ${tot.customers.toLocaleString()} owing`} />
      </KpiStrip>

      <Card title="Aging" className="mt-4" right={<span className="text-sm text-slate-500">Days past the due date</span>}>
        {loading ? <p className="text-slate-500">Loading…</p> : (
          <>
            <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100" role="img" aria-label="Share of what is owed in each age group">
              {tot.buckets.map((v, k) => <div key={k} className={barTone[k]} style={{ width: `${share(v)}%` }} title={`${BUCKET_NAMES[k]}: RM ${money(v)}`} />)}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {BUCKET_NAMES.map((b, k) => (
                <div key={b} className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-sm text-slate-600"><span className={`inline-block h-2.5 w-2.5 rounded-sm ${barTone[k]}`} />{b}</div>
                  <div className="mt-0.5 font-semibold tabular-nums text-slate-900">RM {money(tot.buckets[k])}</div>
                  <div className="text-xs text-slate-500">{share(tot.buckets[k]).toFixed(1)}%</div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="By salesman" right={<span className="text-sm text-slate-500">Most overdue first</span>}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Salesman</Th><Th right>Owed</Th><Th right>Overdue</Th><Th right>Over 60</Th></tr></thead>
              <tbody>
                {reps.length === 0 && <tr><Td first className="text-slate-500">Nothing owed.</Td></tr>}
                {reps.map((r) => (
                  <tr key={r.code} className="border-b border-slate-100">
                    <Td first>{name(r.code)}<div className="text-xs text-slate-500">{r.code.slice(-2)} · {r.customers} {r.customers === 1 ? "customer" : "customers"}</div></Td>
                    <Td right>{money(r.owed)}</Td>
                    <Td right className={r.overdue ? "font-medium text-amber-700" : "text-slate-300"}>{r.overdue ? money(r.overdue) : "–"}</Td>
                    <Td right className={r.over60 ? "font-semibold text-rose-700" : "text-slate-300"}>{r.over60 ? money(r.over60) : "–"}</Td>
                  </tr>
                ))}
              </tbody>
              {reps.length > 0 && <tfoot className="border-t-2 border-slate-200"><tr><Td first className="font-semibold">Total</Td><Td right className="font-semibold">{money(tot.owed)}</Td><Td right className="font-semibold">{money(tot.overdue)}</Td><Td right className="font-semibold">{money(tot.over60)}</Td></tr></tfoot>}
            </table>
          </div>
        </Card>

        <Card title="Customers to chase" right={<Link href="/followup" className="text-sm text-indigo-600 hover:underline">Collection follow-up</Link>}>
          {top.length === 0 ? <p className="text-slate-500">Nothing is overdue.</p> : (
            <ul className="divide-y divide-slate-100">
              {top.map((c) => (
                <li key={c.cust} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/finance/invoices?q=${encodeURIComponent(c.cust)}`} className="font-medium text-slate-900 hover:underline">{c.customer}</Link>
                    <div className="truncate text-sm text-slate-500">{c.cust} · {name(salesmanCode(c.agent))} · {c.invoices} {c.invoices === 1 ? "invoice" : "invoices"}</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums text-slate-800">RM {money(c.overdue)}</div>
                    <Badge tone={c.oldest > 90 ? "red" : c.oldest > 30 ? "amber" : "grey"}>oldest {c.oldest} {c.oldest === 1 ? "day" : "days"} late</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
        <Link href="/finance/credit" className="text-indigo-600 hover:underline">Credit approvals</Link>
        <Link href="/finance/sap-import" className="text-indigo-600 hover:underline">SAP invoice import</Link>
        <Link href="/finance/issued" className="text-indigo-600 hover:underline">Invoices made in this app</Link>
      </div>
    </>
  );
}
