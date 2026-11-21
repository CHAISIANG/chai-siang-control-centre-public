"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, FileSpreadsheet, ListFilter, Printer, Search, X } from "lucide-react";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { btnGhost, inputCls } from "@/components/finui";
import { useData } from "@/components/data";
import { bucketOf, daysLate, salesmanCode, totalsOf, type AgingInv } from "@/lib/finAging";
import { useAging } from "@/lib/finAgingStore";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
type Tab = "all" | "notdue" | "overdue" | "over60" | "over90";
const TABS: { id: Tab; label: string; test: (d: number) => boolean }[] = [
  { id: "all", label: "All", test: () => true },
  { id: "notdue", label: "Not due", test: (d) => d <= 0 },
  { id: "overdue", label: "Overdue", test: (d) => d > 0 },
  { id: "over60", label: "Over 60 days", test: (d) => d > 60 },
  { id: "over90", label: "Over 90 days", test: (d) => d > 90 },
];
const PAGE = 100;

// ---------- columns: what each one shows, how it sorts and how it filters ----------
type ColId = "doc" | "customer" | "rep" | "date" | "due" | "late" | "owed";
type Kind = "text" | "pick" | "date" | "num";
type Col = { id: ColId; label: string; kind: Kind; right?: boolean };
const COLS: Col[] = [
  { id: "doc", label: "Invoice", kind: "text" },
  { id: "customer", label: "Customer", kind: "text" },
  { id: "rep", label: "Salesman", kind: "pick" },
  { id: "date", label: "Date", kind: "date" },
  { id: "due", label: "Due", kind: "date" },
  { id: "late", label: "Days late", kind: "num", right: true },
  { id: "owed", label: "Owed", kind: "num", right: true },
];
type Filter = { text?: string; pick?: string[]; from?: string; to?: string; min?: string; max?: string };
const filled = (s?: string) => !!s && s.trim() !== "";
const isActive = (f?: Filter) => !!f && (filled(f.text) || !!f.pick?.length || !!f.from || !!f.to || filled(f.min) || filled(f.max));

/** One column title: click the name to sort, click the funnel to filter. */
function Head({ col, sort, onSort, filter, onFilter, reps, first }: {
  col: Col; sort: { id: ColId; dir: 1 | -1 }; onSort: () => void; filter?: Filter; onFilter: (f: Filter) => void; reps: { code: string; name: string }[]; first?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const on = isActive(filter);
  const sorted = sort.id === col.id;
  const f = filter ?? {};
  const numIn = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800";
  return (
    <Th first={first} right={col.right}>
      <span className={`relative inline-flex items-center gap-1 ${col.right ? "flex-row-reverse" : ""}`}>
        <button onClick={onSort} className="inline-flex items-center gap-1 hover:text-slate-900" aria-label={`Sort by ${col.label}`}>
          {col.label}
          {sorted ? (sort.dir === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} className="text-slate-300" />}
        </button>
        <button onClick={() => setOpen((o) => !o)} aria-label={`Filter ${col.label}`} aria-expanded={open}
          className={`rounded p-0.5 ${on ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}><ListFilter size={14} /></button>
        {open && (
          <>
            <span className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
            <span className={`absolute top-full z-30 mt-1 block w-60 rounded-lg border border-slate-200 bg-white p-3 text-left text-sm font-normal normal-case tracking-normal text-slate-700 shadow-lg ${col.right ? "right-0" : "left-0"}`}>
              <span className="block font-medium text-slate-900">Filter {col.label.toLowerCase()}</span>
              {col.kind === "text" && <input autoFocus className={numIn} placeholder="Contains…" value={f.text ?? ""} onChange={(e) => onFilter({ ...f, text: e.target.value })} />}
              {col.kind === "pick" && (
                <span className="mt-1 block max-h-56 overflow-y-auto">
                  {reps.map((r) => (
                    <label key={r.code} className="flex cursor-pointer items-center gap-2 py-1">
                      <input type="checkbox" className="h-4 w-4" checked={!!f.pick?.includes(r.code)} onChange={(e) => onFilter({ ...f, pick: e.target.checked ? [...(f.pick ?? []), r.code] : (f.pick ?? []).filter((c) => c !== r.code) })} />
                      <span>{r.name}</span>
                    </label>
                  ))}
                </span>
              )}
              {col.kind === "date" && (
                <span className="mt-1 block space-y-1.5">
                  <label className="block">From<input type="date" className={numIn} value={f.from ?? ""} onChange={(e) => onFilter({ ...f, from: e.target.value })} /></label>
                  <label className="block">To<input type="date" className={numIn} value={f.to ?? ""} onChange={(e) => onFilter({ ...f, to: e.target.value })} /></label>
                </span>
              )}
              {col.kind === "num" && (
                <span className="mt-1 block space-y-1.5">
                  <label className="block">At least<input inputMode="decimal" className={numIn} value={f.min ?? ""} onChange={(e) => onFilter({ ...f, min: e.target.value })} /></label>
                  <label className="block">At most<input inputMode="decimal" className={numIn} value={f.max ?? ""} onChange={(e) => onFilter({ ...f, max: e.target.value })} /></label>
                  {col.id === "late" && <span className="block text-xs text-slate-500">Below 0 means not due yet.</span>}
                </span>
              )}
              <span className="mt-2 flex justify-between">
                <button onClick={() => onFilter({})} disabled={!on} className="text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline">Clear</button>
                <button onClick={() => setOpen(false)} className="font-medium text-slate-700 hover:underline">Done</button>
              </span>
            </span>
          </>
        )}
      </span>
    </Th>
  );
}

const cellValue = (i: AgingInv, id: ColId): string | number => {
  switch (id) {
    case "doc": return i.doc;
    case "customer": return `${i.customer} ${i.cust}`;
    case "rep": return salesmanCode(i.agent);
    case "date": return i.docDate ?? "";
    case "due": return i.due ?? "";
    case "late": return daysLate(i);
    case "owed": return i.owed;
  }
};

/** Every open invoice in the latest aging report. */
export default function Invoices() {
  const { list, asAt, loading, sample, error } = useAging();
  const { salesmen } = useData();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? ""));
  const [filters, setFilters] = useState<Partial<Record<ColId, Filter>>>({});
  const [sort, setSort] = useState<{ id: ColId; dir: 1 | -1 }>({ id: "late", dir: -1 });
  const [shown, setShown] = useState(PAGE);
  const [printing, setPrinting] = useState(false);
  const [busy, setBusy] = useState(false);
  const name = useMemo(() => { const m = new Map(salesmen.map((s) => [s.code, s.name])); return (code: string) => m.get(code) ?? code; }, [salesmen]);

  const reps = useMemo(() => [...new Set(list.map((i) => salesmanCode(i.agent)))].filter(Boolean).sort().map((code) => ({ code, name: `${name(code)} (${code.slice(-2)})` })), [list, name]);
  const counts = useMemo(() => Object.fromEntries(TABS.map((t) => [t.id, list.filter((i) => t.test(daysLate(i))).length])) as Record<Tab, number>, [list]);

  const rows = useMemo(() => {
    const test = TABS.find((t) => t.id === tab)!.test;
    const k = q.trim().toLowerCase();
    const num = (s?: string) => (filled(s) && Number.isFinite(Number(s)) ? Number(s) : null);
    const out = list.filter((i) => {
      if (!test(daysLate(i))) return false;
      if (k && !`${i.doc} ${i.customer} ${i.cust}`.toLowerCase().includes(k)) return false;
      for (const c of COLS) {
        const f = filters[c.id];
        if (!f || !isActive(f)) continue;
        const v = cellValue(i, c.id);
        if (c.kind === "text" && filled(f.text) && !String(v).toLowerCase().includes(f.text!.trim().toLowerCase())) return false;
        if (c.kind === "pick" && f.pick?.length && !f.pick.includes(String(v))) return false;
        if (c.kind === "date") { if (f.from && (!v || String(v) < f.from)) return false; if (f.to && (!v || String(v) > f.to)) return false; }
        if (c.kind === "num") { const lo = num(f.min), hi = num(f.max); if (lo !== null && Number(v) < lo) return false; if (hi !== null && Number(v) > hi) return false; }
      }
      return true;
    });
    return out.sort((a, b) => {
      const x = cellValue(a, sort.id), y = cellValue(b, sort.id);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
      return (c || a.doc.localeCompare(b.doc, "en", { numeric: true })) * sort.dir;
    });
  }, [list, tab, q, filters, sort]);
  const sum = useMemo(() => totalsOf(rows), [rows]);
  const activeFilters = COLS.filter((c) => isActive(filters[c.id]));
  const anyNarrowing = activeFilters.length > 0 || tab !== "all" || q.trim() !== "";

  const clickSort = (id: ColId) => setSort((s) => (s.id === id ? { id, dir: (s.dir * -1) as 1 | -1 } : { id, dir: 1 }));
  const setFilter = (id: ColId, f: Filter) => { setFilters((cur) => ({ ...cur, [id]: f })); setShown(PAGE); };
  const clearAll = () => { setFilters({}); setTab("all"); setQ(""); setShown(PAGE); };

  /** The filters in plain words, for the printout. */
  const describe = () => {
    const parts: string[] = [];
    if (tab !== "all") parts.push(TABS.find((t) => t.id === tab)!.label);
    if (q.trim()) parts.push(`search “${q.trim()}”`);
    for (const c of activeFilters) {
      const f = filters[c.id]!;
      if (filled(f.text)) parts.push(`${c.label} contains “${f.text!.trim()}”`);
      if (f.pick?.length) parts.push(`${c.label}: ${f.pick.map((p) => name(p)).join(", ")}`);
      if (f.from || f.to) parts.push(`${c.label} ${f.from ? `from ${day(f.from)}` : ""} ${f.to ? `to ${day(f.to)}` : ""}`.replace(/\s+/g, " ").trim());
      if (filled(f.min) || filled(f.max)) parts.push(`${c.label} ${filled(f.min) ? `at least ${f.min!.trim()}` : ""} ${filled(f.max) ? `at most ${f.max!.trim()}` : ""}`.replace(/\s+/g, " ").trim());
    }
    return parts.length ? parts.join(" · ") : "No filters";
  };

  async function exportExcel() {
    if (!rows.length) return;
    setBusy(true);
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const head = (t: string, right = false) => ({ value: t, fontWeight: "bold" as const, align: right ? ("right" as const) : undefined });
      const d = (s: string | null) => (s ? { value: new Date(`${s}T00:00:00Z`), format: "dd/mm/yyyy" } : { value: "" });
      const data = [
        [head("Invoice"), head("Customer code"), head("Customer"), head("Salesman"), head("Invoice date"), head("Due date"), head("Days late", true), head("Owed (RM)", true)],
        ...rows.map((i) => [
          { value: i.doc }, { value: i.cust }, { value: i.customer }, { value: name(salesmanCode(i.agent)) }, d(i.docDate), d(i.due),
          { value: Math.max(0, daysLate(i)), format: "0" }, { value: i.owed, format: "#,##0.00" },
        ]),
        [{ value: `Total (${rows.length.toLocaleString()} invoices)`, fontWeight: "bold" as const }, {}, {}, {}, {}, {}, {}, { value: sum.owed, format: "#,##0.00", fontWeight: "bold" as const }],
      ];
      await writeExcelFile([{ sheet: "Invoices", columns: [14, 14, 38, 24, 13, 13, 11, 15].map((width) => ({ width })), data }]).toFile(`Open invoices as at ${asAt || "latest"}.xlsx`);
    } finally { setBusy(false); }
  }
  function printA4() {
    setPrinting(true); // landscape A4 for this printout only
    setTimeout(() => { window.print(); setPrinting(false); }, 80);
  }

  return (
    <>
      {printing && <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>}
      <div className="no-print">
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
            <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <label className="relative w-full sm:w-60"><span className="sr-only">Search invoices</span>
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input className={`${inputCls} !mt-0 !pl-9`} placeholder="Search invoice or customer" value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} />
              </label>
              <button onClick={() => void exportExcel()} disabled={busy || !rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-2 !text-sm`}><FileSpreadsheet size={16} /> Export Excel</button>
              <button onClick={printA4} disabled={!rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-2 !text-sm`}><Printer size={16} /> Print A4</button>
            </div>
          </div>
          {anyNarrowing && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Showing {plural(rows.length, "invoice", "invoices")} of {list.length.toLocaleString()}:</span>
              {activeFilters.map((c) => <button key={c.id} onClick={() => setFilter(c.id, {})} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-800 hover:bg-indigo-100">{c.label} <X size={12} /></button>)}
              <button onClick={clearAll} className="text-indigo-600 hover:underline">Clear all</button>
            </div>
          )}
          <div className="overflow-x-auto pb-24">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  {COLS.map((c, k) => <Head key={c.id} col={c} first={k === 0} sort={sort} onSort={() => clickSort(c.id)} filter={filters[c.id]} onFilter={(f) => setFilter(c.id, f)} reps={reps} />)}
                </tr>
              </thead>
              <tbody>
                {loading && <tr><Td first className="text-slate-500">Loading…</Td></tr>}
                {!loading && rows.length === 0 && <tr><Td first className="text-slate-500">No invoices match.</Td></tr>}
                {rows.slice(0, shown).map((i) => {
                  const d = daysLate(i), b = bucketOf(d);
                  return (
                    <tr key={i.doc} className="border-b border-slate-100 hover:bg-slate-50">
                      <Td first className="whitespace-nowrap font-medium"><Link href={`/tracker?q=${encodeURIComponent(i.doc)}`} className="text-indigo-700 hover:underline" title="Track this invoice and open its delivery proof">{i.doc}</Link></Td>
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
              {rows.length > 0 && <tfoot className="border-t-2 border-slate-200"><tr><Td first className="font-semibold">{plural(rows.length, "invoice", "invoices")} · {plural(sum.customers, "customer", "customers")}</Td><Td /><Td /><Td /><Td /><Td /><Td right className="font-semibold">RM {money(sum.owed)}</Td></tr></tfoot>}
            </table>
          </div>
          {rows.length > shown && <div className="mt-3 text-center"><button onClick={() => setShown((n) => n + PAGE)} className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Show {Math.min(PAGE, rows.length - shown)} more ({(rows.length - shown).toLocaleString()} left)</button></div>}
        </Card>
      </div>

      {/* The printout: every invoice that matches, not just the ones on screen. */}
      <div id="fin-inv-print" className="hidden print:block" style={{ fontSize: "9pt", color: "#111" }}>
        <h1 style={{ fontSize: "14pt", fontWeight: 700, margin: 0 }}>Open invoices</h1>
        <p style={{ margin: "2px 0" }}>Aging report as at {day(asAt)} · printed {day(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()))}</p>
        <p style={{ margin: "2px 0 8px" }}>{describe()} · sorted by {COLS.find((c) => c.id === sort.id)!.label.toLowerCase()} {sort.dir === 1 ? "(low to high)" : "(high to low)"}</p>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead style={{ display: "table-header-group" }}>
            <tr>{COLS.map((c) => <th key={c.id} style={{ textAlign: c.right ? "right" : "left", borderBottom: "1.5px solid #111", padding: "3px 5px", fontWeight: 700 }}>{c.label}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((i) => {
              const d = daysLate(i);
              return (
                <tr key={i.doc} style={{ breakInside: "avoid" }}>
                  <td style={{ padding: "2px 5px", borderBottom: "0.5px solid #bbb", whiteSpace: "nowrap" }}>{i.doc}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "0.5px solid #bbb" }}>{i.customer} <span style={{ color: "#555" }}>{i.cust}</span></td>
                  <td style={{ padding: "2px 5px", borderBottom: "0.5px solid #bbb" }}>{name(salesmanCode(i.agent))}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "0.5px solid #bbb", whiteSpace: "nowrap" }}>{day(i.docDate)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "0.5px solid #bbb", whiteSpace: "nowrap" }}>{day(i.due)}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "0.5px solid #bbb", textAlign: "right" }}>{d > 0 ? d : "not due"}</td>
                  <td style={{ padding: "2px 5px", borderBottom: "0.5px solid #bbb", textAlign: "right" }}>{money(i.owed)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr><td colSpan={6} style={{ padding: "4px 5px", borderTop: "1.5px solid #111", fontWeight: 700 }}>Total · {plural(rows.length, "invoice", "invoices")} · {plural(sum.customers, "customer", "customers")}</td><td style={{ padding: "4px 5px", borderTop: "1.5px solid #111", fontWeight: 700, textAlign: "right" }}>RM {money(sum.owed)}</td></tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
