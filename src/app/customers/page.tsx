"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { buckets, fmt, pct, rm } from "@/lib/mock";

export default function Customers() {
  const { filterSalesman } = useRole();
  const { customers, salesmen } = useData();
  const [q, setQ] = useState("");
  const [onlyOver, setOnlyOver] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const base = filterSalesman ? customers.filter((c) => c.salesman === filterSalesman) : customers;
  const rows = base
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()) || c.code.toLowerCase().includes(q.toLowerCase()))
    .filter((c) => !onlyOver || c.outstanding > c.creditLimit)
    .sort((a, b) => b.outstanding / b.creditLimit - a.outstanding / a.creditLimit);
  const shown = showAll ? rows : rows.slice(0, 40);
  const totals = buckets.map((b, i) => ({ bucket: b, value: base.reduce((s, c) => s + c.aging[i], 0) }));
  const tone = ["#9db4c2", "#5f8aa6", "#f5b800", "#e07b1a", "#c0392b"];

  return (
    <>
      <PageHeader title="Customers, Aging & Credit Limit" sub="Outstanding balances by age and credit utilisation" />
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
          <div className="flex w-full items-center gap-3 sm:w-auto">
            <label className="flex shrink-0 items-center gap-2 text-sm text-slate-600"><input className="h-5 w-5" type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} /> Over limit only</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / code" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-base sm:flex-none" />
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr><Th first>Customer</Th><Th>Salesman</Th><Th right>Credit limit</Th><Th right>Outstanding</Th><Th>Credit used</Th>{buckets.map((b) => <Th key={b} right>{b}</Th>)}</tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const u = pct(c.outstanding, c.creditLimit);
                return (
                  <tr key={c.code} className="border-b border-slate-100 last:border-0">
                    <Td first><b>{c.name}</b><div className="text-xs text-slate-400">{c.code}, {c.route}, {c.paymentTerm}</div></Td>
                    <Td>{salesmen.find((s) => s.code === c.salesman)?.name}</Td>
                                        <Td right>{fmt(c.creditLimit)}</Td><Td right>{fmt(c.outstanding)}</Td>
                    <Td><Badge tone={u > 100 ? "red" : u > 80 ? "amber" : "green"}>{u}%{u > 100 ? " over" : ""}</Badge></Td>
                    {c.aging.map((a, i) => <Td key={i} right className={i === 4 && a > 0 ? "font-medium text-rose-600" : ""}>{a ? fmt(a) : "–"}</Td>)}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length > 40 && (
          <button onClick={() => setShowAll(!showAll)} className="mt-3 w-full rounded-md border border-slate-300 py-1.5 text-sm text-slate-600 hover:bg-slate-50">
            {showAll ? "Show top 40 only" : `Show all ${rows.length} customers`}
          </button>
        )}
      </Card>
    </>
  );
}
