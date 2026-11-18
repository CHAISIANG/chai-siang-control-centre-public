"use client";
// One shared store for all HR screens, so an action on one screen shows on the others.
// Live mode (inside the app) reads and writes the database; sample mode (the preview page) keeps made-up data in this browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { calendarDays, leaveDays, leaveName, nowMinutesMY, type Holiday, type LeaveType, type Settings } from "./rules";
import { approverOf, balance, findEmp, holidaySetFor } from "./calc";
import { useAuth } from "@/components/auth";
import * as L from "./live";
import { ME, TODAY, seedData, type Employee, type HrData, type LeaveRequest, type LeaveStatus, type Role } from "./sample";

const KEY = "cssb.hr.sample.v2";
type Result = L.Result;

export type NewLeave = { type: LeaveType; from: string; to: string; half: "" | "AM" | "PM"; reason: string; mcFile?: string; mc?: File | null };

/** What every HR screen gets. Actions answer with a short message to show. */
type Ctx = {
  data: HrData;
  role: Role; setRole: (r: Role) => void;
  me: Employee;
  live: boolean;      // true: real data from the database
  linked: boolean;    // the signed-in login has an employee record
  loading: boolean;
  error: string;
  flash: string | null;               // a new update that just arrived
  applyLeave: (x: NewLeave) => Promise<Result>;
  cancelLeave: (id: string) => Promise<Result>;
  decide: (ids: string[], status: "Approved" | "Rejected", note?: string) => Promise<Result>;
  clock: (lat?: number, lng?: number) => Promise<Result>;
  saveEmployee: (e: Employee) => Promise<Result>;
  adjustLeave: (empId: string, type: LeaveType, days: number, reason: string) => Promise<Result>;
  setAttendance: (empId: string, date: string, inMin: number, outMin: number, note: string) => Promise<Result>;
  saveHoliday: (was: Holiday | null, h: Holiday) => Promise<Result>;
  removeHoliday: (h: Holiday) => Promise<Result>;
  saveSettings: (s: Settings) => Promise<Result>;
  setCarry: (empId: string, year: number, days: number) => Promise<Result>;
  importStaff: (rows: Record<string, unknown>[]) => Promise<Result>;
  mcLink: (path: string) => Promise<string | null>;
  markRead: () => Promise<void>;
  reset: () => void;
};

type SyncCtx = {
  data: HrData;
  role: Role; setRole: (r: Role) => void;
  me: Employee;
  applyLeave: (x: NewLeave) => Result;
  cancelLeave: (id: string) => void;
  decide: (ids: string[], status: "Approved" | "Rejected", note?: string) => Result;
  clock: (lat?: number, lng?: number) => Result;
  saveEmployee: (e: Employee) => Result;
  adjustLeave: (empId: string, type: LeaveType, days: number, reason: string) => Result;
  setAttendance: (empId: string, date: string, inMin: number, outMin: number, note: string) => Result;
  saveHoliday: (was: Holiday | null, h: Holiday) => Result;
  removeHoliday: (h: Holiday) => void;
  saveSettings: (s: Settings) => void;
  setCarry: (empId: string, year: number, days: number) => void;
  markRead: () => void;
  reset: () => void;
};
const HrCtx = createContext<Ctx | null>(null);

const id = () => Math.random().toString(36).slice(2, 10);
const first = (e: Employee) => e.name.split(" ")[0];
const span = (r: { from: string; to: string }) => (r.from === r.to ? r.from : `${r.from} to ${r.to}`);

export function HrProvider({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return live ? <LiveProvider>{children}</LiveProvider> : <SampleProvider>{children}</SampleProvider>;
}

function SampleProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<HrData>(seedData);
  const [role, setRoleState] = useState<Role>("employee");
  const [loaded, setLoaded] = useState(false);

  // pick up what was saved in this browser; a private window or blocked storage just starts from the sample
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reading browser storage once after the first render
      if (raw) { const saved = JSON.parse(raw); if (saved?.data?.employees) { setData(saved.data); setRoleState(saved.role ?? "employee"); } }
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => { if (loaded) try { localStorage.setItem(KEY, JSON.stringify({ data, role })); } catch { /* ignore */ } }, [data, role, loaded]);

  const me = findEmp(data, ME[role]) ?? data.employees[0];
  const update = useCallback((f: (d: HrData) => HrData) => setData((d) => f(structuredClone(d))), []);
  const note = (d: HrData, to: string | null, text: string, href: string) => { if (to) d.notes.unshift({ id: id(), to, text, at: TODAY, read: false, href }); };

  const ctx: SyncCtx = {
    data, role, me,
    setRole: (r) => setRoleState(r),

    applyLeave: (x) => {
      const hol = holidaySetFor(data, me.state);
      const days = x.type === "ML" ? calendarDays(x.from, x.to) : leaveDays(x.from, x.to, x.from === x.to ? x.half : "", hol, data.settings);
      if (days <= 0) return { ok: false, text: "These dates have no working days." };
      const clash = data.requests.find((r) => r.empId === me.id && (r.status === "Pending" || r.status === "Approved") && r.from <= x.to && r.to >= x.from);
      if (clash) return { ok: false, text: `You already have ${leaveName(clash.type).toLowerCase()} on ${span(clash)}.` };
      const b = balance(data, me, x.type);
      if (b.available !== null && days > b.available) return { ok: false, text: `Not enough ${leaveName(x.type).toLowerCase()}: ${b.available} left.` };
      const approver = approverOf(data, me);
      update((d) => {
        d.requests.push({ id: id(), empId: me.id, type: x.type, from: x.from, to: x.to, half: x.from === x.to ? x.half : "", days, reason: x.reason.trim(), status: "Pending", appliedAt: TODAY, mcFile: x.mcFile });
        note(d, approver, `${first(me)} applied for ${days} ${days === 1 ? "day" : "days"} of ${leaveName(x.type).toLowerCase()} (${span(x)}).`, "/hr/approvals");
        return d;
      });
      return { ok: true, text: `Sent to ${first(findEmp(data, approver) ?? me)} for approval.` };
    },

    cancelLeave: (rid) => update((d) => { const r = d.requests.find((x) => x.id === rid); if (r && r.status === "Pending") r.status = "Cancelled"; return d; }),

    decide: (ids, status, why) => {
      if (status === "Rejected" && !why?.trim()) return { ok: false, text: "Give a reason for rejecting." };
      const mine = ids.map((x) => data.requests.find((r) => r.id === x)).filter((r): r is LeaveRequest => !!r && r.status === "Pending");
      const own = mine.find((r) => r.empId === me.id);
      if (own) return { ok: false, text: "You cannot decide your own leave." };
      update((d) => {
        for (const r0 of mine) {
          const r = d.requests.find((x) => x.id === r0.id)!;
          r.status = status as LeaveStatus; r.decidedBy = me.id; r.decidedAt = TODAY; r.decisionNote = why?.trim() || undefined;
          note(d, r.empId, `Your ${leaveName(r.type).toLowerCase()} on ${span(r)} was ${status.toLowerCase()} by ${first(me)}${why ? `: ${why.trim()}` : ""}.`, "/hr/leave");
        }
        return d;
      });
      return { ok: true, text: `${mine.length} ${mine.length === 1 ? "request" : "requests"} ${status.toLowerCase()}.${status === "Rejected" ? " The days are back in their balance." : ""}` };
    },

    clock: (lat, lng) => {
      const now = nowMinutesMY();
      const a = data.attendance.find((x) => x.empId === me.id && x.date === TODAY);
      if (a?.outMin != null) return { ok: false, text: "You have already clocked out today." };
      update((d) => {
        const t = d.attendance.find((x) => x.empId === me.id && x.date === TODAY);
        if (!t) d.attendance.push({ empId: me.id, date: TODAY, inMin: now, outMin: null, lat, lng, source: "app" });
        else if (t.inMin == null) t.inMin = now;
        else t.outMin = now;
        return d;
      });
      return { ok: true, text: a?.inMin != null ? "out" : "in" };
    },

    saveEmployee: (e) => {
      if (!e.name.trim() || !e.code.trim()) return { ok: false, text: "Name and employee code are needed." };
      if (data.employees.some((x) => x.code.toLowerCase() === e.code.trim().toLowerCase() && x.id !== e.id)) return { ok: false, text: `Code ${e.code} is already used.` };
      if (e.managerId === e.id) return { ok: false, text: "Someone cannot be their own manager." };
      update((d) => { const i = d.employees.findIndex((x) => x.id === e.id); if (i >= 0) d.employees[i] = e; else d.employees.push({ ...e, id: id() }); return d; });
      return { ok: true, text: `${e.name} saved.` };
    },

    adjustLeave: (empId, type, days, reason) => {
      if (!reason.trim() || !Number.isFinite(days) || days === 0) return { ok: false, text: "Enter the days and a reason." };
      update((d) => { d.adjustments.push({ empId, type, days, reason: reason.trim(), by: me.id, at: TODAY }); return d; });
      return { ok: true, text: `${days > 0 ? "+" : ""}${days} ${leaveName(type).toLowerCase()} for ${first(findEmp(data, empId)!)}.` };
    },

    setAttendance: (empId, date, inMin, outMin, why) => {
      if (outMin <= inMin) return { ok: false, text: "Clock-out must be after clock-in." };
      if (date > TODAY) return { ok: false, text: "That date has not happened yet." };
      if (!why.trim()) return { ok: false, text: "Say why it was entered by hand." };
      update((d) => {
        const a = d.attendance.find((x) => x.empId === empId && x.date === date);
        if (a) Object.assign(a, { inMin, outMin, source: "hr", note: why.trim(), by: me.id });
        else d.attendance.push({ empId, date, inMin, outMin, source: "hr", note: why.trim(), by: me.id });
        return d;
      });
      return { ok: true, text: `Attendance saved for ${first(findEmp(data, empId)!)} on ${date}.` };
    },

    saveHoliday: (was, h) => {
      if (!h.name.trim() || !h.date) return { ok: false, text: "Name and date are needed." };
      if (data.holidays.some((x) => x !== was && x.date === h.date && x.scope === h.scope)) return { ok: false, text: "There is already a holiday on that date for the same place." };
      update((d) => { const i = was ? d.holidays.findIndex((x) => x.date === was.date && x.name === was.name && x.scope === was.scope) : -1; if (i >= 0) d.holidays[i] = h; else d.holidays.push(h); return d; });
      return { ok: true, text: `${h.name} saved.` };
    },
    removeHoliday: (h) => update((d) => { d.holidays = d.holidays.filter((x) => !(x.date === h.date && x.name === h.name && x.scope === h.scope)); return d; }),
    saveSettings: (s) => update((d) => { d.settings = s; return d; }),
    setCarry: (empId, year, days) => update((d) => { d.carry[empId] = { ...(d.carry[empId] ?? {}), [year]: days }; return d; }),
    markRead: () => update((d) => { d.notes.forEach((n) => { if (n.to === me.id) n.read = true; }); return d; }),
    reset: () => { setData(seedData()); setRoleState("employee"); },
  };
  const ok = (text: string): Result => ({ ok: true, text });
  const value: Ctx = useMemo(() => ({
    ...ctx, live: false, linked: true, loading: false, error: "", flash: null,
    applyLeave: async (x) => ctx.applyLeave({ ...x, mcFile: x.mc?.name ?? x.mcFile }),
    cancelLeave: async (rid) => { ctx.cancelLeave(rid); return ok("Request cancelled."); },
    decide: async (ids, st, n) => ctx.decide(ids, st, n),
    clock: async (lat, lng) => ctx.clock(lat, lng),
    saveEmployee: async (e) => ctx.saveEmployee(e),
    adjustLeave: async (a, t, d, r) => ctx.adjustLeave(a, t, d, r),
    setAttendance: async (a, d, i, o, n) => ctx.setAttendance(a, d, i, o, n),
    saveHoliday: async (w, h) => ctx.saveHoliday(w, h),
    removeHoliday: async (h) => { ctx.removeHoliday(h); return ok(`${h.name} removed.`); },
    saveSettings: async (x) => { ctx.saveSettings(x); return ok("Settings saved."); },
    setCarry: async (a, y, d) => { ctx.setCarry(a, y, d); return ok("Carry-over saved."); },
    importStaff: async () => ({ ok: false, text: "Importing staff works once HR is connected to the database." }),
    mcLink: async () => null,
    markRead: async () => ctx.markRead(),
  }), [data, role]); // eslint-disable-line react-hooks/exhaustive-deps
  return <HrCtx.Provider value={value}>{children}</HrCtx.Provider>;
}

// ---------- live: the database ----------
const NOBODY: Employee = { id: "", code: "", name: "", position: "", dept: "", gender: "M", state: "Selangor", joined: TODAY, managerId: null, role: "employee", email: "", phone: "", active: true };
const EMPTY: HrData = { ...seedData(), employees: [], requests: [], attendance: [], adjustments: [], carry: {}, notes: [], holidays: [] };

function LiveProvider({ children }: { children: ReactNode }) {
  const { realCan, profile, session } = useAuth();
  const [data, setData] = useState<HrData>(EMPTY);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try { const r = await L.loadLive(); setData(r.data); setMeId(r.meId); setError(""); }
    catch (e) { setError((e as Error).message || "Could not load HR data."); }
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async load, state is set after the await
  useEffect(() => { if (session) void reload(); }, [session, reload]);
  // live updates: a new note for me, or any leave change I am allowed to see
  useEffect(() => {
    if (!session || loading) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const stop = L.watchLive(meId, (text) => { if (text) setFlash(text); clearTimeout(t); t = setTimeout(() => void reload(), 400); });
    return () => { clearTimeout(t); stop(); };
  }, [session, meId, loading, reload]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 6000); return () => clearTimeout(t); } }, [flash]);

  const me = findEmp(data, meId) ?? { ...NOBODY, name: profile?.full_name ?? "" };
  const isAdmin = realCan("hr_admin");
  const hasTeam = !!meId && data.employees.some((e) => e.active && approverOf(data, e) === meId);
  const role: Role = isAdmin ? "hr" : realCan("hr_approve") || hasTeam ? "manager" : "employee";
  const after = async (r: Result) => { if (r.ok) await reload(); return r; };
  const need = (): Result | null => (meId ? null : { ok: false, text: "Your login is not linked to an employee record yet. Ask HR to add you with the same email you sign in with." });

  const value: Ctx = {
    data, role, me, live: true, linked: !!meId, loading, error, flash,
    setRole: () => {},
    applyLeave: async (x) => need() ?? after(await L.liveApply(meId!, { type: x.type, from: x.from, to: x.to, half: x.half, reason: x.reason, mc: x.mc })),
    cancelLeave: async (rid) => after(await L.liveCancel(rid)),
    decide: async (ids, st, n) => after(await L.liveDecide(ids, st, n)),
    clock: async (lat, lng) => need() ?? after(await L.liveClock(lat, lng)),
    saveEmployee: async (e) => after(await L.liveSaveEmployee(e)),
    adjustLeave: async (a, t, d, r) => after(await L.liveAdjust(a, t, d, r)),
    setAttendance: async (a, d, i, o, n) => after(await L.liveSetAttendance(a, d, i, o, n)),
    saveHoliday: async (w, h) => after(await L.liveSaveHoliday(w, h)),
    removeHoliday: async (h) => after(await L.liveRemoveHoliday(h)),
    saveSettings: async (x) => after(await L.liveSaveSettings(x)),
    setCarry: async (a, y, d) => after(await L.liveSetCarry(a, y, d)),
    importStaff: async (rows) => after(await L.liveImport(rows)),
    mcLink: (path) => L.mcLink(path),
    markRead: async () => { if (meId) { await L.liveMarkRead(meId); await reload(); } },
    reset: () => {},
  };
  return <HrCtx.Provider value={value}>{children}</HrCtx.Provider>;
}

export function useHr() {
  const c = useContext(HrCtx);
  if (!c) throw new Error("useHr outside HrProvider");
  return c;
}
