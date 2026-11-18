// HR rules for Chai Siang Sdn Bhd, following the Employment Act 1955 (as amended 2022).
// All dates are plain "YYYY-MM-DD" strings in Malaysia time (Asia/Kuala_Lumpur), so a day never shifts.

export type LeaveType = "AL" | "SL" | "HL" | "EL" | "ML" | "UL";
export const LEAVE_TYPES: { code: LeaveType; name: string; short: string; color: string }[] = [
  { code: "AL", name: "Annual leave", short: "Annual", color: "#3B82F6" },
  { code: "SL", name: "Sick leave", short: "Sick", color: "#10B981" },
  { code: "HL", name: "Hospitalisation leave", short: "Hospital", color: "#14B8A6" },
  { code: "EL", name: "Emergency leave", short: "Emergency", color: "#F59E0B" },
  { code: "ML", name: "Maternity leave", short: "Maternity", color: "#EC4899" },
  { code: "UL", name: "Unpaid leave", short: "Unpaid", color: "#94A3B8" },
];
export const leaveName = (t: LeaveType) => LEAVE_TYPES.find((x) => x.code === t)!.name;
export const leaveColor = (t: LeaveType) => LEAVE_TYPES.find((x) => x.code === t)!.color;

export type Settings = {
  workStart: string; workEnd: string; lunchStart: string; lunchEnd: string;
  lateAfterMin: number;            // late if clocked in more than this many minutes after start
  gpsRequired: boolean; gpsRadiusM: number; officeLat: number; officeLng: number;
  carryMaxDays: number; carryExpiry: string; // "MM-DD": carried-over annual leave must be used by this date
  otWeekday: number; otRestDay: number; otPublicHoliday: number;
  restDays: number[];              // 0 = Sunday ... 6 = Saturday
};
export const DEFAULT_SETTINGS: Settings = {
  workStart: "09:00", workEnd: "18:00", lunchStart: "13:00", lunchEnd: "14:00", lateAfterMin: 15,
  gpsRequired: false, gpsRadiusM: 200, officeLat: 3.2389, officeLng: 101.6802,
  carryMaxDays: 5, carryExpiry: "03-31", otWeekday: 1.5, otRestDay: 2.0, otPublicHoliday: 3.0, restDays: [0, 6],
};

// ---------- dates ----------
const DAY = 86400000;
export const toDate = (s: string) => new Date(`${s}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => iso(new Date(toDate(s).getTime() + n * DAY));
export const weekday = (s: string) => toDate(s).getUTCDay();
/** Today in Malaysia, as YYYY-MM-DD. */
export const todayMY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
/** Minutes since midnight, Malaysia time, for a moment. */
export const nowMinutesMY = (d = new Date()) => { const [h, m] = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).split(":").map(Number); return h * 60 + m; };
export const hm = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
export const fmtHM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const fmtDate = (s: string, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) => toDate(s).toLocaleDateString("en-MY", { timeZone: "UTC", ...opts });
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------- working days ----------
export type Holiday = { date: string; name: string; scope: "Federal" | string };
/** Holidays that apply to someone in this state (federal ones plus that state's own). */
export const holidaysFor = (all: Holiday[], state: string) => all.filter((h) => h.scope === "Federal" || h.scope === state);
export const isRestDay = (d: string, s: Settings = DEFAULT_SETTINGS) => s.restDays.includes(weekday(d));
export const isWorkingDay = (d: string, holidays: Set<string>, s: Settings = DEFAULT_SETTINGS) => !isRestDay(d, s) && !holidays.has(d);

/** Leave days between two dates, leaving out rest days and public holidays. A half day counts 0.5. */
export function leaveDays(from: string, to: string, half: "" | "AM" | "PM", holidays: Set<string>, s: Settings = DEFAULT_SETTINGS): number {
  if (!from || !to || to < from) return 0;
  if (half && from === to) return isWorkingDay(from, holidays, s) ? 0.5 : 0;
  return eachDay(from, to).filter((d) => isWorkingDay(d, holidays, s)).length;
}
/** Maternity leave is counted in calendar days under the Act, not working days. */
export const calendarDays = (from: string, to: string) => (!from || !to || to < from ? 0 : eachDay(from, to).length);

// ---------- entitlement ----------
export type Gender = "F" | "M";
/** Completed years of service on a date. */
export function yearsOfService(joined: string, on: string): number {
  const a = toDate(joined), b = toDate(on);
  let y = b.getUTCFullYear() - a.getUTCFullYear();
  if (b.getUTCMonth() < a.getUTCMonth() || (b.getUTCMonth() === a.getUTCMonth() && b.getUTCDate() < a.getUTCDate())) y--;
  return Math.max(0, y);
}
/** Yearly entitlement for a leave type. null = no limit (unpaid). Service is counted on 1 January of the year. */
export function entitlement(type: LeaveType, joined: string, gender: Gender, year: number): number | null {
  const yrs = yearsOfService(joined, `${year}-01-01`);
  switch (type) {
    case "AL": return yrs < 2 ? 8 : yrs < 5 ? 12 : 16;        // 8, 8+4, 8+8
    case "SL": return yrs < 2 ? 14 : yrs < 5 ? 18 : 22;       // Employment Act s.60F
    case "HL": return 60;                                     // shared with sick leave: SL + HL together up to 60
    case "EL": return 2;
    case "ML": return gender === "F" ? 98 : 0;                // 98 calendar days
    case "UL": return null;
  }
}
export const serviceBand = (joined: string, year: number) => { const y = yearsOfService(joined, `${year}-01-01`); return y < 2 ? "Under 2 years" : y < 5 ? "2 to 5 years" : "Over 5 years"; };

// ---------- attendance ----------
export type DayKind = "work" | "rest" | "holiday";
export const dayKind = (d: string, holidays: Set<string>, s: Settings = DEFAULT_SETTINGS): DayKind => (holidays.has(d) ? "holiday" : isRestDay(d, s) ? "rest" : "work");
/** Late if clocked in more than lateAfterMin minutes after the start time (on a working day). */
export const isLate = (inMin: number, s: Settings = DEFAULT_SETTINGS) => inMin > hm(s.workStart) + s.lateAfterMin;
/** Minutes worked, leaving out the lunch hour when the day spans it. */
export function workedMin(inMin: number, outMin: number, s: Settings = DEFAULT_SETTINGS): number {
  if (outMin <= inMin) return 0;
  const ls = hm(s.lunchStart), le = hm(s.lunchEnd);
  const lunch = Math.max(0, Math.min(outMin, le) - Math.max(inMin, ls));
  return outMin - inMin - lunch;
}
/** Overtime hours (to the half hour) and the rate: beyond 8 hours on a working day, all hours on a rest day or public holiday. */
export function overtime(d: string, inMin: number, outMin: number, holidays: Set<string>, s: Settings = DEFAULT_SETTINGS): { hours: number; rate: number } {
  const kind = dayKind(d, holidays, s);
  const worked = workedMin(inMin, outMin, s);
  const standard = hm(s.workEnd) - hm(s.workStart) - (hm(s.lunchEnd) - hm(s.lunchStart));
  const min = kind === "work" ? Math.max(0, worked - standard) : worked;
  const hours = Math.floor(min / 30) / 2;
  const rate = kind === "holiday" ? s.otPublicHoliday : kind === "rest" ? s.otRestDay : s.otWeekday;
  return { hours, rate };
}

/** Distance in metres between two points (for the optional GPS check at clock-in). */
export function metres(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
