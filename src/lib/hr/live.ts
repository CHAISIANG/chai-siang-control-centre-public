// HR data from Supabase. The rules that matter are checked again on the server (see the hr_* functions),
// so these calls only pass what the person asked for and show the server's answer.
import { supabase } from "@/lib/supabase";
import { DEFAULT_SETTINGS, type Holiday, type LeaveType, type Settings } from "./rules";
import { TODAY, type Attendance, type Employee, type HrData, type LeaveRequest, type Note } from "./sample";

export type Result = { ok: true; text: string } | { ok: false; text: string };
const fail = (e: { message?: string } | null | undefined, fallback = "Something went wrong. Try again."): Result => ({ ok: false, text: (e?.message ?? fallback).replace(/^.*?ERROR:\s*/, "") });

/** Read a whole table in pages of 1,000 rows (optionally only rows with `col >= value`). */
async function all<T>(table: string, cols: string, order: string, gte?: [string, string]): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const base = supabase.from(table).select(cols);
    const { data, error } = await (gte ? base.gte(gte[0], gte[1]) : base).order(order).range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

type EmpRow = { id: string; code: string; name: string; position: string; dept: string; gender: "F" | "M"; state: string; joined: string; manager_id: string | null; hr_role: Employee["role"]; email: string | null; phone: string | null; active: boolean; profile_id: string | null };
type ReqRow = { id: string; emp_id: string; type: LeaveType; from_date: string; to_date: string; half: "" | "AM" | "PM"; days: number; reason?: string; status: LeaveRequest["status"]; applied_at?: string; decided_by?: string | null; decided_by_name?: string | null; decided_at?: string | null; decision_note?: string | null; mc_path?: string | null };

const toEmp = (r: EmpRow): Employee => ({ id: r.id, code: r.code, name: r.name, position: r.position, dept: r.dept, gender: r.gender, state: r.state, joined: r.joined, managerId: r.manager_id, role: r.hr_role, email: r.email ?? "", phone: r.phone ?? "", active: r.active });
const toReq = (r: ReqRow, calendarOnly = false): LeaveRequest => ({
  id: r.id, empId: r.emp_id, type: r.type, from: r.from_date, to: r.to_date, half: r.half, days: Number(r.days), reason: r.reason ?? "", status: r.status,
  appliedAt: r.applied_at ?? r.from_date, decidedBy: r.decided_by ?? undefined, decidedByName: r.decided_by_name ?? undefined, decidedAt: r.decided_at ?? undefined,
  decisionNote: r.decision_note ?? undefined, mcFile: r.mc_path ?? undefined, calendarOnly,
});

/** Everything the screens need, for the signed-in person. What they may see is decided by the database's access rules. */
export async function loadLive(): Promise<{ data: HrData; meId: string | null }> {
  const { data: meId } = await supabase.rpc("hr_link_me");
  const year = Number(TODAY.slice(0, 4));
  const [emps, hols, set, reqs, att, adj, carry, notes, cal] = await Promise.all([
    all<EmpRow>("hr_employees", "id, code, name, position, dept, gender, state, joined, manager_id, hr_role, email, phone, active, profile_id", "code"),
    all<{ date: string; name: string; scope: string }>("hr_holidays", "date, name, scope", "date"),
    supabase.from("hr_settings").select("data").eq("id", 1).maybeSingle(),
    all<ReqRow>("hr_leave_requests", "id, emp_id, type, from_date, to_date, half, days, reason, status, applied_at, decided_by, decided_by_name, decided_at, decision_note, mc_path", "from_date"),
    all<{ emp_id: string; date: string; in_min: number | null; out_min: number | null; lat: number | null; lng: number | null; source: "app" | "hr"; note: string | null; by_name: string | null }>(
      "hr_attendance", "emp_id, date, in_min, out_min, lat, lng, source, note, by_name", "date", ["date", `${year - 1}-12-01`]),
    all<{ emp_id: string; type: LeaveType; days: number; reason: string; by_name: string | null; on_date: string }>("hr_adjustments", "emp_id, type, days, reason, by_name, on_date", "on_date"),
    all<{ emp_id: string; year: number; days: number }>("hr_carry", "emp_id, year, days", "year"),
    supabase.from("hr_notes").select("id, to_emp, text, href, sent_at, read").order("sent_at", { ascending: false }).limit(50),
    supabase.rpc("hr_calendar", { p_from: `${year - 1}-12-01`, p_to: `${year + 1}-12-31` }),
  ]);
  const requests = reqs.map((r) => toReq(r));
  const seen = new Set(requests.map((r) => r.id));
  for (const r of ((cal.data ?? []) as ReqRow[])) if (!seen.has(r.id)) requests.push(toReq(r, true));
  const carryMap: HrData["carry"] = {};
  for (const c of carry) (carryMap[c.emp_id] ??= {})[c.year] = Number(c.days);
  const data: HrData = {
    employees: emps.map(toEmp),
    holidays: hols.map((h) => ({ date: h.date, name: h.name, scope: h.scope })),
    requests,
    attendance: att.map((a): Attendance => ({ empId: a.emp_id, date: a.date, inMin: a.in_min, outMin: a.out_min, lat: a.lat ?? undefined, lng: a.lng ?? undefined, source: a.source, note: a.note ?? undefined, by: a.by_name ?? undefined })),
    adjustments: adj.map((a) => ({ empId: a.emp_id, type: a.type, days: Number(a.days), reason: a.reason, by: "", byName: a.by_name ?? "HR", at: a.on_date })),
    carry: carryMap,
    settings: { ...DEFAULT_SETTINGS, ...((set.data?.data as Partial<Settings>) ?? {}) },
    notes: ((notes.data ?? []) as { id: number; to_emp: string; text: string; href: string | null; sent_at: string; read: boolean }[])
      .map((n): Note => ({ id: String(n.id), to: n.to_emp, text: n.text, at: n.sent_at.slice(0, 10), read: n.read, href: n.href ?? undefined })),
  };
  return { data, meId: (meId as string | null) ?? null };
}

// ---------- actions ----------
const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);

export async function liveApply(meId: string, x: { type: LeaveType; from: string; to: string; half: "" | "AM" | "PM"; reason: string; mc?: File | null }): Promise<Result> {
  let path: string | null = null;
  if (x.mc) {
    path = `${meId}/${Date.now()}-${safeName(x.mc.name)}`;
    const up = await supabase.storage.from("hr-mc").upload(path, x.mc, { contentType: x.mc.type || undefined, upsert: false });
    if (up.error) return fail(up.error, "The MC could not be uploaded.");
  }
  const { error } = await supabase.rpc("hr_apply", { p_type: x.type, p_from: x.from, p_to: x.to, p_half: x.half, p_reason: x.reason, p_mc_path: path });
  if (error) { if (path) await supabase.storage.from("hr-mc").remove([path]); return fail(error); }
  return { ok: true, text: "Sent for approval. You will be told here when it is decided." };
}
export async function liveCancel(id: string): Promise<Result> { const { error } = await supabase.rpc("hr_cancel", { p_id: id }); return error ? fail(error) : { ok: true, text: "Request cancelled." }; }
export async function liveDecide(ids: string[], status: "Approved" | "Rejected", note?: string): Promise<Result> {
  const { data, error } = await supabase.rpc("hr_decide", { p_ids: ids, p_status: status, p_note: note ?? null });
  if (error) return fail(error);
  const n = Number(data ?? 0);
  return { ok: true, text: `${n} ${n === 1 ? "request" : "requests"} ${status.toLowerCase()}.${status === "Rejected" ? " The days are back in their balance." : ""}` };
}
export async function liveClock(lat?: number, lng?: number): Promise<Result> {
  const { data, error } = await supabase.rpc("hr_clock", { p_lat: lat ?? null, p_lng: lng ?? null });
  return error ? fail(error) : { ok: true, text: String(data) };
}
export async function liveSaveEmployee(e: Employee): Promise<Result> {
  const row = { code: e.code, name: e.name, position: e.position, dept: e.dept, gender: e.gender, state: e.state, joined: e.joined, manager_id: e.managerId, hr_role: e.role, email: e.email || null, phone: e.phone || null, active: e.active, updated_at: new Date().toISOString() };
  const { error } = e.id ? await supabase.from("hr_employees").update(row).eq("id", e.id) : await supabase.from("hr_employees").insert(row);
  if (error) return fail(error, /duplicate|unique/i.test(error.message) ? "That employee code or email is already used." : undefined);
  return { ok: true, text: `${e.name} saved.` };
}
export async function liveAdjust(empId: string, type: LeaveType, days: number, reason: string): Promise<Result> {
  const { error } = await supabase.rpc("hr_adjust", { p_emp: empId, p_type: type, p_days: days, p_reason: reason });
  return error ? fail(error) : { ok: true, text: "Adjustment saved." };
}
export async function liveSetAttendance(empId: string, date: string, inMin: number, outMin: number, note: string): Promise<Result> {
  const { error } = await supabase.rpc("hr_set_attendance", { p_emp: empId, p_date: date, p_in: inMin, p_out: outMin, p_note: note });
  return error ? fail(error) : { ok: true, text: `Attendance saved for ${date}.` };
}
export async function liveSetCarry(empId: string, year: number, days: number): Promise<Result> {
  const { error } = await supabase.rpc("hr_set_carry", { p_emp: empId, p_year: year, p_days: days });
  return error ? fail(error) : { ok: true, text: "Carry-over saved." };
}
export async function liveSaveHoliday(was: Holiday | null, h: Holiday): Promise<Result> {
  const { error } = was
    ? await supabase.from("hr_holidays").update({ date: h.date, name: h.name, scope: h.scope }).eq("date", was.date).eq("scope", was.scope)
    : await supabase.from("hr_holidays").insert({ date: h.date, name: h.name, scope: h.scope });
  if (error) return fail(error, /duplicate|unique/i.test(error.message) ? "There is already a holiday on that date for the same place." : undefined);
  return { ok: true, text: `${h.name} saved.` };
}
export async function liveRemoveHoliday(h: Holiday): Promise<Result> {
  const { error } = await supabase.from("hr_holidays").delete().eq("date", h.date).eq("scope", h.scope);
  return error ? fail(error) : { ok: true, text: `${h.name} removed.` };
}
export async function liveSaveSettings(s: Settings): Promise<Result> {
  const { error } = await supabase.from("hr_settings").update({ data: s, updated_at: new Date().toISOString() }).eq("id", 1);
  return error ? fail(error) : { ok: true, text: "Settings saved." };
}
export async function liveMarkRead(meId: string) { await supabase.from("hr_notes").update({ read: true }).eq("to_emp", meId).eq("read", false); }
export async function liveImport(rows: Record<string, unknown>[]): Promise<Result> {
  const { data, error } = await supabase.rpc("hr_import_employees", { p_rows: rows });
  return error ? fail(error) : { ok: true, text: `${data} staff added or updated.` };
}
/** A short-lived link to look at a medical certificate. */
export async function mcLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("hr-mc").createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}
/** Tell the screen when something it shows changes: a new note for me, or a leave request decided or added. */
export function watchLive(meId: string | null, onChange: (note?: string) => void) {
  const ch = supabase.channel(`hr-${meId ?? "admin"}-${Math.random().toString(36).slice(2, 7)}`);
  if (meId) ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "hr_notes", filter: `to_emp=eq.${meId}` }, (p) => onChange((p.new as { text?: string }).text));
  ch.on("postgres_changes", { event: "*", schema: "public", table: "hr_leave_requests" }, () => onChange());
  ch.subscribe();
  return () => { void supabase.removeChannel(ch); };
}
