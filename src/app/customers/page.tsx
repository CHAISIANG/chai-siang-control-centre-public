"use client";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { FileSpreadsheet, Printer, X } from "lucide-react";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { Badge, Card, PageHeader, Td } from "@/components/ui";
import { btnGhost } from "@/components/finui";
import { exportExcel, GridHead, PrintSheet, useGrid, usePrintA4, type ExcelCol, type GridCol, type PrintCol } from "@/components/grid";
import { buckets, fmt, rm, type Customer } from "@/lib/mock";

const byName = (a: Customer, b: Customer) => a.name.localeCompare(b.name);
const late60 = (c: Customer) => c.aging[3] + c.aging[4];
const r2 = (n: number) => Math.round(n * 100) / 100;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

export default function Customers() {
  const { filterSalesman } = useRole();
  const { customers, salesmen, asAt } = useData();
  const [q, setQ] = useState("");
  const [onlyOver, setOnlyOver] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const { pageStyle, print } = usePrintA4();
  const nameOf = (code: string) => salesmen.find((s) => s.code === code)?.name ?? code;
  const base = filterSalesman ? customers.filter((c) => c.salesman === filterSalesman) : customers;
  const listed = base
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => !onlyOver || late60(c) > 0)
    .filter((c) => c.outstanding > 0 || q.length > 0);

  const cols = useMemo<GridCol<Customer>[]>(() => [
    { id: "customer", label: "Customer", kind: "text", value: (c) => `${c.name} ${c.code}` },
    { id: "salesman", label: "Salesman", kind: "pick", value: (c) => c.salesman, options: [...new Set(base.map((c) => c.salesman))].sort().map((code) => ({ code, name: salesmen.find((s) => s.code === code)?.name ?? code })) },
    { id: "ytd", label: "Sales this year", kind: "num", right: true, value: (c) => c.ytdSales },
    { id: "owed", label: "Outstanding", kind: "num", right: true, value: (c) => c.outstanding },
    { id: "late", label: "Late 60+ days", kind: "num", value: late60 },
    ...buckets.map((b, i): GridCol<Customer> => ({ id: `b${i}`, label: b, kind: "num", right: true, value: (c) => c.aging[i] })),
  ], [base, salesmen]);
  const grid = useGrid(listed, cols, { id: "owed", dir: -1 }, byName);
  const rows = grid.rows;
  const shown = showAll ? rows : rows.slice(0, 40);
  const totals = buckets.map((b, i) => ({ bucket: b, value: base.reduce((s, c) => s + c.aging[i], 0) }));
  const tone = ["#9db4c2", "#5f8aa6", "#f5b800", "#e07b1a", "#c0392b"];
  const sums = { ytd: rows.reduce((s, c) => s + c.ytdSales, 0), owed: rows.reduce((s, c) => s + c.outstanding, 0), late: rows.reduce((s, c) => s + late60(c), 0), age: buckets.map((_, i) => rows.reduce((s, c) => s + c.aging[i], 0)) };
  const asAtText = asAt ? `${asAt.slice(8)}/${asAt.slice(5, 7)}/${asAt.slice(0, 4)}` : "";

  const excelCols: ExcelCol<Customer>[] = [
    { label: "Customer code", width: 14, value: (c) => c.code },
    { label: "Customer", width: 38, value: (c) => c.name },
    { label: "Salesman", width: 22, value: (c) => nameOf(c.salesman) },
    { label: "Route", width: 16, value: (c) => c.route },
    { label: "Payment term", width: 14, value: (c) => c.paymentTerm },
    { label: "Sales this year (RM)", width: 18, right: true, money: true, total: true, value: (c) => r2(c.ytdSales) },
    { label: "Outstanding (RM)", width: 16, right: true, money: true, total: true, value: (c) => r2(c.outstanding) },
    { label: "Late 60+ days (RM)", width: 18, right: true, money: true, total: true, value: (c) => r2(late60(c)) },
    ...buckets.map((b, i): ExcelCol<Customer> => ({ label: `${b} (RM)`, width: 15, right: true, money: true, total: true, value: (c) => r2(c.aging[i]) })),
  ];
  const printCols: PrintCol<Customer>[] = [
    { label: "Customer", cell: (c) => <>{c.name} <span style={{ color: "#555" }}>{c.code}</span></> },
    { label: "Salesman", cell: (c) => nameOf(c.salesman) },
    { label: "Sales this year", right: true, cell: (c) => (c.ytdSales ? fmt(Math.round(c.ytdSales)) : "–"), total: fmt(Math.round(sums.ytd)) },
    { label: "Outstanding", right: true, cell: (c) => fmt(Math.round(c.outstanding)), total: fmt(Math.round(sums.owed)) },
    { label: "Late 60+", right: true, cell: (c) => (late60(c) ? fmt(Math.round(late60(c))) : "–"), total: fmt(Math.round(sums.late)) },
    ...buckets.map((b, i): PrintCol<Customer> => ({ label: b, right: true, cell: (c) => (c.aging[i] ? fmt(Math.round(c.aging[i])) : "–"), total: fmt(Math.round(sums.age[i])) })),
  ];
  async function doExport() {
    setBusy(true);
    try { await exportExcel(rows, excelCols, `Customers and aging${asAt ? ` as at ${asAt}` : ""}.xlsx`, "Customers", `Total (${rows.length.toLocaleString()} customers)`); } finally { setBusy(false); }
  }

  return (
    <>
      {pageStyle}
      <div className="no-print">
        <PageHeader title="Customers & Aging" sub={`Who owes us and how late, from the aging report${asAtText ? ` as at ${asAtText}` : ""}. Credit limits are not in the reports yet, so they are not shown.`} />
        <Card title="Total receivable by age (RM)">
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={totals}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8dedf" />
                <XAxis dataKey="bucket" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `${v / 1000}K`} />
                <Tooltip formatter={(v) => rm(Number(v))} />
                <Bar dataKey="value" radius={[3, 3, 0, 0]}>{totals.map((_, i) => <Cell key={i} fill={tone[i]} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="mt-4" title={`Customers (${rows.length}), amounts in RM`}
          right={
            <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
              <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600"><input className="h-5 w-5" type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} /> 60+ days late only</label>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-base sm:flex-none" />
              <button onClick={() => void doExport()} disabled={busy || !rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><FileSpreadsheet size={16} /> Export Excel</button>
              <button onClick={print} disabled={!rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Printer size={16} /> Print A4</button>
            </div>
          }>
          {grid.active.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Showing {plural(rows.length, "customer", "customers")} of {listed.length.toLocaleString()}:</span>
              {grid.active.map((c) => <button key={c.id} onClick={() => grid.setFilter(c.id, {})} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-800 hover:bg-indigo-100">{c.label} <X size={12} /></button>)}
              <button onClick={grid.clearFilters} className="text-indigo-600 hover:underline">Clear all</button>
            </div>
          )}
          <div className="overflow-x-auto pb-24">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>{cols.map((c, k) => <GridHead key={c.id} col={c} grid={grid} first={k === 0} />)}</tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><Td first className="text-slate-500">No customers match.</Td></tr>}
                {shown.map((c) => {
                  const late = late60(c);
                  return (
                    <tr key={c.code} className="border-b border-slate-100 last:border-0">
                      <Td first><b>{c.name}</b><div className="text-xs text-slate-400">{c.code}, {c.route}, {c.paymentTerm}</div></Td>
                      <Td>{salesmen.find((s) => s.code === c.salesman)?.name}</Td>
                      <Td right>{c.ytdSales ? fmt(Math.round(c.ytdSales)) : "–"}</Td><Td right>{fmt(Math.round(c.outstanding))}</Td>
                      <Td>{late > 0 ? <Badge tone={c.aging[4] > 0 ? "red" : "amber"}>{fmt(Math.round(late))}</Badge> : <span className="text-slate-400">–</span>}</Td>
                      {c.aging.map((a, i) => <Td key={i} right className={i === 4 && a > 0 ? "font-medium text-rose-600" : ""}>{a ? fmt(Math.round(a)) : "–"}</Td>)}
                    </tr>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="border-t-2 border-slate-200">
                  <tr className="font-semibold">
                    <Td first>Total ({plural(rows.length, "customer", "customers")})</Td><Td />
                    <Td right>{fmt(Math.round(sums.ytd))}</Td><Td right>{fmt(Math.round(sums.owed))}</Td><Td>{fmt(Math.round(sums.late))}</Td>
                    {sums.age.map((a, i) => <Td key={i} right>{fmt(Math.round(a))}</Td>)}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {rows.length > 40 && (
            <button onClick={() => setShowAll(!showAll)} className="mt-3 w-full rounded-md border border-slate-300 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
              {showAll ? "Show top 40 only" : `Show all ${rows.length} customers`}
            </button>
          )}
        </Card>
      </div>

      <PrintSheet title="Customers & aging" size="8.5pt" rows={rows} cols={printCols} rowKey={(c) => c.code} totalLabel={`Total · ${plural(rows.length, "customer", "customers")}`}
        lines={[`Aging report${asAtText ? ` as at ${asAtText}` : ""} · amounts in RM`, [q.trim() ? `search “${q.trim()}”` : "", onlyOver ? "60+ days late only" : "", grid.describe(nameOf)].filter(Boolean).join(" · ")]} />
    </>
  );
}
