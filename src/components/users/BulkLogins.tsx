"use client";
import { useEffect, useRef, useState } from "react";
import { Download, KeyRound } from "lucide-react";
import { staffEmail } from "@/lib/staffLogin";

export type BulkStaff = { code: string; name: string; position: string; email: string | null };
export type BulkRow = { code: string; name: string; position: string; email: string | null; role: string; salesman_code: string; password: string };
export type BulkResult = { code: string; ok: boolean; text: string };
type Role = { name: string; label: string };

/** The role a job title starts with. HR can change any row before creating. */
export function roleFor(position: string, roles: Role[]): string {
  const p = position.trim().toLowerCase();
  const want = p === "director" ? "director" : p === "manager" || p.endsWith(" manager") && !p.includes("finance") ? "management"
    : p === "supervisor" ? "supervisor" : p === "logistic supervisor" ? "logistics" : p.includes("hr") ? "hr"
    : p === "salesman" || p === "salesperson" ? "salesperson" : "staff";
  return roles.some((r) => r.name === want) ? want : roles.some((r) => r.name === "staff") ? "staff" : roles[0]?.name ?? "";
}
/** The salesman whose name shares the most words with the employee's name. */
export function salesmanFor(name: string, salesmen: { code: string; name: string }[]): string {
  const words = (s: string) => new Set(s.toUpperCase().replace(/[^A-Z ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["BIN", "BINTI"].includes(w)));
  const mine = words(name);
  let best = "", score = 0;
  for (const s of salesmen) { const n = [...words(s.name)].filter((w) => mine.has(w)).length; if (n > score) { best = s.code; score = n; } }
  return score >= 2 ? best : "";
}
const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/**
 * Make logins for every employee who has none, in one go. Each gets a first password made in this browser;
 * the list of usernames and passwords is downloaded once for HR to hand out, and is not kept anywhere.
 */
export function BulkLogins({ staff, roles, salesmen, newPassword, needsSalesman, onCreate, onClose }: {
  staff: BulkStaff[]; roles: Role[]; salesmen: { code: string; name: string }[]; newPassword: () => string;
  needsSalesman: (role: string) => boolean;
  onCreate: (rows: BulkRow[], progress: (done: number) => void) => Promise<BulkResult[]>; onClose: () => void;
}) {
  const [rows, setRows] = useState<BulkRow[]>(() => staff.map((s) => {
    const role = roleFor(s.position, roles);
    return { ...s, role, salesman_code: role === "salesperson" ? salesmanFor(s.name, salesmen) : "", password: newPassword() };
  }));
  const [picked, setPicked] = useState<Set<string>>(() => new Set(staff.map((s) => s.code)));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [saved, setSaved] = useState(false);
  const allBox = useRef<HTMLInputElement>(null);
  const all = rows.length > 0 && picked.size === rows.length;
  useEffect(() => { if (allBox.current) allBox.current.indeterminate = picked.size > 0 && !all; }, [picked.size, all]);
  const sel = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700";
  const chosen = rows.filter((r) => picked.has(r.code));
  const missing = chosen.filter((r) => needsSalesman(r.role) && !r.salesman_code);
  const set = (code: string, patch: Partial<BulkRow>) => setRows((x) => x.map((r) => (r.code === code ? { ...r, ...patch } : r)));
  const counts = Object.entries(chosen.reduce<Record<string, number>>((m, r) => ({ ...m, [r.role]: (m[r.role] ?? 0) + 1 }), {}));
  const label = (n: string) => roles.find((r) => r.name === n)?.label ?? n;

  async function create() {
    setBusy(true); setDone(0);
    const res = await onCreate(chosen, setDone);
    setResults(res); setBusy(false);
  }
  function download() {
    const ok = new Map((results ?? []).map((r) => [r.code, r]));
    const head = ["Employee code", "Name", "Sign in with", "First password", "Role", "Result"];
    const body = chosen.map((r) => { const x = ok.get(r.code); return [r.code, r.name, r.email ?? r.code, x?.ok ? r.password : "", label(r.role), x?.text ?? "Not created"]; });
    const text = "﻿" + [head, ...body].map((l) => l.map((c) => csvCell(String(c))).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "New logins - keep private.csv" }).click();
    URL.revokeObjectURL(url); setSaved(true);
  }

  if (results) {
    const good = results.filter((r) => r.ok).length;
    return (
      <div>
        <p className={`rounded-md px-3 py-2 ${good === results.length ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{good} of {results.length} logins created.{good < results.length ? " The ones not created are listed in the file with the reason." : ""}</p>
        <p className="mt-3 text-slate-700">Download the list now: the first passwords are shown only this once. Give each person only their own line, and ask them to change the password on My account.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={download} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700"><Download size={16} /> Download usernames and passwords</button>
          <button onClick={() => { if (saved || confirm("Close without downloading? The first passwords cannot be shown again; you would need to reset them one by one.")) onClose(); }} className="rounded-md border border-slate-300 px-4 py-2 text-base hover:bg-slate-100">Done</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {rows.length === 0 ? <p className="text-slate-600">Everyone on the staff list already has a login.</p> : <>
        <p className="text-sm text-slate-600">{rows.length} staff have no login. People with an email sign in with it; the others sign in with their employee code as username. Check the roles, then create.</p>
        <div className="mt-3 max-h-[28rem] overflow-auto rounded-md border border-slate-200">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-left text-slate-600"><tr>
              <th className="px-2 py-2"><input ref={allBox} type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(rows.map((r) => r.code)))} aria-label="Select all" className="h-4 w-4 accent-indigo-600" /></th>
              <th className="px-2 py-2 font-medium">Employee</th><th className="px-2 py-2 font-medium">Signs in with</th><th className="px-2 py-2 font-medium">Role</th><th className="px-2 py-2 font-medium">Salesman</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className={`border-t border-slate-100 ${picked.has(r.code) ? "" : "opacity-50"}`}>
                  <td className="px-2 py-1.5"><input type="checkbox" checked={picked.has(r.code)} onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(r.code)) n.delete(r.code); else n.add(r.code); return n; })} aria-label={`Include ${r.code}`} className="h-4 w-4 accent-indigo-600" /></td>
                  <td className="px-2 py-1.5"><div className="font-medium text-slate-900">{r.name}</div><div className="text-xs text-slate-500">{r.code} · {r.position || "–"}</div></td>
                  <td className="px-2 py-1.5 text-slate-700">{r.email ? <span title={r.email}>Email</span> : <>Username <b>{r.code}</b></>}</td>
                  <td className="px-2 py-1.5"><select className={sel} value={r.role} onChange={(e) => set(r.code, { role: e.target.value, salesman_code: e.target.value === "salesperson" ? r.salesman_code || salesmanFor(r.name, salesmen) : r.salesman_code })} aria-label={`Role for ${r.code}`}>{roles.map((x) => <option key={x.name} value={x.name}>{x.label}</option>)}</select></td>
                  <td className="px-2 py-1.5">{needsSalesman(r.role)
                    ? <select className={`${sel} ${!r.salesman_code ? "border-rose-400" : ""}`} value={r.salesman_code} onChange={(e) => set(r.code, { salesman_code: e.target.value })} aria-label={`Salesman for ${r.code}`}><option value="">Pick…</option>{salesmen.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code.slice(-2)})</option>)}</select>
                    : <span className="text-slate-400">–</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-600">{chosen.length} selected: {counts.map(([k, n]) => `${n} ${label(k)}`).join(", ") || "none"}.</p>
        {missing.length > 0 && <p className="mt-1 text-sm text-rose-700">Pick the salesman for {missing.map((r) => r.code).join(", ")}: their role only sees their own customers.</p>}
        <p className="mt-1 text-xs text-slate-500">Usernames use the private login address {staffEmail("CODE")}; no email is sent to anyone.</p>
      </>}
      <div className="mt-4 flex flex-wrap gap-2">
        {rows.length > 0 && <button disabled={busy || !chosen.length || missing.length > 0} onClick={() => void create()} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-40"><KeyRound size={16} /> {busy ? `Creating… ${done} of ${chosen.length}` : `Create ${chosen.length} logins`}</button>}
        <button disabled={busy} onClick={onClose} className="rounded-md border border-slate-300 px-4 py-2 text-base hover:bg-slate-100">Cancel</button>
      </div>
    </div>
  );
}
