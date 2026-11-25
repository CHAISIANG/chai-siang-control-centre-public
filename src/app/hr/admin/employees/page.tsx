"use client";
import { useState } from "react";
import { CalendarClock, Plus, Search, SlidersHorizontal, UserPen } from "lucide-react";
import { Card, Td, Th } from "@/components/ui";
import { Modal, btnBlue, btnLine, dayTxt, field } from "@/components/hr/ui";
import { fmtDate, fmtHM, hm, LEAVE_TYPES, SCHEDULES, serviceBand, WORK_TYPES, yearsOfService, type LeaveType, type Schedule, type WorkType } from "@/lib/hr/rules";
import { TODAY, YEAR, type Employee } from "@/lib/hr/sample";
import { balance, carryInto, findEmp, yearEndCarry } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";
import { StaffImport } from "@/components/hr/StaffImport";
import { useT } from "@/lib/i18n";

const STATES = ["Selangor", "Kuala Lumpur", "Putrajaya", "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Terengganu", "Labuan"];
const blank = (code: string): Employee => ({ id: "", code, name: "", position: "", dept: "", gender: "F", state: "Selangor", joined: TODAY, managerId: null, role: "employee", email: "", phone: "", active: true, workType: "office", schedule: "office" });
const n1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export default function Employees() {
  const { t } = useT();
  const { data, role, setCarry } = useHr();
  const [q, setQ] = useState("");
  const [showLeft, setShowLeft] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [adjust, setAdjust] = useState<Employee | null>(null);
  const [manual, setManual] = useState<Employee | null>(null);
  const [msg, setMsg] = useState("");
  const list = data.employees;
  const shown = list.filter((e) => (showLeft || e.active) && (!q || `${e.code} ${e.name} ${e.position} ${e.dept}`.toLowerCase().includes(q.toLowerCase())));
  const missing = data.attendance.filter((a) => a.inMin != null && a.outMin == null && a.date !== TODAY);
  const say = (text: string) => { setMsg(text); setTimeout(() => setMsg(""), 5000); };

  if (role !== "hr") return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{t("Employee records are for HR. Switch “Viewing as” to HR admin to manage them.")}</p>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">{t("Employees")}</h1><p className="text-slate-500">{t("{n} working here.", { n: list.filter((e) => e.active).length })} {t("Leave entitlement follows years of service on 1 January.")}</p></div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative"><Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Name, code or department")} className="w-60 rounded-lg border border-slate-300 bg-white py-2 pl-8 pr-2 text-sm" /></label>
          <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={showLeft} onChange={(e) => setShowLeft(e.target.checked)} className="h-4 w-4" /> {t("Show people who left")}</label>
          <StaffImport onDone={say} />
          <button onClick={() => setEditing(blank(`CS${String(list.length + 1).padStart(3, "0")}`))} className={`${btnBlue} !py-2 text-sm`}><Plus size={16} /> {t("Add employee")}</button>
        </div>
      </div>
      {msg && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t(msg)}</p>}
      {missing.length > 0 && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Missing clock-outs")}: {missing.map((m) => `${findEmp(data, m.empId)?.name.split(" ")[0]} ${t("on")} ${fmtDate(m.date, { day: "numeric", month: "short" })}`).join(", ")}. {t("Use the clock icon on their row to fix them.")}</p>}

      <Card className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Employee</Th><Th>Department</Th><Th>Joined</Th><Th>Manager</Th><Th right>Annual left</Th><Th right>Sick left</Th><Th>Access</Th><Th /></tr></thead>
            <tbody>
              {shown.map((e) => {
                const al = balance(data, e, "AL"), sl = balance(data, e, "SL");
                return (
                  <tr key={e.id} className={`border-b border-slate-100 ${e.active ? "" : "opacity-50"}`}>
                    <Td first><div className="font-medium text-slate-900">{e.name}</div><div className="text-sm text-slate-500">{e.code} · {e.position}{e.workType === "field" ? ` · ${t("field staff")}` : ""}{e.schedule === "saturday" ? ` · ${t("Saturday team")}` : ""}</div></Td>
                    <Td>{e.dept}<div className="text-sm text-slate-500">{e.state}</div></Td>
                    <Td className="whitespace-nowrap">{fmtDate(e.joined)}<div className="text-sm text-slate-500">{yearsOfService(e.joined, TODAY)} {t("yrs")} · {t(serviceBand(e.joined, YEAR)).toLowerCase()}</div></Td>
                    <Td>{findEmp(data, e.managerId)?.name.split(" ")[0] ?? "–"}</Td>
                    <Td right>{n1(al.available ?? 0)} <span className="text-sm text-slate-400">/ {n1(al.total ?? 0)}</span></Td>
                    <Td right>{n1(sl.available ?? 0)} <span className="text-sm text-slate-400">/ {n1(sl.total ?? 0)}</span></Td>
                    <Td>{t(e.role === "hr" ? "HR admin" : e.role === "manager" ? "Manager" : "Employee")}</Td>
                    <Td right>
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(e)} title={t("Edit details")} className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><UserPen size={17} /></button>
                        <button onClick={() => setAdjust(e)} title={t("Adjust leave")} className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><SlidersHorizontal size={17} /></button>
                        <button onClick={() => setManual(e)} title={t("Enter attendance by hand")} className="relative rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600"><CalendarClock size={17} />{missing.some((m) => m.empId === e.id) && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-amber-500" />}</button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("Year end: carry into {year}", { year: YEAR + 1 })}>
          <p className="text-sm text-slate-600">{t("On 1 January everyone gets a new year's entitlement. Unused annual leave carries over, up to {max} days, to be used by {date}. You can change a figure before the year closes.", { max: data.settings.carryMaxDays, date: fmtDate(`${YEAR + 1}-${data.settings.carryExpiry}`, { day: "numeric", month: "long" }) })}</p>
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {list.filter((e) => e.active).map((e) => {
              const set = data.carry[e.id]?.[YEAR + 1];
              const auto = yearEndCarry(data, e, YEAR);
              return (
                <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{e.name}<span className="ml-2 text-slate-400">{t("carried into {year}", { year: YEAR })}: {carryInto(data, e, YEAR)}</span></span>
                  <span className="flex items-center gap-2">
                    <input type="number" min={0} max={data.settings.carryMaxDays} step={0.5} value={set ?? auto} onChange={async (x) => { const r = await setCarry(e.id, YEAR + 1, Math.max(0, Math.min(data.settings.carryMaxDays, Number(x.target.value)))); if (!r.ok) say(r.text); }} className="w-16 rounded border border-slate-300 px-2 py-1 text-right" aria-label={`${t("Days carried into {year} for", { year: YEAR + 1 })} ${e.name}`} />
                    <span className="w-14 text-xs text-slate-400">{t(set === undefined ? "auto" : "set by HR")}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card title={t("Leave adjustments this year")}>
          {data.adjustments.length === 0 ? <p className="text-sm text-slate-500">{t("None yet.")}</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.adjustments.slice().reverse().map((a, i) => <li key={i} className="py-2"><b className="font-medium">{findEmp(data, a.empId)?.name}</b>: {a.days > 0 ? "+" : ""}{dayTxt(a.days, t)} {t(LEAVE_TYPES.find((x) => x.code === a.type)!.short).toLowerCase()}<div className="text-slate-500">{a.reason} · {fmtDate(a.at)} {t("by")} {(a.byName ?? findEmp(data, a.by)?.name ?? "HR").split(" ")[0]}</div></li>)}
            </ul>
          )}
        </Card>
      </div>

      {editing && <EditEmployee e={editing} onClose={() => setEditing(null)} onDone={(m) => { setEditing(null); say(m); }} />}
      {adjust && <AdjustLeave e={adjust} onClose={() => setAdjust(null)} onDone={(m) => { setAdjust(null); say(m); }} />}
      {manual && <ManualAttendance e={manual} onClose={() => setManual(null)} onDone={(m) => { setManual(null); say(m); }} />}
    </div>
  );
}

function EditEmployee({ e, onClose, onDone }: { e: Employee; onClose: () => void; onDone: (t: string) => void }) {
  const { t } = useT();
  const { data, saveEmployee } = useHr();
  const [f, setF] = useState(e);
  const [err, setErr] = useState("");
  const set = <K extends keyof Employee>(k: K, v: Employee[K]) => setF((x) => ({ ...x, [k]: v }));
  const ok = f.name.trim() && f.code.trim() && f.joined && /\S+@\S+\.\S+/.test(f.email);
  const [busy, setBusy] = useState(false);
  async function save() { setBusy(true); const r = await saveEmployee({ ...f, name: f.name.trim(), code: f.code.trim().toUpperCase() }); setBusy(false); if (r.ok) onDone(r.text); else setErr(r.text); }
  return (
    <Modal title={e.id ? t("Edit {name}", { name: e.name.split(" ")[0] }) : t("Add employee")} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3 text-sm font-medium text-slate-700">
        <label className="col-span-2">{t("Full name (as in IC)")}<input value={f.name} onChange={(x) => set("name", x.target.value)} className={field} /></label>
        <label>{t("Employee code")}<input value={f.code} onChange={(x) => set("code", x.target.value)} className={field} /></label>
        <label>{t("Date joined")}<input type="date" value={f.joined} max={TODAY} onChange={(x) => set("joined", x.target.value)} className={field} /></label>
        <label>{t("Position")}<input value={f.position} onChange={(x) => set("position", x.target.value)} className={field} /></label>
        <label>{t("Department")}<input value={f.dept} onChange={(x) => set("dept", x.target.value)} className={field} /></label>
        <label>{t("Gender")}<select value={f.gender} onChange={(x) => set("gender", x.target.value as "F" | "M")} className={field}><option value="F">{t("Female")}</option><option value="M">{t("Male")}</option></select></label>
        <label>{t("State (for holidays)")}<select value={f.state} onChange={(x) => set("state", x.target.value)} className={field}>{STATES.map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>{t("Direct manager")}<select value={f.managerId ?? ""} onChange={(x) => set("managerId", x.target.value || null)} className={field}><option value="">{t("None (HR approves)")}</option>{data.employees.filter((y) => y.id !== f.id && y.active && y.role !== "employee").map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select></label>
        <label>{t("Clocks in")}<select value={f.workType ?? "office"} onChange={(x) => set("workType", x.target.value as WorkType)} className={field}>{WORK_TYPES.map((w) => <option key={w.code} value={w.code}>{t(w.name)}</option>)}</select></label>
        <label>{t("Work schedule")}<select value={f.schedule ?? "office"} onChange={(x) => set("schedule", x.target.value as Schedule)} className={field}>{SCHEDULES.map((w) => <option key={w.code} value={w.code}>{t(w.name)}</option>)}</select></label>
        <label>{t("Access")}<select value={f.role} onChange={(x) => set("role", x.target.value as Employee["role"])} className={field}><option value="employee">{t("Employee")}</option><option value="manager">{t("Manager")}</option><option value="hr">{t("HR admin")}</option></select></label>
        <label>{t("Email (login)")}<input type="email" value={f.email} onChange={(x) => set("email", x.target.value)} className={field} /></label>
        <label>{t("Phone")}<input value={f.phone} onChange={(x) => set("phone", x.target.value)} className={field} /></label>
        <label className="col-span-2 flex items-center gap-2 font-normal"><input type="checkbox" checked={f.active} onChange={(x) => set("active", x.target.checked)} className="h-4 w-4" /> {t("Still working here (untick when someone leaves; their records stay)")}</label>
      </div>
      <p className="mt-3 text-sm text-slate-500">{t("Entitlement in {year}: {band} of service.", { year: YEAR, band: t(serviceBand(f.joined, YEAR)).toLowerCase() })}</p>
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{t(err)}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} className={btnLine}>{t("Cancel")}</button><button disabled={!ok || busy} onClick={save} className={btnBlue}>{t(busy ? "Saving…" : "Save")}</button></div>
    </Modal>
  );
}

function AdjustLeave({ e, onClose, onDone }: { e: Employee; onClose: () => void; onDone: (t: string) => void }) {
  const { t } = useT();
  const { data, adjustLeave } = useHr();
  const [type, setType] = useState<LeaveType>("AL");
  const [days, setDays] = useState("1");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const b = balance(data, e, type), n = Number(days);
  return (
    <Modal title={t("Adjust {name}'s leave", { name: e.name.split(" ")[0] })} onClose={onClose}>
      <p className="text-sm text-slate-600">{t("Add days (for example a replacement day for working on a holiday) or take days off with a minus number. Every change is logged with your name.")}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-medium text-slate-700">
        <label>{t("Leave type")}<select value={type} onChange={(x) => setType(x.target.value as LeaveType)} className={field}>{LEAVE_TYPES.filter((y) => y.code !== "UL" && (y.code !== "ML" || e.gender === "F")).map((y) => <option key={y.code} value={y.code}>{t(y.name)}</option>)}</select></label>
        <label>{t("Days (+ or −)")}<input value={days} onChange={(x) => setDays(x.target.value)} inputMode="decimal" className={field} /></label>
        <label className="col-span-2">{t("Reason")}<input value={reason} onChange={(x) => setReason(x.target.value)} className={field} placeholder={t("Shown in the adjustment log")} /></label>
      </div>
      <p className="mt-3 text-sm text-slate-600">{t("Available now")}: {dayTxt(b.available ?? 0, t)} → {t("after")}: <b>{Number.isFinite(n) ? dayTxt(Math.max(0, (b.available ?? 0) + n), t) : "–"}</b></p>
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{t(err)}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} className={btnLine}>{t("Cancel")}</button><button disabled={!reason.trim() || !Number.isFinite(n) || n === 0} onClick={async () => { const r = await adjustLeave(e.id, type, n, reason); if (r.ok) onDone(r.text); else setErr(r.text); }} className={btnBlue}>{t("Save adjustment")}</button></div>
    </Modal>
  );
}

function ManualAttendance({ e, onClose, onDone }: { e: Employee; onClose: () => void; onDone: (t: string) => void }) {
  const { t } = useT();
  const { data, setAttendance } = useHr();
  const missing = data.attendance.filter((a) => a.empId === e.id && a.inMin != null && a.outMin == null && a.date !== TODAY);
  const pick = (d: string) => { const a = data.attendance.find((x) => x.empId === e.id && x.date === d); return { tin: a?.inMin != null ? fmtHM(a.inMin) : data.settings.workStart, tout: a?.outMin != null ? fmtHM(a.outMin) : data.settings.workEnd }; };
  const [date, setDate] = useState(missing[0]?.date ?? TODAY);
  const [times, setTimes] = useState(pick(missing[0]?.date ?? TODAY));
  const [note, setNote] = useState(missing[0] ? t("Forgot to clock out") : "");
  const [err, setErr] = useState("");
  return (
    <Modal title={t("Attendance for {name}", { name: e.name.split(" ")[0] })} onClose={onClose}>
      {missing.length > 0 && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{t("Missing clock-out on")} {missing.map((m) => fmtDate(m.date, { day: "numeric", month: "short" })).join(", ")}.</p>}
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-medium text-slate-700">
        <label className="col-span-2">{t("Date")}<input type="date" value={date} max={TODAY} onChange={(x) => { setDate(x.target.value); setTimes(pick(x.target.value)); }} className={field} /></label>
        <label>{t("In")}<input type="time" value={times.tin} onChange={(x) => setTimes({ ...times, tin: x.target.value })} className={field} /></label>
        <label>{t("Out")}<input type="time" value={times.tout} onChange={(x) => setTimes({ ...times, tout: x.target.value })} className={field} /></label>
        <label className="col-span-2">{t("Note (why it was entered by hand)")}<input value={note} onChange={(x) => setNote(x.target.value)} className={field} placeholder={t("For example: phone battery flat, confirmed by manager")} /></label>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{t(err)}</p>}
      <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={onClose} className={btnLine}>{t("Cancel")}</button><button disabled={!note.trim()} onClick={async () => { const r = await setAttendance(e.id, date, hm(times.tin), hm(times.tout), note); if (r.ok) onDone(r.text); else setErr(r.text); }} className={btnBlue}>{t("Save")}</button></div>
    </Modal>
  );
}
