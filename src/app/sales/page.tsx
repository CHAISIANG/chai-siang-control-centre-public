"use client";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { MONTHS, newCustomerSources, NOV, rm, sumStats } from "@/lib/mock";

const COLORS = ["#1f5c8a", "#0ea5e9", "#10b981", "#f59e0b", "#66737b"];

export default function Sales() {
  const { filterSalesman } = useRole();
  const { salesmen } = useData();
  const [mi, setMi] = useState(NOV - 1);
  const list = filterSalesman ? salesmen.filter((s) => s.code === filterSalesman) : salesmen;
  const chart = list.map((s) => ({ name: s.name.split(" ")[0], "RL Acct": s.stats[mi].rl, "Active Acct": s.stats[mi].active }));
  return (
    <>
      <PageHeader title="Sales & KPI" sub="Sales achievement against target, and customer coverage (RL Acct / Active Acct / ERC). From your coverage and net sales report, January to November (November is month to date; it has no target, so October's target is used pro-rata)."
        right={<select className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={mi} onChange={(e) => setMi(Number(e.target.value))} aria-label="Month">{MONTHS.map((m, i) => <option key={m} value={i}>{i === NOV ? "Nov (MTD)" : `${m} 2026`}</option>)}</select>} />
      <Card title={`KPI check · ${MONTHS[mi]}`} className="mb-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr><Th first>Salesman</Th><Th right>Target</Th><Th right>Net sales</Th><Th right>Sales achievement</Th><Th right>Customers reached</Th><Th right>Coverage (ERC)</Th></tr>
            </thead>
            <tbody>
              {[...list.map((s) => ({ name: s.name, st: s.stats[mi] })), ...(list.length > 1 ? [{ name: "Total", st: sumStats(list, mi) }] : [])].map((r) => {
                const ach = r.st.target ? Math.round((r.st.sales / r.st.target) * 1000) / 10 : 0;
                const erc = r.st.rl ? Math.round((r.st.active / r.st.rl) * 1000) / 10 : 0;
                return (
                  <tr key={r.name} className={`border-b border-slate-100 ${r.name === "Total" ? "font-semibold" : ""}`}>
                    <Td first>{r.name}</Td>
                    <Td right>{rm(r.st.target)}</Td>
                    <Td right>{rm(r.st.sales)}</Td>
                    <Td right><Badge tone={ach >= 100 ? "green" : ach >= 80 ? "amber" : "red"}>{ach}%</Badge></Td>
                    <Td right>{r.st.active} of {r.st.rl}</Td>
                    <Td right><Badge tone={erc >= 70 ? "green" : erc >= 50 ? "amber" : "red"}>{erc}%</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`RL accounts vs active accounts · ${MONTHS[mi]}`} className="lg:col-span-2">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8dedf" />
                <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="RL Acct" fill="#bfc8cb" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Active Acct" fill="#1f5c8a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card title="New customers by source (sample)">
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={newCustomerSources} dataKey="value" nameKey="source" innerRadius={45} outerRadius={80}>
                  {newCustomerSources.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {newCustomerSources.map((s, i) => (
              <li key={s.source} className="flex items-center justify-between"><span className="flex items-center gap-2"><i className="inline-block h-2 w-2 rounded-full" style={{ background: COLORS[i] }} />{s.source}</span><b>{s.value}</b></li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Coverage by month" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr><Th first>Salesman</Th><Th>Measure</Th>{MONTHS.slice(0, NOV).map((m) => <Th key={m} right>{m}</Th>)}</tr>
            </thead>
            <tbody>
              {list.flatMap((s) => [
                { k: "RL Acct", f: (i: number) => String(s.stats[i].rl) },
                { k: "Active Acct", f: (i: number) => String(s.stats[i].active) },
                { k: "ERC (%)", f: (i: number) => String(s.stats[i].erc) },
              ].map((row, ri) => (
                <tr key={s.code + row.k} className={`border-b border-slate-100 ${ri === 2 ? "border-slate-200" : ""}`}>
                  <Td first>{ri === 0 ? <><b>{s.name}</b> <span className="text-xs text-slate-400">{s.code}</span></> : ""}</Td>
                  <Td>{row.k}</Td>
                  {MONTHS.slice(0, NOV).map((_, i) => (
                    <Td key={i} right>{row.k === "ERC (%)" ? <Badge tone={s.stats[i].erc >= 70 ? "green" : s.stats[i].erc >= 50 ? "amber" : "red"}>{row.f(i)}</Badge> : row.f(i)}</Td>
                  ))}
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
