// Calculations over the HR data: balances, carry-over and monthly attendance. They read the data passed in,
// so the same code works on sample data now and on the database later.
import { eachDay, entitlement, holidaysFor, isLate, isWorkingDay, leaveDays, overtime, type LeaveType } from "./rules";
import { TODAY, type Employee, type HrData } from "./sample";

export const holidaySetFor = (d: HrData, state: string) => new Set(holidaysFor(d.holidays, state).map((h) => h.date));
export const findEmp = (d: HrData, id: string | null | undefined) => d.employees.find((e) => e.id === id);

const sumDays = (list: { days: number }[]) => list.reduce((s, r) => s + r.days, 0);

/** Annual leave carried into a year: stored if HR set it, otherwise worked out from last year's leftover (capped). */
export function carryInto(d: HrData, e: Employee, year: number): number {
  const stored = d.carry[e.id]?.[year];
  if (stored !== undefined) return stored;
  const prev = d.carry[e.id]?.[year - 1] !== undefined || d.requests.some((r) => r.empId === e.id && r.from.startsWith(String(year - 1)));
  if (!prev || e.joined > `${year - 1}-12-31`) return 0;
  return yearEndCarry(d, e, year - 1);
}
/** What would carry into next year: annual leave left at the end of this year, up to the limit in settings. */
export function yearEndCarry(d: HrData, e: Employee, year: number): number {
  const b = balance(d, e, "AL", year);
  return Math.min(d.settings.carryMaxDays, Math.max(0, (b.total ?? 0) - b.used));
}

/** One employee's balance for a leave type in a year. Pending requests are held back from what is available. */
export function balance(d: HrData, e: Employee, type: LeaveType, year = Number(TODAY.slice(0, 4))) {
  const ent = entitlement(type, e.joined, e.gender, year);
  const mine = d.requests.filter((r) => r.empId === e.id && r.type === type && r.from.startsWith(String(year)));
  const approved = mine.filter((r) => r.status === "Approved");
  const used = sumDays(approved);
  const pending = sumDays(mine.filter((r) => r.status === "Pending"));
  const adjusted = sumDays(d.adjustments.filter((a) => a.empId === e.id && a.type === type && a.at.startsWith(String(year))));
  // carried-over annual leave is used first, and only until the expiry date (31 March by default)
  let carried = 0, carryUsed = 0, carryLive = false;
  if (type === "AL") {
    carried = year === Number(TODAY.slice(0, 4)) || d.carry[e.id]?.[year] !== undefined ? carryInto(d, e, year) : 0;
    const expiry = `${year}-${d.settings.carryExpiry}`;
    // only the days taken on or before the expiry date can use up carried leave
    const hol = holidaySetFor(d, e.state);
    const beforeExpiry = approved.filter((r) => r.from <= expiry).reduce((s, r) => s + (r.to <= expiry ? r.days : leaveDays(r.from, expiry, "", hol, d.settings)), 0);
    carryUsed = Math.min(carried, beforeExpiry);
    carryLive = TODAY <= expiry;
  }
  const carryCounts = carryLive ? carried : carryUsed;
  const total = ent === null ? null : ent + adjusted + carryCounts;
  // sick and hospitalisation leave together: no more than 60 days a year
  let cap = Infinity;
  if (type === "HL" || type === "SL") {
    const other = sumDays(d.requests.filter((r) => r.empId === e.id && r.type === (type === "HL" ? "SL" : "HL") && r.status === "Approved" && r.from.startsWith(String(year))));
    cap = 60 - other - used - pending;
  }
  const available = total === null ? null : Math.max(0, Math.min(total - used - pending, cap));
  return { type, entitled: ent, adjusted, carried, carryUsed, carryLive, used, pending, total, available };
}

export type MonthStats = {
  workDays: number; present: number; late: number; missingOut: number; absent: number;
  leave: Partial<Record<LeaveType, number>>; leaveDays: number; otHours: number; otPaidHours: number; rate: number;
};
/** Attendance figures for one employee in a month (up to today if the month is still running). */
export function monthStats(d: HrData, e: Employee, month: string): MonthStats {
  const hol = holidaySetFor(d, e.state);
  const s0 = d.settings;
  const first = `${month}-01`;
  const lastDay = (() => { const x = new Date(`${first}T00:00:00Z`); x.setUTCMonth(x.getUTCMonth() + 1); x.setUTCDate(0); return x.toISOString().slice(0, 10); })();
  const end = lastDay < TODAY ? lastDay : TODAY;
  const days = end < first ? [] : eachDay(first, end);
  const att = new Map(d.attendance.filter((a) => a.empId === e.id && a.date.startsWith(month)).map((a) => [a.date, a]));
  const s: MonthStats = { workDays: 0, present: 0, late: 0, missingOut: 0, absent: 0, leave: {}, leaveDays: 0, otHours: 0, otPaidHours: 0, rate: 0 };
  for (const day of days) {
    const a = att.get(day);
    if (a?.inMin != null && a.outMin != null) { const ot = overtime(day, a.inMin, a.outMin, hol, s0, e.schedule); s.otHours += ot.hours; s.otPaidHours += ot.hours * ot.rate; }
    if (!isWorkingDay(day, hol, s0, e.schedule)) continue;
    s.workDays++;
    const lv = d.requests.find((r) => r.empId === e.id && r.status === "Approved" && day >= r.from && day <= r.to);
    if (lv) { const part = lv.half ? 0.5 : 1; s.leave[lv.type] = (s.leave[lv.type] ?? 0) + part; s.leaveDays += part; if (!lv.half) continue; }
    if (a?.inMin != null) { s.present++; if (isLate(a.inMin, s0)) s.late++; if (a.outMin == null && day !== TODAY) s.missingOut++; }
    else if (day !== TODAY && !lv) s.absent++;
  }
  const expected = s.workDays - s.leaveDays;
  s.rate = expected > 0 ? Math.min(100, Math.round((s.present / expected) * 100)) : 100;
  return s;
}

/** Who decides a person's leave: their direct manager, or HR when they have none. */
export const approverOf = (d: HrData, e: Employee) => e.managerId ?? d.employees.find((x) => x.role === "hr" && x.id !== e.id)?.id ?? null;
