"use client";
import { useMemo, useState } from "react";
import { staffEmail } from "@/lib/staffLogin";

export type StaffPick = { code: string; name: string; position: string; email: string | null; hasLogin: boolean };
export type NewStaffLogin = { code: string; full_name: string; password: string; role: string; salesman_code: string };
type Role = { name: string; label: string };

/** Create a login for someone with no email: they sign in with their employee code and a password. */
export function StaffLoginForm({ staff, roles, salesmen, password, newPassword, busy, onCreate, onCancel }: {
  staff: StaffPick[]; roles: Role[]; salesmen: { code: string; name: string }[];
  password: string; newPassword: () => string; busy: boolean;
  onCreate: (x: NewStaffLogin) => void; onCancel: () => void;
}) {
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");
  const [f, setF] = useState({ full_name: "", password, role: roles.some((r) => r.name === "staff") ? "staff" : roles[0]?.name ?? "", salesman_code: "" });
  const sel = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-700";
  // people without an email or a login first: they are the ones this is for
  const list = useMemo(() => staff
    .filter((s) => !q || `${s.code} ${s.name} ${s.position}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(a.hasLogin) - Number(b.hasLogin) || Number(!!a.email) - Number(!!b.email) || a.name.localeCompare(b.name)), [staff, q]);
  const picked = staff.find((s) => s.code === code);
  const pick = (c: string) => { const s = staff.find((x) => x.code === c); setCode(c); if (s) setF((x) => ({ ...x, full_name: s.name })); };

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-sm font-medium text-slate-600 sm:col-span-2 lg:col-span-1">Find the employee
          <input className={sel} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, code or job title" />
        </label>
        <label className="text-sm font-medium text-slate-600 sm:col-span-2">Employee (from HR › Employees)
          <select className={sel} value={code} onChange={(e) => pick(e.target.value)} size={Math.min(6, Math.max(3, list.length))}>
            {list.map((s) => <option key={s.code} value={s.code} disabled={s.hasLogin}>{s.code} · {s.name}{s.position ? ` · ${s.position}` : ""}{s.hasLogin ? " · has a login" : s.email ? " · has an email" : ""}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium text-slate-600">Name shown in the app<input className={sel} value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></label>
        <label className="text-sm font-medium text-slate-600">First password (at least 8 characters)
          <span className="flex gap-2"><input className={sel} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            <button type="button" onClick={() => setF({ ...f, password: newPassword() })} className="shrink-0 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-100">New</button></span>
        </label>
        <label className="text-sm font-medium text-slate-600">Role
          <select className={sel} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>{roles.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}</select>
        </label>
        <label className="text-sm font-medium text-slate-600">Salesman (for roles that only see their own customers)
          <select className={sel} value={f.salesman_code} onChange={(e) => setF({ ...f, salesman_code: e.target.value })}>
            <option value="">Not a salesman</option>{salesmen.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
          </select>
        </label>
      </div>
      {picked && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {picked.name.split(" ")[0]} signs in with staff code <b className="font-semibold">{picked.code}</b> and the password above. No email is needed or sent.
          {picked.email && <span className="block text-amber-800">This employee already has an email ({picked.email}). They could sign in with that instead; a staff code login replaces it on their HR record.</span>}
          <span className="block text-xs text-slate-500">Login address kept by the system: {staffEmail(picked.code)}</span>
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button disabled={busy || !picked || picked.hasLogin || !f.full_name.trim() || f.password.length < 8}
          onClick={() => onCreate({ code: picked!.code, ...f, full_name: f.full_name.trim() })}
          className="rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{busy ? "Creating…" : "Create staff login"}</button>
        <button onClick={onCancel} className="rounded-md border border-slate-300 px-4 py-2 text-base hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  );
}
