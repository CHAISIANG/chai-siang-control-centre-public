"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, Search, X } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { btnGhost, inputCls } from "@/components/finui";
import { useData } from "@/components/data";
import { bucketOf, daysLate, isSupermarketChannel, salesmanCode, type AgingExtras, type AgingInv } from "@/lib/finAging";
import { useAging, useAgingExtras } from "@/lib/finAgingStore";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const r2 = (n: number) => Math.round(n * 100) / 100;
const PAGE = 100;

type Row = { cust: string; name: string; rep: string; invoices: number; owed: number; overdue: number; oldest: number; over60: number; supermarket: boolean; settledN: number; settledAmt: number };
type SortId = "name" | "rep" | "invoices" | "owed" | "overdue" | "oldest";
type Tab = "all" | "overdue" | "over60" | "supermarket";
const TABS: { id: Tab; label: string; test: (r: Row) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "overdue", label: "Has overdue", test: (r) => r.overdue > 0 },
  { id: "over60", label: "Over 60 days", test: (r) => r.over60 > 0 },
  { id: "supermarket", label: "Supermarkets", test: (r) => r.supermarket },
];

/** One row per customer from the aging report: what they owe, what is overdue, and how late the oldest invoice is. */
function byCustomer(list: AgingInv[], extras: AgingExtras): Row[] {
  const m = new Map<string, Row>();
  for (const i of list) {
    const d = daysLate(i);
    const c = m.get(i.cust) ?? { cust: i.cust, name: i.customer, rep: salesmanCode(i.agent), invoices: 0, owed: 0, overdue: 0, oldest: 0, over60: 0, supermarket: isSupermarketChannel(extras.channel[i.cust]), settledN: 0, settledAmt: 0 };
    c.invoices++; c.owed += i.owed;
    if (extras.settled[i.doc]) { c.settledN++; c.settledAmt += i.owed; }
    if (bucketOf(d) > 0) c.overdue += i.owed;
    if (bucketOf(d) >= 3) c.over60 += i.owed;
    c.oldest = Math.max(c.oldest, d);
    m.set(i.cust, c);
  }
  return [...m.values()].map((c) => ({ ...c, owed: r2(c.owed), overdue: r2(c.overdue), over60: r2(c.over60), settledAmt: r2(c.settledAmt) }));
}

export default function Clients() {
  const { list, asAt, loading, sample, error } = useAging();
  const { salesmen } = useData();
  const extras = useAgingExtras();
  const [q, setQ] = useState("");
  const [rep, setRep] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [sort, setSort] = useState<{ id: SortId; dir: 1 | -1 }>({ id: "overdue", dir: -1 });
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const name = useMemo(() => { const m = new Map(salesmen.map((s) => [s.code, s.name])); return (code: string) => m.get(code) ?? (code || "–"); }, [salesmen]);
  const all = useMemo(() => byCustomer(list, extras), [list, extras]);
  const reps = useMemo(() => [...new Set(all.map((r) => r.rep))].sort(), [all]);
  const rows = useMemo(() => {
    const k = q.trim().toLowerCase();
    const test = TABS.find((t) => t.id === tab)!.test;
    const out = all.filter((r) => test(r) && (!rep || r.rep === rep) && (!k || `${r.name} ${r.cust}`.toLowerCase().includes(k)));
    const v = (r: Row) => (sort.id === "rep" ? name(r.rep) : r[sort.id]);
    return out.sort((a, b) => { const x = v(a), y = v(b); return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir || a.name.localeCompare(b.name); });
  }, [all, q, rep, tab, sort, name]);
  const sum = useMemo(() => ({ owed: r2(rows.reduce((t, r) => t + r.owed, 0)), overdue: r2(rows.reduce((t, r) => t + r.overdue, 0)), withOverdue: rows.filter((r) => r.overdue > 0).length }), [rows]);
  const sortBy = (id: SortId) => { setSort((s) => (s.id === id ? { id, dir: (s.dir * -1) as 1 | -1 } : { id, dir: id === "name" || id === "rep" ? 1 : -1 })); setShown(PAGE); };
  const head = (id: SortId, label: string, right = false, first = false) => (
    <Th first={first} right={right}>
      <button onClick={() => sortBy(id)} className="inline-flex items-center gap-1 hover:text-slate-900" aria-label={`Sort by ${label}`}>
        {label}{sort.id === id ? (sort.dir === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} className="text-slate-300" />}
      </button>
    </Th>
  );

  async function exportExcel() {
    if (!rows.length) return;
    setBusy(true);
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const h = (t: string, right = false) => ({ value: t, fontWeight: "bold" as const, align: right ? ("right" as const) : undefined });
      const data = [
        [h("Customer code"), h("Customer"), h("Channel"), h("Salesman"), h("Open invoices", true), h("Owed (RM)", true), h("Overdue (RM)", true), h("Marked settled (RM)", true), h("Oldest (days late)", true)],
        ...rows.map((r) => [{ value: r.cust }, { value: r.name }, { value: r.supermarket ? "Supermarket" : "" }, { value: name(r.rep) }, { value: r.invoices, format: "0" }, { value: r.owed, format: "#,##0.00" }, { value: r.overdue, format: "#,##0.00" }, { value: r.settledAmt, format: "#,##0.00" }, { value: Math.max(0, r.oldest), format: "0" }]),
      ];
      await writeExcelFile([{ sheet: "Clients", columns: [14, 40, 14, 24, 13, 15, 15, 18, 17].map((width) => ({ width })), data }]).toFile(`Clients as at ${asAt || "latest"}.xlsx`);
    } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Clients" sub={asAt ? `Customers with open invoices, from the aging report as at ${day(asAt)}. Click a customer to see their invoices.` : "Customers with open invoices."} />
      {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data (made up).</p>}
      {error && <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Could not read the aging report: {error}</p>}
      <KpiStrip>
        <Kpi label="Customers" value={rows.length.toLocaleString()} sub={tab === "all" && !q && !rep ? "with open invoices" : "matching the filters"} />
        <Kpi label="With overdue" value={sum.withOverdue.toLocaleString()} tone={sum.withOverdue ? "warn" : "good"} sub="past their due date" />
        <Kpi label="Owed" value={`RM ${money(sum.owed)}`} sub="all open invoices" />
        <Kpi label="Overdue" value={`RM ${money(sum.overdue)}`} tone={sum.overdue ? "bad" : "good"} sub="past due, as the aging shows it" />
      </KpiStrip>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search size={16} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} placeholder="Search name or code" aria-label="Search customers" className={`${inputCls} !mt-0 !py-2 !pl-8 !text-sm`} />
          {q && <button onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"><X size={15} /></button>}
        </div>
        <select value={rep} onChange={(e) => { setRep(e.target.value); setShown(PAGE); }} aria-label="Salesman" className={`${inputCls} !mt-0 !w-auto !py-2 !text-sm`}>
          <option value="">All salesmen</option>
          {reps.map((c) => <option key={c} value={c}>{name(c)}</option>)}
        </select>
        <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
          {TABS.map((t) => <button key={t.id} onClick={() => { setTab(t.id); setShown(PAGE); }} className={`rounded px-3 py-1 ${tab === t.id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.label}</button>)}
        </div>
        <button onClick={() => void exportExcel()} disabled={busy || !rows.length} className={`${btnGhost} ml-auto inline-flex items-center gap-2 !px-3 !py-2 !text-sm`}><FileSpreadsheet size={16} /> Export Excel</button>
      </div>

      <Card className="mt-3">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr>{head("name", "Customer", false, true)}{head("rep", "Salesman")}{head("invoices", "Open invoices", true)}{head("owed", "Owed", true)}{head("overdue", "Overdue", true)}{head("oldest", "Oldest (days late)", true)}</tr></thead>
            <tbody>
              {loading && <tr><Td first className="text-slate-500">Loading…</Td></tr>}
              {!loading && rows.length === 0 && <tr><Td first className="text-slate-500">{all.length ? "No customer matches." : "No open invoices."}</Td></tr>}
              {rows.slice(0, shown).map((r) => (
                <tr key={r.cust} className="border-b border-slate-100 hover:bg-slate-50">
                  <Td first><Link href={`/finance/clients/${encodeURIComponent(r.cust)}`} className="font-medium text-indigo-700 hover:underline">{r.name}</Link><div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">{r.cust}{r.supermarket && <Badge tone="blue">Supermarket</Badge>}</div></Td>
                  <Td>{name(r.rep)}</Td>
                  <Td right>{r.invoices}</Td>
                  <Td right className="font-medium text-slate-900">{money(r.owed)}</Td>
                  <Td right className={r.overdue ? "font-medium text-rose-700" : "text-slate-400"}>{money(r.overdue)}{r.settledN > 0 && <div className="text-xs font-normal text-emerald-700">RM {money(r.settledAmt)} marked settled</div>}</Td>
                  <Td right className={r.oldest > 60 ? "font-medium text-rose-700" : r.oldest > 0 ? "text-amber-700" : "text-slate-400"}>{r.oldest > 0 ? r.oldest : "–"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length > shown && <div className="mt-3 text-center"><button onClick={() => setShown((n) => n + PAGE)} className={`${btnGhost} !px-3 !py-1.5 !text-sm`}>Show more ({(rows.length - shown).toLocaleString()} left)</button></div>}
      </Card>
    </>
  );
}
