"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { inputCls } from "@/components/finui";
import { useData } from "@/components/data";
import { bucketOf, daysLate, salesmanCode, totalsOf } from "@/lib/finAging";
import { useAging } from "@/lib/finAgingStore";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
type Tab = "all" | "notdue" | "overdue" | "over60" | "over90";
const TABS: { id: Tab; label: string; test: (d: number) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "notdue", label: "Not due", test: (d) => d <= 0 },
  { id: "overdue", label: "Overdue", test: (d) => d > 0 },
  { id: "over60", label: "Over 60 days", test: (d) => d > 60 },
  { id: "over90", label: "Over 90 days", test: (d) => d > 90 },
];
const PAGE = 100;

/** Every open invoice in the latest aging report. */
export default function Invoices() {
  const { list, asAt, loading, sample, error } = useAging();
  const { salesmen } = useData();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? ""));
  const [rep, setRep] = useState("");
  const [shown, setShown] = useState(PAGE);
  const name = (code: string) => salesmen.find((s) => s.code === code)?.name ?? code;

  const reps = useMemo(() => [...new Set(list.map((i) => salesmanCode(i.agent)))].filter(Boolean).sort(), [list]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, list.filter((i) => t.test(daysLate(i))).length])) as Record<Tab, number>, [list]);
  const rows = useMemo(() => {
    const test = TABS.find((t) => t.id === tab)!.test;
    const k = q.trim().toLowerCase();
    return list
      .filter((i) => test(daysLate(i)) && (!rep || salesmanCode(i.agent) === rep) && (!k || `${i.doc} ${i.customer} ${i.cust}`.toLowerCase().includes(k)))
      .sort((a, b) => daysLate(b) - daysLate(a) || a.doc.localeCompare(b.doc));
  }, [list, tab, q, rep]);
  const sum = useMemo(() => totalsOf(rows), [rows]);

  return (
    <>
      <PageHeader title="Invoices" sub={asAt ? `Open invoices from the aging report as at ${day(asAt)}. Paid invoices are not listed.` : "Open invoices."}
        right={<Link href="/finance/invoices/issued" className="text-sm text-indigo-600 hover:underline">Invoices made in this app</Link>} />
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">The aging could not be loaded: {error}</p>}
      {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data, not the real aging.</p>}
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Filter by age" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setShown(PAGE); }}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${tab === t.id ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
                {t.label} <span className="opacity-70">{counts[t.id].toLocaleString()}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
            <label className="sm:w-52"><span className="sr-only">Salesman</span>
              <select className={`${inputCls} !mt-0`} value={rep} onChange={(e) => { setRep(e.target.value); setShown(PAGE); }}>
                <option value="">All salesmen</option>
                {reps.map((r) => <option key={r} value={r}>{name(r)} ({r.slice(-2)})</option>)}
              </select>
            </label>
            <label className="relative w-full sm:w-64"><span className="sr-only">Search invoices</span>
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={`${inputCls} !mt-0 !pl-9`} placeholder="Search invoice or customer" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
            </label>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Customer</Th><Th>Salesman</Th><Th>Date</Th><Th>Due</Th><Th right>Days late</Th><Th right>Owed</Th></tr></thead>
            <tbody>
              {loading && <tr><Td first className="text-slate-500">Loading…</Td></tr>}
              {!loading && rows.length === 0 && <tr><Td first className="text-slate-500">No invoices match.</Td></tr>}
              {rows.slice(0, shown).map((i) => {
                const d = daysLate(i), b = bucketOf(d);
                return (
                  <tr key={i.doc} className="border-b border-slate-100 hover:bg-slate-50">
                    <Td first className="whitespace-nowrap font-medium text-slate-900">{i.doc}</Td>
                    <Td>{i.customer}<div className="text-xs text-slate-500">{i.cust}</div></Td>
                    <Td>{name(salesmanCode(i.agent))}</Td>
                    <Td className="whitespace-nowrap">{day(i.docDate)}</Td>
                    <Td className="whitespace-nowrap">{day(i.due)}</Td>
                    <Td right>{d > 0 ? <Badge tone={b >= 3 ? "red" : "amber"}>{d} {d === 1 ? "day" : "days"}</Badge> : <span className="text-slate-400">not due</span>}</Td>
                    <Td right className="font-medium text-slate-900">{money(i.owed)}</Td>
                  </tr>
                );
              })}
            </tbody>
            {rows.length > 0 && <tfoot className="border-t-2 border-slate-200"><tr><Td first className="font-semibold">{rows.length.toLocaleString()} {rows.length === 1 ? "invoice" : "invoices"} · {sum.customers.toLocaleString()} customers</Td><Td /><Td /><Td /><Td /><Td /><Td right className="font-semibold">RM {money(sum.owed)}</Td></tr></tfoot>}
          </table>
        </div>
        {rows.length > shown && <div className="mt-3 text-center"><button onClick={() => setShown((n) => n + PAGE)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Show {Math.min(PAGE, rows.length - shown)} more ({(rows.length - shown).toLocaleString()} left)</button></div>}
      </Card>
    </>
  );
}
