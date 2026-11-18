"use client";
import { useState } from "react";
import { Download } from "lucide-react";
import { Card, Td, Th } from "@/components/ui";
import { btnBlue } from "@/components/hr/ui";
import { LEAVE_TYPES } from "@/lib/hr/rules";
import { TODAY, YEAR } from "@/lib/hr/sample";
import { balance, monthStats } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";

const n1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function Reports() {
  const { data, role } = useHr();
  const [ym, setYm] = useState(TODAY.slice(0, 7));
  const [tab, setTab] = useState<"month" | "leave">("month");
  const staff = data.employees.filter((e) => e.active);
  const rows = staff.map((e) => ({ e, m: monthStats(data, e, ym) }));
  const types = LEAVE_TYPES.filter((t) => t.code !== "ML" || staff.some((e) => e.gender === "F"));
  const months = Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, "0")}`).filter((m) => m <= TODAY.slice(0, 7));
  const monthName = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });

  function exportCsv() {
    const head = ["Employee code", "Name", "Work days", "Days present", "Late count", "Overtime hours", "Overtime hours x rate", ...types.map((t) => `${t.name} (days)`)];
    const body = rows.map(({ e, m }) => [e.code, e.name, m.workDays, m.present, m.late, m.otHours, m.otPaidHours, ...types.map((t) => m.leave[t.code] ?? 0)]);
    // UTF-8 with a byte-order mark, so Excel shows names with accents and symbols correctly
    const text = "﻿" + [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `Attendance ${ym}.csv` });
    a.click(); URL.revokeObjectURL(url);
  }

  if (role !== "hr") return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">Reports are for HR. Switch “Viewing as” to HR admin to see them.</p>;
  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">HR reports</h1><p className="text-slate-500">Monthly attendance, overtime and leave, ready for payroll.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">{([["month", "Monthly attendance"], ["leave", `Leave used in ${YEAR}`]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{l}</button>)}</div>
          {tab === "month" && <select value={ym} onChange={(e) => setYm(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm" aria-label="Month">{months.slice().reverse().map((m) => <option key={m} value={m}>{monthName(m)}</option>)}</select>}
          {tab === "month" && <button onClick={exportCsv} className={`${btnBlue} !py-2 text-sm`}><Download size={16} /> Export CSV</button>}
        </div>
      </div>

      {tab === "month" ? (
        <Card className="mt-4" title={monthName(ym)} right={ym === TODAY.slice(0, 7) ? <span className="text-sm text-slate-500">Month in progress, up to today</span> : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Code</Th><Th>Name</Th><Th right>Work days</Th><Th right>Present</Th><Th right>Late</Th><Th right>No clock-out</Th><Th right>OT hours</Th><Th right>OT × rate</Th>{types.map((t) => <Th key={t.code} right>{t.short}</Th>)}</tr></thead>
              <tbody>
                {rows.map(({ e, m }) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <Td first>{e.code}</Td><Td className="whitespace-nowrap">{e.name}</Td>
                    <Td right>{m.workDays}</Td><Td right>{m.present}</Td>
                    <Td right><span className={m.late ? "text-amber-700" : ""}>{m.late}</span></Td>
                    <Td right><span className={m.missingOut ? "font-medium text-rose-700" : "text-slate-400"}>{m.missingOut}</span></Td>
                    <Td right>{n1(m.otHours)}</Td><Td right>{n1(m.otPaidHours)}</Td>
                    {types.map((t) => <Td key={t.code} right><span className={m.leave[t.code] ? "" : "text-slate-300"}>{n1(m.leave[t.code] ?? 0)}</span></Td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-slate-500">OT × rate adds the multiplier: {data.settings.otWeekday} on working days, {data.settings.otRestDay} on rest days, {data.settings.otPublicHoliday} on public holidays. Rows with “no clock-out” need fixing in Employees before payroll.</p>
        </Card>
      ) : (
        <Card className="mt-4" title={`Leave used and left, ${YEAR}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Name</Th>{types.filter((t) => t.code !== "UL").map((t) => <Th key={t.code} right>{t.short} used / total</Th>)}<Th right>Unpaid used</Th></tr></thead>
              <tbody>
                {staff.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <Td first className="whitespace-nowrap">{e.name}</Td>
                    {types.filter((t) => t.code !== "UL").map((t) => { const b = balance(data, e, t.code); return <Td key={t.code} right>{b.total ? <>{n1(b.used)} <span className="text-sm text-slate-400">/ {n1(b.total)}</span></> : <span className="text-slate-300">–</span>}</Td>; })}
                    <Td right>{n1(balance(data, e, "UL").used)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
