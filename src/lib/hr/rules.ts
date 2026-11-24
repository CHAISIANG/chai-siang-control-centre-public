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
  qrRequired: boolean;             // office staff must scan the code on the office screen to clock in
  qrSeconds: number;               // how often that code changes
  fieldSelfie: boolean;            // field staff take a photo of themselves to clock in
  carryMaxDays: number; carryExpiry: string; // "MM-DD": carried-over annual leave must be used by this date
  otWeekday: number; otRestDay: number; otPublicHoliday: number;
  restDays: number[];              // office team: 0 = Sunday ... 6 = Saturday
  satOffWeeks: number[];           // Saturday team: Saturdays off by week of the month, e.g. [2] = the 2nd Saturday
};
export const DEFAULT_SETTINGS: Settings = {
  workStart: "09:00", workEnd: "18:00", lunchStart: "13:00", lunchEnd: "14:00", lateAfterMin: 15,
  gpsRequired: false, gpsRadiusM: 200, officeLat: 3.2389, officeLng: 101.6802, qrRequired: false, qrSeconds: 60, fieldSelfie: false,
  carryMaxDays: 5, carryExpiry: "03-31", otWeekday: 1.5, otRestDay: 2.0, otPublicHoliday: 3.0, restDays: [0, 6], satOffWeeks: [2],
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
/** Two work schedules: the office team rests on the set rest days; the Saturday team (logistics, sales, merchandisers)
 *  also works Saturdays, except the Saturdays of the month set in satOffWeeks, and rests on the other rest days. */
export type Schedule = "office" | "saturday";
export const SCHEDULES: { code: Schedule; name: string }[] = [
  { code: "office", name: "Office (Saturdays off)" },
  { code: "saturday", name: "Saturday team" },
];
/** Which Saturday of its month a date is: 1 to 5. */
export const weekOfMonth = (d: string) => Math.ceil(Number(d.slice(8, 10)) / 7);
export const isRestDay = (d: string, s: Settings = DEFAULT_SETTINGS, sched: Schedule = "office") => {
  const wd = weekday(d);
  if (sched === "saturday" && wd === 6) return (s.satOffWeeks ?? [2]).includes(weekOfMonth(d));
  return s.restDays.includes(wd);
};
export const isWorkingDay = (d: string, holidays: Set<string>, s: Settings = DEFAULT_SETTINGS, sched: Schedule = "office") => !isRestDay(d, s, sched) && !holidays.has(d);

/** Leave days between two dates, leaving out rest days and public holidays. A half day counts 0.5. */
export function leaveDays(from: string, to: string, half: "" | "AM" | "PM", holidays: Set<string>, s: Settings = DEFAULT_SETTINGS, sched: Schedule = "office"): number {
  if (!from || !to || to < from) return 0;
  if (half && from === to) return isWorkingDay(from, holidays, s, sched) ? 0.5 : 0;
  return eachDay(from, to).filter((d) => isWorkingDay(d, holidays, s, sched)).length;
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
export const dayKind = (d: string, holidays: Set<string>, s: Settings = DEFAULT_SETTINGS, sched: Schedule = "office"): DayKind => (holidays.has(d) ? "holiday" : isRestDay(d, s, sched) ? "rest" : "work");
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
export function overtime(d: string, inMin: number, outMin: number, holidays: Set<string>, s: Settings = DEFAULT_SETTINGS, sched: Schedule = "office"): { hours: number; rate: number } {
  const kind = dayKind(d, holidays, s, sched);
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

// ---------- clock-in checks ----------
/** Office staff work at the office; field staff (salesmen, drivers) start wherever their day starts. */
export type WorkType = "office" | "field";
export const WORK_TYPES: { code: WorkType; name: string; how: string }[] = [
  { code: "office", name: "Office or warehouse", how: "Clocks in at the office" },
  { code: "field", name: "Field (sales, driver)", how: "Clocks in where the day starts" },
];
/** Something HR should look at. None of these stop the clock-in; the hard rules do that. */
export type ClockFlag = "far_in" | "far_out" | "no_gps" | "weak_gps" | "late_photo";
export const FLAG_TEXT: Record<ClockFlag, string> = {
  far_in: "Clocked in away from the office",
  far_out: "Clocked out away from the office",
  no_gps: "Location not shared",
  weak_gps: "Location was not precise",
  late_photo: "No selfie",
};
/** A phone's reading of where it is. acc is how sure it is, in metres. */
export type Fix = { lat: number; lng: number; acc: number };
export const WEAK_GPS_M = 300;

/**
 * What happens when someone presses the clock button.
 * block: the reason they cannot clock in yet (shown to them); flags: what HR sees afterwards.
 */
export function clockCheck(o: { type: WorkType; phase: "in" | "out"; s: Settings; fix: Fix | null; qrOk: boolean; selfie: boolean }): { block: string | null; flags: ClockFlag[]; dist: number | null } {
  const { type, phase, s, fix, qrOk, selfie } = o;
  const flags: ClockFlag[] = [];
  const dist = fix ? metres(fix.lat, fix.lng, s.officeLat, s.officeLng) : null;
  if (fix && fix.acc > WEAK_GPS_M) flags.push("weak_gps");
  if (type === "field") {
    if (phase === "in" && s.fieldSelfie && !selfie) return { block: "Take a selfie to clock in.", flags, dist };
    if (!fix) flags.push("no_gps");
    return { block: null, flags, dist };
  }
  const far = dist !== null && dist > s.gpsRadiusM;
  if (phase === "in") {
    if (s.qrRequired && !qrOk) return { block: "Scan the code on the office screen to clock in.", flags, dist };
    if (s.gpsRequired && !fix) return { block: "Share your location to clock in.", flags, dist };
    if (s.gpsRequired && far) return { block: `You are ${dist! >= 1000 ? `${(dist! / 1000).toFixed(1)} km` : `${Math.round(dist!)} m`} from the office. Clock in when you are there.`, flags, dist };
    if (!fix) flags.push("no_gps"); else if (far) flags.push("far_in");
  } else {
    // clocking out is never blocked, so nobody is stuck at the end of the day
    if (!fix) flags.push("no_gps"); else if (far) flags.push("far_out");
  }
  return { block: null, flags, dist };
}

/**
 * The changing code on the office screen. It depends on the time slot and a secret, so a photo of it stops working
 * after a minute or two. In the app the database makes and checks it; the sample uses a fixed secret.
 */
export function officeCode(slot: number, secret: string): string {
  let h = 2166136261;
  for (const ch of `${secret}:${slot}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(h % 1000000).padStart(6, "0");
}
/** The sample office screen uses this secret; in the app the database holds the real one. */
export const SAMPLE_OFFICE_SECRET = "sample-office";
export const codeSlot = (seconds: number, at = Date.now()) => Math.floor(at / 1000 / Math.max(15, seconds));
/** The code from this slot or the one before is accepted, so someone scanning just as it changes is not turned away. */
export const codeValid = (code: string, seconds: number, secret: string, at = Date.now()) => {
  const n = codeSlot(seconds, at);
  return /^\d{6}$/.test(code) && (code === officeCode(n, secret) || code === officeCode(n - 1, secret));
};
