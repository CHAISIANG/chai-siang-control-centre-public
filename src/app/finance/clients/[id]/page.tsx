"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { UnpostedNote } from "@/components/credit/UnpostedNote";
import { useData } from "@/components/data";
import { BUCKET_NAMES, bucketOf, daysLate, isSupermarketChannel, salesmanCode, SAMPLE_UNPOSTED } from "@/lib/finAging";
import { fullCustomerCode, useAging, useAgingExtras } from "@/lib/finAgingStore";
import { loadUnposted } from "@/lib/creditStore";
import type { Unposted } from "@/lib/credit";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const r2 = (n: number) => Math.round(n * 100) / 100;

/** One customer from the aging report: totals, the age of what they owe, and each open invoice. */
export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const cust = decodeURIComponent(id);
  const { list, asAt, loading, sample } = useAging();
  const { salesmen } = useData();
  const extras = useAgingExtras();
  const [liveUnposted, setLiveUnposted] = useState<Unposted[] | undefined>();
  // receipts in the daily payment file that are not posted in the aging yet (the database works it out; empty for people who may not see it)
  useEffect(() => {
    if (sample) return;
    let on = true;
    void loadUnposted([fullCustomerCode(cust)]).then((m) => { if (on) setLiveUnposted(m.get(fullCustomerCode(cust))); });
    return () => { on = false; };
  }, [sample, cust]);
  const mine = list.filter((i) => i.cust === cust).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "") || a.doc.localeCompare(b.doc));
  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!mine.length) return <p className="text-slate-500">No open invoices for this customer. <Link href="/finance/clients" className="text-indigo-600 underline">Back to clients</Link></p>;
  const first = mine[0];
  const rep = salesmanCode(first.agent);
  const repName = salesmen.find((s) => s.code === rep)?.name ?? (rep || "–");
  const buckets = [0, 0, 0, 0, 0];
  for (const i of mine) buckets[bucketOf(daysLate(i))] += i.owed;
  const owed = r2(buckets.reduce((a, b) => a + b, 0));
  const overdue = r2(buckets.slice(1).reduce((a, b) => a + b, 0));
  const oldest = Math.max(...mine.map(daysLate));
  const unposted = sample ? SAMPLE_UNPOSTED[cust] : liveUnposted;
  const supermarket = isSupermarketChannel(extras.channel[cust]);
  const settledList = mine.filter((i) => extras.settled[i.doc]);
  const settledAmt = r2(settledList.reduce((t, i) => t + i.owed, 0));
  const settledOverdue = r2(settledList.filter((i) => daysLate(i) > 0).reduce((t, i) => t + i.owed, 0));
  return (
    <>
      <Link href="/finance/clients" className="mb-2 inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"><ArrowLeft size={15} /> Clients</Link>
      <PageHeader title={first.customer} right={supermarket ? <Badge tone="blue">Supermarket</Badge> : undefined} sub={`${cust} · salesman ${repName} · aging report as at ${day(asAt)}`} />
      {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data (made up).</p>}
      <KpiStrip>
        <Kpi label="Owed" value={`RM ${money(owed)}`} sub={`${mine.length} open ${mine.length === 1 ? "invoice" : "invoices"}`} />
        <Kpi label="Overdue" value={`RM ${money(overdue)}`} tone={overdue ? "bad" : "good"} sub="past due" />
        <Kpi label="Oldest invoice" value={oldest > 0 ? `${oldest} days late` : "Not late"} tone={oldest > 60 ? "bad" : oldest > 0 ? "warn" : "good"} />
        <Kpi label="Over 60 days" value={`RM ${money(r2(buckets[3] + buckets[4]))}`} tone={buckets[3] + buckets[4] ? "bad" : "good"} />
      </KpiStrip>
      {supermarket ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <b className="font-medium text-slate-900">Supermarket: paid by collection summary.</b> The aging is knocked off by hand twice a month, so it can show more than is really owed.
          {settledList.length > 0
            ? <> Finance has marked <b className="font-medium text-emerald-800">{settledList.length} {settledList.length === 1 ? "invoice" : "invoices"} (RM {money(settledAmt)}) settled</b>{settledOverdue > 0 ? <>, RM {money(settledOverdue)} of it overdue in the aging. Still overdue and not settled: <b className="font-medium text-rose-700">RM {money(r2(Math.max(0, overdue - settledOverdue)))}</b>.</> : "."}</>
            : " Nothing has been marked settled yet."}
        </div>
      ) : <UnpostedNote overdue={overdue} unposted={unposted} />}
      <div className="mt-4 grid grid-cols-5 gap-1 text-center text-xs">
        {BUCKET_NAMES.map((b, i) => (
          <div key={b} className={`rounded px-1 py-1.5 ${buckets[i] ? (i === 0 ? "bg-slate-100 text-slate-700" : i >= 3 ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900") : "bg-slate-50 text-slate-400"}`}>
            <div>{b}</div><div className="font-semibold">{buckets[i] ? money(r2(buckets[i])) : "–"}</div>
          </div>
        ))}
      </div>
      <Card className="mt-4" title="Open invoices">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Date</Th><Th>Due</Th><Th right>Days late</Th><Th right>Owed</Th>{supermarket && <Th>Settled</Th>}</tr></thead>
            <tbody>
              {mine.map((i) => {
                const d = daysLate(i);
                return (
                  <tr key={i.doc} className="border-b border-slate-100">
                    <Td first className="font-medium text-slate-900">{i.doc}</Td>
                    <Td>{day(i.docDate)}</Td>
                    <Td>{day(i.due)}</Td>
                    <Td right className={d > 60 ? "font-medium text-rose-700" : d > 0 ? "text-amber-700" : "text-slate-400"}>{d > 0 ? d : "–"}</Td>
                    <Td right className="font-medium text-slate-900">{money(i.owed)}</Td>
                    {supermarket && <Td>{extras.settled[i.doc] ? <div><Badge tone="green">Settled {day(extras.settled[i.doc].on)}</Badge>{extras.settled[i.doc].ref && <div className="mt-0.5 text-xs text-slate-500">{extras.settled[i.doc].ref}</div>}</div> : <span className="text-slate-400">–</span>}</Td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
