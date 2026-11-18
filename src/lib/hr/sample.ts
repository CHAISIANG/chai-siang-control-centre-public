// Made-up sample data for the HR screens (stage 1: no database yet). All people and numbers are fictional.
import { addDays, eachDay, holidaysFor, isWorkingDay, leaveDays, calendarDays, todayMY, weekday, DEFAULT_SETTINGS, type Gender, type Holiday, type LeaveType, type Settings } from "./rules";

export type Role = "employee" | "manager" | "hr";
export type Employee = {
  id: string; code: string; name: string; position: string; dept: string; gender: Gender; state: string;
  joined: string; managerId: string | null; role: Role; email: string; phone: string; active: boolean;
};
export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";
export type LeaveRequest = {
  id: string; empId: string; type: LeaveType; from: string; to: string; half: "" | "AM" | "PM"; days: number;
  reason: string; status: LeaveStatus; appliedAt: string; decidedBy?: string; decidedByName?: string; decidedAt?: string; decisionNote?: string; mcFile?: string;
  /** known only from the team calendar: dates and type, no reason */
  calendarOnly?: boolean;
};
export type Attendance = { empId: string; date: string; inMin: number | null; outMin: number | null; lat?: number; lng?: number; source: "app" | "hr"; note?: string; by?: string };
export type Adjustment = { empId: string; type: LeaveType; days: number; reason: string; by: string; byName?: string; at: string };

export const EMPLOYEES: Employee[] = [
  { id: "e1", code: "CS001", name: "Ahmad Faizal bin Rahman", position: "Operations Manager", dept: "Operations", gender: "M", state: "Selangor", joined: "2018-03-01", managerId: "e5", role: "manager", email: "ahmad@example.com", phone: "012-000 0001", active: true },
  { id: "e2", code: "CS002", name: "Nurul Aisyah binti Hassan", position: "Admin Executive", dept: "Operations", gender: "F", state: "Selangor", joined: "2023-06-12", managerId: "e1", role: "employee", email: "nurul@example.com", phone: "012-000 0002", active: true },
  { id: "e3", code: "CS003", name: "Tan Mei Ling", position: "Account Clerk", dept: "Finance", gender: "F", state: "Selangor", joined: "2025-02-03", managerId: "e5", role: "employee", email: "meiling@example.com", phone: "012-000 0003", active: true },
  { id: "e4", code: "CS004", name: "Rajesh a/l Subramaniam", position: "Storekeeper", dept: "Warehouse", gender: "M", state: "Selangor", joined: "2020-09-01", managerId: "e1", role: "employee", email: "rajesh@example.com", phone: "012-000 0004", active: true },
  { id: "e5", code: "CS005", name: "Lim Wei Jie", position: "HR & Admin Manager", dept: "HR", gender: "M", state: "Selangor", joined: "2016-01-04", managerId: null, role: "hr", email: "weijie@example.com", phone: "012-000 0005", active: true },
];
/** Whose screens the sample shows for each view. */
export const ME: Record<Role, string> = { employee: "e2", manager: "e1", hr: "e5" };
export type Note = { id: string; to: string; text: string; at: string; read: boolean; href?: string };

// Federal and Selangor public holidays. Islamic and lunar dates are estimates: HR should check them against the official gazette.
export const HOLIDAYS: Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day", scope: "Selangor" },
  { date: "2026-02-01", name: "Thaipusam", scope: "Selangor" },
  { date: "2026-02-02", name: "Thaipusam (replacement)", scope: "Selangor" },
  { date: "2026-02-17", name: "Chinese New Year", scope: "Federal" },
  { date: "2026-02-18", name: "Chinese New Year (2nd day)", scope: "Federal" },
  { date: "2026-03-07", name: "Nuzul Al-Quran", scope: "Selangor" },
  { date: "2026-03-21", name: "Hari Raya Aidilfitri", scope: "Federal" },
  { date: "2026-03-22", name: "Hari Raya Aidilfitri (2nd day)", scope: "Federal" },
  { date: "2026-03-23", name: "Hari Raya Aidilfitri (replacement)", scope: "Federal" },
  { date: "2026-05-01", name: "Labour Day", scope: "Federal" },
  { date: "2026-05-27", name: "Hari Raya Haji", scope: "Federal" },
  { date: "2026-05-31", name: "Wesak Day", scope: "Federal" },
  { date: "2026-06-01", name: "Agong's Birthday", scope: "Federal" },
  { date: "2026-06-02", name: "Wesak Day (replacement)", scope: "Federal" },
  { date: "2026-06-17", name: "Awal Muharram", scope: "Federal" },
  { date: "2026-08-25", name: "Maulidur Rasul", scope: "Federal" },
  { date: "2026-08-31", name: "National Day", scope: "Federal" },
  { date: "2026-09-16", name: "Malaysia Day", scope: "Federal" },
  { date: "2026-11-08", name: "Deepavali", scope: "Federal" },
  { date: "2026-11-09", name: "Deepavali (replacement)", scope: "Federal" },
  { date: "2026-12-11", name: "Sultan of Selangor's Birthday", scope: "Selangor" },
  { date: "2026-12-25", name: "Christmas Day", scope: "Federal" },
  { date: "2027-01-01", name: "New Year's Day", scope: "Selangor" },
  { date: "2027-01-22", name: "Thaipusam", scope: "Selangor" },
  { date: "2027-02-06", name: "Chinese New Year", scope: "Federal" },
  { date: "2027-02-07", name: "Chinese New Year (2nd day)", scope: "Federal" },
  { date: "2027-02-08", name: "Chinese New Year (replacement)", scope: "Federal" },
  { date: "2027-02-24", name: "Nuzul Al-Quran", scope: "Selangor" },
  { date: "2027-03-10", name: "Hari Raya Aidilfitri", scope: "Federal" },
  { date: "2027-03-11", name: "Hari Raya Aidilfitri (2nd day)", scope: "Federal" },
  { date: "2027-05-01", name: "Labour Day", scope: "Federal" },
  { date: "2027-05-17", name: "Hari Raya Haji", scope: "Federal" },
  { date: "2027-05-20", name: "Wesak Day", scope: "Federal" },
  { date: "2027-06-06", name: "Awal Muharram", scope: "Federal" },
  { date: "2027-06-07", name: "Agong's Birthday", scope: "Federal" },
  { date: "2027-08-15", name: "Maulidur Rasul", scope: "Federal" },
  { date: "2027-08-16", name: "Maulidur Rasul (replacement)", scope: "Federal" },
  { date: "2027-08-31", name: "National Day", scope: "Federal" },
  { date: "2027-09-16", name: "Malaysia Day", scope: "Federal" },
  { date: "2027-10-29", name: "Deepavali", scope: "Federal" },
  { date: "2027-12-11", name: "Sultan of Selangor's Birthday", scope: "Selangor" },
  { date: "2027-12-25", name: "Christmas Day", scope: "Federal" },
];
const holidaySet = (state: string) => new Set(holidaysFor(HOLIDAYS, state).map((h) => h.date));

const TODAY = todayMY();
const YEAR = Number(TODAY.slice(0, 4));
const MONTH0 = `${TODAY.slice(0, 7)}-01`;
const sel = holidaySet("Selangor");
/** Shift a date to the next working day (so sample leave never lands on a weekend). */
const nextWork = (d: string) => { let x = d; while (!isWorkingDay(x, sel)) x = addDays(x, 1); return x; };
const req = (id: string, empId: string, type: LeaveType, from: string, to: string, status: LeaveStatus, reason: string, extra: Partial<LeaveRequest> = {}): LeaveRequest => {
  const f = nextWork(from), t = to < f ? f : to;
  const days = type === "ML" ? calendarDays(f, t) : leaveDays(f, t, extra.half ?? "", sel);
  return { id, empId, type, from: f, to: t, half: "", days, reason, status, appliedAt: addDays(f, -7), ...extra };
};

export const LEAVE_REQUESTS: LeaveRequest[] = [
  // earlier this year
  req("r01", "e2", "AL", `${YEAR}-03-30`, `${YEAR}-04-01`, "Approved", "Family trip to Melaka", { decidedBy: "e1" }),
  req("r02", "e2", "SL", `${YEAR}-06-15`, `${YEAR}-06-16`, "Approved", "Fever", { decidedBy: "e1" }),
  req("r03", "e2", "AL", `${YEAR}-08-24`, `${YEAR}-08-24`, "Approved", "Personal matters", { decidedBy: "e1", half: "PM" }),
  req("r04", "e3", "AL", `${YEAR}-05-11`, `${YEAR}-05-13`, "Approved", "Balik kampung", { decidedBy: "e5" }),
  req("r05", "e3", "SL", `${YEAR}-09-21`, `${YEAR}-09-23`, "Approved", "Dengue fever", { decidedBy: "e5", mcFile: "mc-sample.pdf" }),
  req("r06", "e4", "AL", `${YEAR}-07-06`, `${YEAR}-07-10`, "Approved", "Annual holiday", { decidedBy: "e1" }),
  req("r07", "e4", "EL", `${YEAR}-10-05`, `${YEAR}-10-05`, "Approved", "Child sick at school", { decidedBy: "e1" }),
  req("r08", "e1", "AL", `${YEAR}-04-20`, `${YEAR}-04-24`, "Approved", "Umrah", { decidedBy: "e5" }),
  req("r09", "e1", "SL", `${YEAR}-10-12`, `${YEAR}-10-12`, "Approved", "Clinic visit", { decidedBy: "e5" }),
  req("r10", "e5", "AL", `${YEAR}-12-21`, `${YEAR}-12-24`, "Approved", "Year-end break", { decidedBy: "e5" }),
  req("r11", "e3", "AL", `${YEAR}-10-19`, `${YEAR}-10-20`, "Rejected", "Short trip", { decidedBy: "e5", decisionNote: "Month-end closing that week. Please pick another date." }),
  // around now
  req("r12", "e2", "AL", addDays(TODAY, 14), addDays(TODAY, 16), "Pending", "Sister's wedding in Ipoh", { appliedAt: addDays(TODAY, -1) }),
  req("r13", "e4", "AL", addDays(TODAY, 9), addDays(TODAY, 10), "Pending", "Moving house", { appliedAt: TODAY }),
  req("r14", "e4", "SL", addDays(TODAY, -6), addDays(TODAY, -4), "Pending", "Back pain, MC attached", { appliedAt: addDays(TODAY, -3), mcFile: "mc-rajesh.jpg" }),
  req("r15", "e2", "EL", addDays(TODAY, -1), addDays(TODAY, -1), "Pending", "Car broke down on the highway", { appliedAt: TODAY }),
  req("r16", "e3", "AL", addDays(TODAY, 20), addDays(TODAY, 22), "Approved", "Holiday in Penang", { decidedBy: "e5" }),
  req("r17", "e1", "AL", addDays(TODAY, 6), addDays(TODAY, 6), "Approved", "School event", { decidedBy: "e5" }),
  req("r18", "e2", "AL", addDays(TODAY, 30), addDays(TODAY, 30), "Cancelled", "Plan changed"),
];

/** Annual leave carried over from last year into this year (usable until the carry-over expiry date). */
export const CARRY_IN: Record<string, number> = { e1: 5, e2: 3, e3: 0, e4: 4, e5: 5 };
export const ADJUSTMENTS: Adjustment[] = [
  { empId: "e4", type: "AL", days: 1, reason: "Worked on Labour Day stock-take, replacement day", by: "e5", at: `${YEAR}-05-04` },
];

// ---------- attendance: this month up to today, made up but repeatable ----------
function rng(seed: number) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
const onLeave = (empId: string, d: string) => LEAVE_REQUESTS.some((r) => r.empId === empId && r.status !== "Rejected" && r.status !== "Cancelled" && d >= r.from && d <= r.to);
export const ATTENDANCE: Attendance[] = (() => {
  const out: Attendance[] = [];
  EMPLOYEES.forEach((e, i) => {
    const rand = rng(97 + i * 31);
    for (const d of eachDay(MONTH0, TODAY)) {
      const working = isWorkingDay(d, sel);
      if (!working) {
        // the storekeeper sometimes does Saturday stock-take: rest-day overtime
        if (e.id === "e4" && weekday(d) === 6 && rand() < 0.5) out.push({ empId: e.id, date: d, inMin: 8 * 60 + 30, outMin: 12 * 60 + 30, source: "app" });
        continue;
      }
      if (onLeave(e.id, d)) continue;
      const late = rand() < (e.id === "e4" ? 0.25 : 0.08);
      const inMin = late ? 9 * 60 + 16 + Math.floor(rand() * 30) : 8 * 60 + 35 + Math.floor(rand() * 24);
      const otDay = rand() < (e.id === "e1" || e.id === "e4" ? 0.35 : 0.1);
      const outMin = otDay ? 18 * 60 + 60 + Math.floor(rand() * 120) : 18 * 60 + Math.floor(rand() * 20);
      if (d === TODAY) { out.push({ empId: e.id, date: d, inMin: e.id === "e2" ? null : inMin, outMin: null, source: "app" }); continue; }
      // one forgotten clock-out for HR to fix
      if (e.id === "e3" && d === addDays(TODAY, -2) ) { out.push({ empId: e.id, date: d, inMin, outMin: null, source: "app", note: "Forgot to clock out" }); continue; }
      out.push({ empId: e.id, date: d, inMin, outMin, source: "app" });
    }
  });
  return out.filter((a) => !(a.empId === "e2" && a.date === TODAY)); // Nurul has not clocked in yet today
})();

/** Everything the HR screens work from. In stage 3 this comes from the database instead. */
export type HrData = {
  employees: Employee[]; holidays: Holiday[]; requests: LeaveRequest[]; attendance: Attendance[];
  adjustments: Adjustment[]; carry: Record<string, Record<number, number>>; settings: Settings; notes: Note[];
};
export const seedData = (): HrData => ({
  employees: EMPLOYEES.map((e) => ({ ...e })), holidays: HOLIDAYS.map((h) => ({ ...h })), requests: LEAVE_REQUESTS.map((r) => ({ ...r })),
  attendance: ATTENDANCE.map((a) => ({ ...a })), adjustments: ADJUSTMENTS.map((a) => ({ ...a })),
  carry: Object.fromEntries(Object.entries(CARRY_IN).map(([k, v]) => [k, { [YEAR]: v }])), settings: { ...DEFAULT_SETTINGS },
  notes: [
    { id: "n1", to: "e1", text: "Rajesh applied for 2 days of sick leave (MC attached).", at: addDays(TODAY, -3), read: false, href: "/hr/approvals" },
    { id: "n2", to: "e2", text: "Your annual leave on 24 Aug was approved.", at: `${YEAR}-08-20`, read: true, href: "/hr/leave" },
  ],
});
export { TODAY, YEAR };
