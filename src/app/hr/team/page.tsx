"use client";
import { useState } from "react";
import { Card, Td, Th } from "@/components/ui";
import { Stat } from "@/components/hr/ui";
import { fmtHM, isLate } from "@/lib/hr/rules";
import { TODAY } from "@/lib/hr/sample";
import { approverOf, balance, monthStats } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";

const n1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function TeamOverview() {
  const { data, me: boss, role } = useHr();
  const [allPick, setAll] = useState(false);
  const all = role === "hr" || allPick; // HR sees the whole company
  const team = data.employees.filter((e) => e.active && (all ? true : approverOf(data, e) === boss.id));
  const ym = TODAY.slice(0, 7);
  const rows = team.map((e) => ({ e, m: monthStats(data, e, ym), al: balance(data, e, "AL"), sl: balance(data, e, "SL"), today: data.attendance.find((a) => a.empId === e.id && a.date === TODAY) }));
  const inToday = rows.filter((r) => r.today?.inMin != null).length;
  const totalOt = rows.reduce((s, r) => s + r.m.otHours, 0);
  const lateTotal = rows.reduce((s, r) => s + r.m.late, 0);
  const avgRate = rows.length ? Math.round(rows.reduce((s, r) => s + r.m.rate, 0) / rows.length) : 0;
  const monthName = new Date(`${TODAY}T00:00:00Z`).toLocaleDateString("en-MY", { month: "long", timeZone: "UTC" });

  if (role === "employee") return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">Team overview is for managers and HR. Switch “Viewing as” to Manager or HR admin to see it.</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">Team overview</h1><p className="text-slate-500">{all ? "Everyone" : `${boss.name.split(" ")[0]}'s team`}, {monthName} so far.</p></div>
        {role === "manager" && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allPick} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4" /> Whole company</label>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="In today" value={`${inToday}/${rows.length}`} tone="blue" />
        <Stat label="Attendance rate" value={`${avgRate}%`} sub="average this month" tone={avgRate >= 95 ? "green" : "amber"} />
        <Stat label="Late arrivals" value={String(lateTotal)} sub="this month" tone={lateTotal ? "amber" : "slate"} />
        <Stat label="Overtime" value={`${n1(totalOt)} h`} sub="this month" />
      </div>

      {/* phone: one card per person */}
      <div className="mt-4 space-y-2 lg:hidden">
        {rows.map(({ e, m, al, sl, today }) => (
          <div key={e.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-900">{e.name}</span><span className={`text-sm ${today?.inMin != null ? "text-emerald-700" : "text-slate-500"}`}>{today?.inMin != null ? `In ${fmtHM(today.inMin)}` : "Not in"}</span></div>
            <div className="text-sm text-slate-500">{e.position}</div>
            <div className="mt-2 grid grid-cols-4 gap-1 text-center text-sm">
              <div><div className="text-xs text-slate-500">Annual left</div><b>{n1(al.available ?? 0)}</b></div>
              <div><div className="text-xs text-slate-500">Attend.</div><b className={m.rate < 95 ? "text-amber-700" : ""}>{m.rate}%</b></div>
              <div><div className="text-xs text-slate-500">Late</div><b className={m.late ? "text-amber-700" : ""}>{m.late}</b></div>
              <div><div className="text-xs text-slate-500">OT</div><b>{n1(m.otHours)} h</b></div>
            </div>
            {sl.used > 0 && <div className="mt-1 text-xs text-slate-500">Sick leave used: {n1(sl.used)} days</div>}
          </div>
        ))}
      </div>

      {/* desktop: one table */}
      <Card className="mt-4 hidden lg:block">
        <table className="w-full">
          <thead className="border-b border-slate-200"><tr><Th first>Employee</Th><Th>Today</Th><Th right>Annual left</Th><Th right>Sick used</Th><Th right>Present</Th><Th right>Attendance</Th><Th right>Late</Th><Th right>Overtime</Th><Th right>Leave days</Th></tr></thead>
          <tbody>
            {rows.map(({ e, m, al, sl, today }) => (
              <tr key={e.id} className="border-b border-slate-100">
                <Td first><div className="font-medium text-slate-900">{e.name}</div><div className="text-sm text-slate-500">{e.position}</div></Td>
                <Td>{today?.inMin != null ? <span className={isLate(today.inMin, data.settings) ? "text-amber-700" : "text-emerald-700"}>In {fmtHM(today.inMin)}</span> : <span className="text-slate-400">Not in</span>}</Td>
                <Td right>{n1(al.available ?? 0)} <span className="text-sm text-slate-400">/ {n1(al.total ?? 0)}</span></Td>
                <Td right>{n1(sl.used)} <span className="text-sm text-slate-400">/ {n1(sl.total ?? 0)}</span></Td>
                <Td right>{m.present} <span className="text-sm text-slate-400">/ {n1(m.workDays - m.leaveDays)}</span></Td>
                <Td right><span className={m.rate < 95 ? "text-amber-700" : ""}>{m.rate}%</span></Td>
                <Td right><span className={m.late ? "text-amber-700" : ""}>{m.late}</span></Td>
                <Td right>{n1(m.otHours)} h</Td>
                <Td right>{n1(m.leaveDays)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
