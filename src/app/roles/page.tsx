"use client";
import { useCallback, useEffect, useState } from "react";
import { Lock, Plus, Trash2 } from "lucide-react";
import { useAuth, type RoleInfo } from "@/components/auth";
import { Card, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";

type Perm = { key: string; label: string; grp: string; sort: number };

export default function RolesPage() {
  const { realCan } = useAuth();
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [perms, setPerms] = useState<Perm[]>([]);
  const [grants, setGrants] = useState<Set<string>>(new Set()); // "role|permission"
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [r, p, g] = await Promise.all([
      supabase.from("roles").select("name, label, is_super, is_system, sort").order("sort"),
      supabase.from("permissions").select("key, label, grp, sort").order("sort"),
      supabase.from("role_permissions").select("role, permission").eq("allowed", true),
    ]);
    setRoles(((r.data ?? []) as RoleInfo[]).filter((x) => x.name !== "pending"));
    setPerms((p.data ?? []) as Perm[]);
    setGrants(new Set(((g.data ?? []) as { role: string; permission: string }[]).map((x) => `${x.role}|${x.permission}`)));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  if (!realCan("roles_manage")) return <p className="text-slate-600">You do not have permission to edit roles.</p>;

  async function toggle(role: string, permission: string, on: boolean) {
    setError(null);
    const key = `${role}|${permission}`;
    setGrants((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; }); // show the change at once
    const { error: e } = await supabase.from("role_permissions").upsert({ role, permission, allowed: on });
    if (e) { setError(e.message); await load(); }
  }

  async function addRole() {
    setError(null);
    const label = name.trim();
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!slug) { setError("Enter a name for the role."); return; }
    const { error: e } = await supabase.from("roles").insert({ name: slug, label, is_system: false, is_super: false, sort: 60 + roles.length });
    if (e) { setError(e.code === "23505" ? "A role with that name already exists." : e.message); return; }
    if (copyFrom) {
      const rows = perms.filter((p) => grants.has(`${copyFrom}|${p.key}`)).map((p) => ({ role: slug, permission: p.key, allowed: true }));
      if (rows.length) { const { error: e2 } = await supabase.from("role_permissions").insert(rows); if (e2) setError(e2.message); }
    }
    setName(""); setCopyFrom("");
    await load();
  }

  async function removeRole(r: string) {
    setError(null);
    const { error: e } = await supabase.from("roles").delete().eq("name", r);
    if (e) setError(e.code === "23503" ? "Some users still have this role. Move them to another role first." : e.message);
    setConfirmDelete(null);
    await load();
  }

  const groups = Array.from(new Set(perms.map((p) => p.grp)));
  const cell = (r: RoleInfo, p: Perm) => (r.is_super ? true : grants.has(`${r.name}|${p.key}`));

  return (
    <>
      <PageHeader title="Roles & permissions" sub="Tick what each role may see and do. Changes apply the next time that person opens a page. The super admin always has everything." />
      {error && <p role="alert" className="mb-4 rounded bg-rose-50 px-3 py-2 text-rose-800">{error}</p>}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="sticky left-0 z-[1] bg-white px-3 py-2 text-left text-sm font-medium text-slate-500">Permission</th>
                {roles.map((r) => (
                  <th key={r.name} className="px-3 py-2 text-center text-sm font-semibold text-slate-800">
                    <div className="flex items-center justify-center gap-1">{r.is_super && <Lock size={13} aria-label="Locked" />}{r.label}</div>
                    {!r.is_system && !r.is_super && (confirmDelete === r.name ? (
                      <button onClick={() => void removeRole(r.name)} className="mt-1 rounded bg-rose-600 px-2 py-0.5 text-xs font-medium text-white">Confirm delete</button>
                    ) : (
                      <button onClick={() => setConfirmDelete(r.name)} aria-label={`Delete role ${r.label}`} className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-rose-700 hover:underline"><Trash2 size={12} /> Delete</button>
                    ))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <GroupRows key={g} group={g} perms={perms.filter((p) => p.grp === g)} roles={roles} cell={cell} toggle={toggle} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Add a role" className="mt-5">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-slate-600">Role name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Warehouse" className="mt-1 block w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base" />
          </label>
          <label className="text-sm font-medium text-slate-600">Start with the permissions of
            <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)} className="mt-1 block w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base">
              <option value="">Nothing ticked</option>
              {roles.filter((r) => !r.is_super).map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
            </select>
          </label>
          <button onClick={() => void addRole()} className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700"><Plus size={16} /> Add role</button>
        </div>
        <p className="mt-3 text-sm text-slate-500">The built-in roles (Management, Supervisor, Salesperson) can have their permissions changed but cannot be deleted. A role without &quot;See everyone&apos;s data&quot; only sees its own salesman&apos;s customers, sales and claims.</p>
      </Card>
    </>
  );
}

function GroupRows({ group, perms, roles, cell, toggle }: { group: string; perms: Perm[]; roles: RoleInfo[]; cell: (r: RoleInfo, p: Perm) => boolean; toggle: (role: string, permission: string, on: boolean) => Promise<void> }) {
  return (
    <>
      <tr><td colSpan={roles.length + 1} className="bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-600">{group}</td></tr>
      {perms.map((p) => (
        <tr key={p.key} className="border-b border-slate-100 last:border-0">
          <td className="sticky left-0 z-[1] bg-white px-3 py-2 text-base text-slate-700">{p.label}</td>
          {roles.map((r) => (
            <td key={r.name} className="px-3 py-2 text-center">
              <input type="checkbox" className="h-5 w-5" checked={cell(r, p)} disabled={r.is_super} onChange={(e) => void toggle(r.name, p.key, e.target.checked)} aria-label={`${r.label}: ${p.label}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
