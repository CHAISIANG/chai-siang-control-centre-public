"use client";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { TypeTag } from "@/components/hr/ui";
import { addDays, fmtDate, leaveColor, LEAVE_TYPES, weekday } from "@/lib/hr/rules";
import { TODAY } from "@/lib/hr/sample";
import { findEmp, holidaySetFor } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const first = (ym: string) => `${ym}-01`;
const shift = (ym: string, n: number) => { const d = new Date(`${ym}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
const short = (name: string) => name.split(" ")[0];

export default function TeamCalendar() {
  const { data, me } = useHr();
  const LEAVE_REQUESTS = data.requests.filter((r) => findEmp(data, r.empId)?.active);
  const emp = (id: string) => findEmp(data, id)!;
  const myHol = holidaySetFor(data, me.state);
  const [ym, setYm] = useState(TODAY.slice(0, 7));
  const [pick, setPick] = useState<string | null>(null);
  const start = addDays(first(ym), -((weekday(first(ym)) + 6) % 7)); // back to Monday
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const shown = cells.slice(0, Math.ceil((cells.findLastIndex((d) => d.startsWith(ym)) + 1) / 7) * 7); // whole weeks up to the month's last day
  const leaveOn = (d: string) => LEAVE_REQUESTS.filter((r) => (r.status === "Approved" || r.status === "Pending") && d >= r.from && d <= r.to && (r.type === "ML" || (!data.settings.restDays.includes(weekday(d)) && !myHol.has(d))));
  const holiday = (d: string) => data.holidays.find((h) => h.date === d && myHol.has(h.date));
  const monthTitle = new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
  const inMonth = LEAVE_REQUESTS.filter((r) => (r.status === "Approved" || r.status === "Pending") && r.to >= first(ym) && r.from <= `${ym}-31`).sort((a, b) => a.from.localeCompare(b.from));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-slate-900">Team leave calendar</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setYm(shift(ym, -1))} className="rounded-lg border border-slate-300 bg-white p-2 hover:bg-slate-50" aria-label="Previous month"><ChevronLeft size={18} /></button>
          <span className="w-40 text-center font-medium text-slate-900">{monthTitle}</span>
          <button onClick={() => setYm(shift(ym, 1))} className="rounded-lg border border-slate-300 bg-white p-2 hover:bg-slate-50" aria-label="Next month"><ChevronRight size={18} /></button>
          {ym !== TODAY.slice(0, 7) && <button onClick={() => setYm(TODAY.slice(0, 7))} className="ml-1 text-sm font-medium text-blue-600 hover:underline">Today</button>}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-500">{WEEK.map((w) => <div key={w} className="py-2">{w}</div>)}</div>
        <div className="grid grid-cols-7">
          {shown.map((d) => {
            const other = !d.startsWith(ym), h = holiday(d), off = data.settings.restDays.includes(weekday(d)), list = leaveOn(d);
            return (
              <button key={d} onClick={() => setPick(pick === d ? null : d)} aria-label={`${fmtDate(d)}: ${h ? h.name + ", " : ""}${list.length} away`}
                className={`min-h-16 border-b border-r border-slate-100 p-1 text-left align-top sm:min-h-24 sm:p-1.5 ${other ? "bg-slate-50/60 text-slate-400" : off || h ? "bg-slate-50" : "bg-white"} ${pick === d ? "ring-2 ring-inset ring-blue-400" : ""}`}>
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${d === TODAY ? "bg-blue-500 font-semibold text-white" : "text-slate-700"}`}>{Number(d.slice(8))}</span>
                {h && !other && <span className="block truncate text-[11px] font-medium text-rose-700">{h.name}</span>}
                <span className="mt-0.5 flex flex-wrap gap-0.5 sm:block sm:space-y-0.5">
                  {list.slice(0, 3).map((r) => (
                    <span key={r.id} title={`${emp(r.empId).name}: ${LEAVE_TYPES.find((t) => t.code === r.type)!.name}${r.status === "Pending" ? " (pending)" : ""}`}
                      className={`block h-2 w-2 rounded-full sm:h-auto sm:w-auto sm:truncate sm:rounded sm:px-1 sm:text-[11px] sm:text-white ${r.status === "Pending" ? "opacity-60" : ""}`} style={{ background: leaveColor(r.type) }}>
                      <span className="hidden sm:inline">{short(emp(r.empId).name)}</span>
                    </span>
                  ))}
                  {list.length > 3 && <span className="text-[11px] text-slate-500">+{list.length - 3}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">{LEAVE_TYPES.filter((t) => t.code !== "HL").map((t) => <span key={t.code} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />{t.short}</span>)}<span>Faded = waiting for approval</span></div>

      <h2 className="mt-6 text-base font-semibold text-slate-900">{pick ? `Away on ${fmtDate(pick, { weekday: "long", day: "numeric", month: "long" })}` : `Away in ${monthTitle}`}</h2>
      <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {(pick ? leaveOn(pick) : inMonth).length === 0 && <li className="p-4 text-sm text-slate-500">Nobody is on leave{pick ? " that day" : " this month"}.</li>}
        {(pick ? leaveOn(pick) : inMonth).map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <span className="font-medium text-slate-900">{emp(r.empId).name}<span className="ml-2 text-sm font-normal text-slate-500">{emp(r.empId).position}</span></span>
            <span className="flex items-center gap-3 text-sm text-slate-600"><TypeTag t={r.type} />{fmtDate(r.from, { day: "numeric", month: "short" })}{r.to !== r.from ? ` – ${fmtDate(r.to, { day: "numeric", month: "short" })}` : ""}{r.status === "Pending" && <span className="text-amber-700">pending</span>}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-500">Everyone can see who is away; reasons stay private. {data.employees.filter((e) => e.active).length} people.</p>
    </div>
  );
}
