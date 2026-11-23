"use client";
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Plus, RefreshCw } from "lucide-react";
import { useAuth, type RoleInfo } from "@/components/auth";
import { useData } from "@/components/data";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { staffCodeOf, staffEmail } from "@/lib/staffLogin";
import { StaffLoginForm, type NewStaffLogin, type StaffPick } from "@/components/users/StaffLoginForm";
import { BulkLogins, type BulkResult, type BulkRow } from "@/components/users/BulkLogins";

type UserRow = { id: string; email: string; full_name: string | null; role: string; salesman_code: string | null; active: boolean; protected: boolean; last_sign_in_at: string | null; confirmed: boolean };
type Draft = { full_name: string; role: string; salesman_code: string; active: boolean; password: string };

// Calls the admin-users edge function, which checks the caller's permission on the server.
async function callAdmin<T = unknown>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as unknown as { context: Response }).context.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return data as T;
}

const newPassword = () => {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = new Uint32Array(12);
  crypto.getRandomValues(b);
  return Array.from(b, (n) => chars[n % chars.length]).join("");
};
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Never");

export default function UsersPage() {
  const { realCan, profile } = useAuth();
  const { salesmen } = useData();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: newPassword(), role: "salesperson", salesman_code: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"email" | "staff">("email");
  const [bulk, setBulk] = useState(false);
  const [staff, setStaff] = useState<{ code: string; name: string; position: string; email: string | null }[]>([]);

  const load = useCallback(async () => {
    try {
      const [r, list, hr] = await Promise.all([
        supabase.from("roles").select("name, label, is_super, is_system, sort").order("sort"),
        callAdmin<{ users: UserRow[] }>({ action: "list" }),
        supabase.from("hr_employees").select("code, name, position, email").eq("active", true).order("code"),
      ]);
      setRoles((r.data ?? []) as RoleInfo[]);
      setStaff((hr.data ?? []) as typeof staff);
      setUsers(list.users);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load users."); }
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (!realCan("users_manage")) return <p className="text-slate-600">You do not have permission to manage users.</p>;

  const assignable = roles.filter((r) => !r.is_super && r.name !== "pending");
  const roleLabel = (n: string) => roles.find((r) => r.name === n)?.label ?? n;
  const sel = "w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-700";

  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setError(null); setNotice(null);
    try { await fn(); setNotice(ok); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); }
    setBusy(false);
  }

  // who already has a login: by their staff code login, or by the email on their HR record
  const logins = new Set(users.map((u) => u.email.toLowerCase()));
  const picks: StaffPick[] = staff.map((s) => ({ ...s, hasLogin: logins.has(staffEmail(s.code)) || (!!s.email && logins.has(s.email.toLowerCase())) }));

  async function createStaff(x: NewStaffLogin) {
    await run(async () => {
      await callAdmin({ action: "create", email: staffEmail(x.code), staff_code: x.code, full_name: x.full_name, password: x.password, role: x.role, salesman_code: x.salesman_code || null });
      setAdding(false);
    }, `Created a login for ${x.full_name}. They sign in with username ${x.code} and the password ${x.password}. They can change it on My account.`);
  }

  // one login after another, so each result (and any refusal) is known
  async function createMany(rows: BulkRow[], progress: (n: number) => void): Promise<BulkResult[]> {
    const out: BulkResult[] = [];
    for (const [i, x] of rows.entries()) {
      try {
        await callAdmin({ action: "create", email: x.email ?? staffEmail(x.code), ...(x.email ? {} : { staff_code: x.code }), full_name: x.name, password: x.password, role: x.role, salesman_code: x.salesman_code || null });
        out.push({ code: x.code, ok: true, text: "Created" });
      } catch (e) { out.push({ code: x.code, ok: false, text: e instanceof Error ? e.message : "Not created" }); }
      progress(i + 1);
    }
    await load();
    return out;
  }

  async function create() {
    await run(async () => {
      await callAdmin({ action: "create", ...form, salesman_code: form.salesman_code || null });
      setAdding(false);
    }, `Created ${form.email}. Give them this email and the password ${form.password}. They can change it on My account.`);
    setForm({ full_name: "", email: "", password: newPassword(), role: "salesperson", salesman_code: "" });
  }

  return (
    <>
      <PageHeader title="Users" sub="Create, edit and delete the people who can sign in. There is no public sign-up."
        right={<div className="flex gap-2">
          <button onClick={() => void load()} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"><RefreshCw size={15} /> Refresh</button>
          <button onClick={() => { setBulk(!bulk); setAdding(false); setNotice(null); }} className="inline-flex items-center gap-1 rounded-lg border border-indigo-300 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"><KeyRound size={15} /> Logins for staff without one</button>
          <button onClick={() => { setAdding(!adding); setBulk(false); setNotice(null); }} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus size={16} /> Add user</button>
        </div>} />
      {error && <p role="alert" className="mb-4 rounded bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
      {notice && <p role="status" className="mb-4 rounded bg-emerald-50 px-3 py-2 text-emerald-800">{notice}</p>}

      {bulk && (
        <Card title="Create logins for staff without one" className="mb-5">
          <BulkLogins staff={picks.filter((x) => !x.hasLogin)} roles={assignable} salesmen={salesmen} newPassword={newPassword}
            needsSalesman={(r) => r === "salesperson"} onCreate={createMany} onClose={() => setBulk(false)} />
        </Card>
      )}

      {adding && (
        <Card title="New user" className="mb-5">
          <div className="mb-4 inline-flex rounded-md border border-slate-300 p-0.5 text-sm" role="radiogroup" aria-label="Signs in with">
            {([["email", "Signs in with email"], ["staff", "Signs in with username (no email)"]] as const).map(([k, l]) => <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={`rounded px-3 py-1.5 ${mode === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>)}
          </div>
          {mode === "staff" ? <StaffLoginForm staff={picks} roles={assignable} salesmen={salesmen} password={newPassword()} newPassword={newPassword} busy={busy} onCreate={(x) => void createStaff(x)} onCancel={() => setAdding(false)} /> : <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="text-sm font-medium text-slate-600">Name<input className={sel} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></label>
            <label className="text-sm font-medium text-slate-600">Email<input className={sel} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
            <label className="text-sm font-medium text-slate-600">Password (at least 8 characters)
              <span className="flex gap-2"><input className={sel} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                <button type="button" onClick={() => setForm({ ...form, password: newPassword() })} className="shrink-0 rounded-md border border-slate-300 px-3 text-sm hover:bg-slate-100">New</button></span>
            </label>
            <label className="text-sm font-medium text-slate-600">Role
              <select className={sel} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{assignable.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}</select>
            </label>
            <label className="text-sm font-medium text-slate-600">Salesman (for roles that only see their own customers)
              <select className={sel} value={form.salesman_code} onChange={(e) => setForm({ ...form, salesman_code: e.target.value })}>
                <option value="">Not a salesman</option>{salesmen.map((s) => <option key={s.code} value={s.code}>{s.name} ({s.code})</option>)}
              </select>
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button disabled={busy || !form.email || !form.full_name} onClick={() => void create()} className="rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{busy ? "Creating…" : "Create user"}</button>
            <button onClick={() => setAdding(false)} className="rounded-md border border-slate-300 px-4 py-2 text-base hover:bg-slate-100">Cancel</button>
          </div>
          </>}
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Name</Th><Th>Role</Th><Th>Salesman</Th><Th>Status</Th><Th>Last sign in</Th><Th></Th></tr></thead>
            <tbody>
              {users.map((u) => {
                const editing = editId === u.id && draft;
                const me = u.id === profile?.id;
                return (
                  <tr key={u.id} className="border-b border-slate-100 align-top last:border-0">
                    <Td first>
                      {editing ? <input className={sel} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} aria-label="Name" /> : <><b>{u.full_name ?? "—"}</b>{me && <span className="ml-2"><Badge tone="blue">You</Badge></span>}</>}
                      <div className="text-sm text-slate-500">{staffCodeOf(u.email) ? `Username ${staffCodeOf(u.email)} (no email)` : u.email}</div>
                    </Td>
                    <Td>
                      {u.protected ? <Badge tone="amber">Super admin · protected</Badge> : editing ? (
                        <select className={sel} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} aria-label="Role">
                          {assignable.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
                          {!assignable.some((r) => r.name === draft.role) && <option value={draft.role}>{roleLabel(draft.role)}</option>}
                        </select>
                      ) : roleLabel(u.role)}
                    </Td>
                    <Td>
                      {editing ? (
                        <select className={sel} value={draft.salesman_code} onChange={(e) => setDraft({ ...draft, salesman_code: e.target.value })} aria-label="Salesman">
                          <option value="">—</option>{salesmen.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                      ) : salesmen.find((s) => s.code === u.salesman_code)?.name ?? (u.salesman_code ?? "—")}
                    </Td>
                    <Td>
                      {editing && !me ? (
                        <label className="flex items-center gap-2"><input className="h-5 w-5" type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Active</label>
                      ) : <Badge tone={u.active ? "green" : "grey"}>{u.active ? "Active" : "Switched off"}</Badge>}
                      {!u.confirmed && !staffCodeOf(u.email) && <div className="mt-1 text-sm text-amber-700">Email not confirmed</div>}
                    </Td>
                    <Td>{when(u.last_sign_in_at)}</Td>
                    <Td>
                      {u.protected ? <span className="text-sm text-slate-400">Cannot be edited or deleted</span> : editing ? (
                        <div className="flex flex-col gap-2">
                          <input className={sel} placeholder="New password (optional)" value={draft.password} onChange={(e) => setDraft({ ...draft, password: e.target.value })} aria-label="New password" />
                          <div className="flex gap-2">
                            <button disabled={busy} onClick={() => void run(async () => { await callAdmin({ action: "update", id: u.id, full_name: draft.full_name, role: draft.role, salesman_code: draft.salesman_code || null, ...(me ? {} : { active: draft.active }), ...(draft.password ? { password: draft.password } : {}) }); setEditId(null); setDraft(null); }, "Saved.")} className="rounded-md bg-indigo-600 px-3 py-1.5 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-40">Save</button>
                            <button onClick={() => { setEditId(null); setDraft(null); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-base hover:bg-slate-100">Cancel</button>
                          </div>
                        </div>
                      ) : deleteId === u.id ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm text-rose-700">Delete {u.full_name}? This cannot be undone.</span>
                          <button disabled={busy} onClick={() => void run(async () => { await callAdmin({ action: "delete", id: u.id }); setDeleteId(null); }, "User deleted.")} className="rounded-md bg-rose-600 px-3 py-1.5 text-base font-medium text-white disabled:opacity-40">Yes, delete</button>
                          <button onClick={() => setDeleteId(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-base hover:bg-slate-100">Cancel</button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <button onClick={() => { setEditId(u.id); setDraft({ full_name: u.full_name ?? "", role: u.role, salesman_code: u.salesman_code ?? "", active: u.active, password: "" }); setNotice(null); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-base hover:bg-slate-100">Edit</button>
                          {!me && <button onClick={() => setDeleteId(u.id)} className="rounded-md border border-rose-300 px-3 py-1.5 text-base text-rose-700 hover:bg-rose-50">Delete</button>}
                        </div>
                      )}
                    </Td>
                  </tr>
                );
              })}
              {!users.length && !loading && <tr><Td>No users yet.</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
