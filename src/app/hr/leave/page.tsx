"use client";
import { useState } from "react";
import Link from "next/link";
import { CalendarPlus, Paperclip } from "lucide-react";
import { StatusBadge, TypeTag, btnBlue, dayTxt } from "@/components/hr/ui";
import { fmtDate, LEAVE_TYPES, type LeaveType } from "@/lib/hr/rules";
import { YEAR, type LeaveStatus } from "@/lib/hr/sample";
import { findEmp } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";

export default function MyLeave() {
  const { data, me, cancelLeave } = useHr();
  const mine = data.requests.filter((r) => r.empId === me.id && !r.calendarOnly);
  const years = [...new Set([YEAR, ...mine.map((r) => Number(r.from.slice(0, 4)))])].sort((a, b) => b - a);
  const [year, setYear] = useState(YEAR);
  const [status, setStatus] = useState<LeaveStatus | "">("");
  const [type, setType] = useState<LeaveType | "">("");
  const list = mine
    .filter((r) => r.from.startsWith(String(year)) && (!status || r.status === status) && (!type || r.type === type))
    .sort((a, b) => b.from.localeCompare(a.from));
  const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">My leave</h1><p className="text-slate-500">Every request you have made, newest first.</p></div>
        <Link href="/hr/leave/apply" className={btnBlue}><CalendarPlus size={18} /> Apply leave</Link>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={sel} aria-label="Year">{years.map((y) => <option key={y}>{y}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value as LeaveStatus | "")} className={sel} aria-label="Status"><option value="">All statuses</option>{(["Pending", "Approved", "Rejected", "Cancelled"] as const).map((s) => <option key={s}>{s}</option>)}</select>
        <select value={type} onChange={(e) => setType(e.target.value as LeaveType | "")} className={sel} aria-label="Type"><option value="">All types</option>{LEAVE_TYPES.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}</select>
      </div>
      <ul className="mt-4 space-y-2">
        {list.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-slate-500">No requests match. <Link href="/hr/leave/apply" className="font-medium text-blue-600 hover:underline">Apply for leave</Link></li>}
        {list.map((r) => (
          <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <TypeTag t={r.type} />
                <div className="mt-0.5 font-medium text-slate-900">{fmtDate(r.from)}{r.to !== r.from ? ` – ${fmtDate(r.to)}` : ""}{r.half ? ` (${r.half === "AM" ? "morning" : "afternoon"})` : ""}</div>
                <div className="text-sm text-slate-600">{dayTxt(r.days)} · {r.reason}</div>
              </div>
              <StatusBadge s={r.status} />
            </div>
            {r.mcFile && <div className="mt-2 inline-flex items-center gap-1 text-sm text-slate-600"><Paperclip size={14} /> {r.mcFile}</div>}
            {r.status === "Rejected" && r.decisionNote && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">Reason: {r.decisionNote}</p>}
            {r.decidedBy && r.status !== "Pending" && <p className="mt-1 text-xs text-slate-500">{r.status} by {r.decidedByName ?? findEmp(data, r.decidedBy)?.name ?? "HR"}</p>}
            {r.status === "Pending" && <button onClick={() => { if (confirm("Cancel this request? The days go back to your balance.")) void cancelLeave(r.id); }} className="mt-2 text-sm font-medium text-rose-700 hover:underline">Cancel request</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
