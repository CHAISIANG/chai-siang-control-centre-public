"use client";
import Link from "next/link";
import { CalendarPlus, Clock, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui";
import { BalanceRing, dayTxt, Stat, StatusBadge, TypeTag } from "@/components/hr/ui";
import { fmtDate, fmtHM, hm, isLate, type LeaveType } from "@/lib/hr/rules";
import { TODAY, YEAR } from "@/lib/hr/sample";
import { balance, monthStats, yearEndCarry } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";

export default function MyHR() {
  const { data, me } = useHr();
  const s = data.settings;
  const types: LeaveType[] = ["AL", "SL", "EL", ...(me.gender === "F" ? (["ML"] as LeaveType[]) : []), "HL", "UL"];
  const today = data.attendance.find((a) => a.empId === me.id && a.date === TODAY);
  const m = monthStats(data, me, TODAY.slice(0, 7));
  const mine = data.requests.filter((r) => r.empId === me.id).sort((a, b) => b.appliedAt.localeCompare(a.appliedAt) || b.from.localeCompare(a.from));
  const upcoming = mine.filter((r) => r.to >= TODAY && (r.status === "Approved" || r.status === "Pending")).sort((a, b) => a.from.localeCompare(b.from));
  const al = balance(data, me, "AL");
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hour12: false }).format(new Date()));
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const monthName = new Date(`${TODAY}T00:00:00Z`).toLocaleDateString("en-MY", { month: "long", timeZone: "UTC" });
  const lateAt = fmtHM(hm(s.workStart) + s.lateAfterMin);
  const name = me.name.split(" ")[0];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">{hello}, {name}</h1>
      <p className="text-slate-500">{fmtDate(TODAY, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>

      <div className="mt-4 rounded-2xl bg-blue-500 p-4 text-white shadow-sm">
        <div className="text-sm text-white/80">Today</div>
        {today?.inMin != null
          ? <div className="mt-1 text-lg font-semibold">Clocked in at {fmtHM(today.inMin)}{isLate(today.inMin, s) ? " · late" : ""}{today.outMin != null ? `, out at ${fmtHM(today.outMin)}` : ""}</div>
          : <div className="mt-1 text-lg font-semibold">You have not clocked in yet</div>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href="/hr/clock" className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 font-medium text-blue-600 hover:bg-blue-50"><Clock size={18} /> {today?.outMin != null ? "Today's times" : today?.inMin != null ? "Clock out" : "Clock in"}</Link>
          <Link href="/hr/leave/apply" className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/60 px-3 py-2.5 font-medium text-white hover:bg-white/10"><CalendarPlus size={18} /> Apply leave</Link>
        </div>
      </div>

      <h2 className="mt-6 text-base font-semibold text-slate-900">Leave left in {YEAR}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {types.map((t) => { const b = balance(data, me, t); return <BalanceRing key={t} type={t} left={b.available} total={b.total} used={b.used} pending={b.pending} />; })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {al.carried > 0 && (al.carryLive ? `Annual leave includes ${al.carried} days carried over from last year; use them by ${fmtDate(`${YEAR}-${s.carryExpiry}`, { day: "numeric", month: "long" })}. ` : `Of the ${al.carried} days carried over from last year, ${al.carryUsed} were used before they expired. `)}
        Up to {yearEndCarry(data, me, YEAR)} unused annual days will carry into {YEAR + 1}. Sick and hospitalisation leave share up to 60 days a year.
      </p>

      <h2 className="mt-6 text-base font-semibold text-slate-900">{monthName} so far</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Days present" value={`${m.present}/${m.workDays - m.leaveDays}`} sub={`${m.rate}% attendance`} tone="blue" />
        <Stat label="Late" value={String(m.late)} sub={`after ${lateAt}`} tone={m.late ? "amber" : "slate"} />
        <Stat label="Overtime" value={`${m.otHours} h`} sub="beyond 8 hours a day" />
        <Stat label="On leave" value={String(m.leaveDays)} sub="days this month" />
      </div>

      <Card className="mt-6" title="Coming up" right={<Link href="/hr/calendar" className="text-sm font-medium text-blue-600 hover:underline">Team calendar</Link>}>
        {upcoming.length === 0 ? <p className="text-sm text-slate-500">No leave coming up.</p> : (
          <ul className="divide-y divide-slate-100">
            {upcoming.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><TypeTag t={r.type} /><div className="text-sm text-slate-600">{fmtDate(r.from)}{r.to !== r.from ? ` – ${fmtDate(r.to)}` : ""} · {dayTxt(r.days)}</div></div>
                <StatusBadge s={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="mt-4" title="Recent requests" right={<Link href="/hr/leave" className="inline-flex items-center text-sm font-medium text-blue-600 hover:underline">All <ChevronRight size={16} /></Link>}>
        {mine.length === 0 ? <p className="text-sm text-slate-500">No requests yet.</p> : (
          <ul className="divide-y divide-slate-100">
            {mine.slice(0, 4).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0"><TypeTag t={r.type} /><div className="truncate text-sm text-slate-600">{fmtDate(r.from)} · {dayTxt(r.days)} · {r.reason}</div></div>
                <StatusBadge s={r.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
