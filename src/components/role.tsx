"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth, type RoleInfo } from "./auth";
import { useData } from "./data";
import { supabase } from "@/lib/supabase";

type Ctx = {
  /** permission check for what is being shown (a preview role for admins, otherwise the person's own role) */
  can: (permission: string) => boolean;
  /** the person's own permission, ignoring any preview */
  realCan: (permission: string) => boolean;
  /** the role being shown */
  role: string;
  roleLabel: string;
  /** admins can preview how another role sees the app */
  canPreview: boolean;
  roles: RoleInfo[];
  setRole: (r: string) => void;
  salesmanCode: string;
  setSalesmanCode: (c: string) => void;
  /** salesman code to filter by, or null = see everyone */
  filterSalesman: string | null;
  previewing: boolean;
  /** daily supervisor check-off, keyed by panel name */
  verified: Record<string, boolean>;
  toggleVerified: (panel: string) => void;
};

const RoleCtx = createContext<Ctx | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const { profile, roleInfo, realCan } = useAuth();
  const { salesmen } = useData();
  const canPreview = realCan("roles_manage");
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [view, setView] = useState<{ role?: string; salesmanCode?: string }>({});
  const [preview, setPreview] = useState<{ role: string; isSuper: boolean; perms: Set<string> } | null>(null);
  const [verified, setVerified] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!canPreview) return;
    let active = true;
    supabase.from("roles").select("name, label, is_super, is_system, sort").order("sort").then(({ data }) => { if (active) setRoles((data ?? []) as RoleInfo[]); });
    return () => { active = false; };
  }, [canPreview]);

  async function setRole(name: string) {
    if (!canPreview) return;
    if (name === profile?.role) { setPreview(null); setView({}); return; }
    const info = roles.find((r) => r.name === name);
    const { data } = await supabase.from("role_permissions").select("permission").eq("role", name).eq("allowed", true);
    setPreview({ role: name, isSuper: !!info?.is_super, perms: new Set(((data ?? []) as { permission: string }[]).map((x) => x.permission)) });
    setView((v) => ({ ...v, role: name }));
  }

  const previewing = !!preview && canPreview;
  const can = (p: string) => (previewing ? preview!.isSuper || preview!.perms.has(p) : realCan(p));
  const role = previewing ? preview!.role : profile?.role ?? "pending";
  const roleLabel = previewing ? roles.find((r) => r.name === role)?.label ?? role : roleInfo?.label ?? role;
  const salesmanCode = (previewing ? view.salesmanCode : undefined) ?? (previewing ? salesmen[0]?.code : profile?.salesman_code) ?? "";

  return (
    <RoleCtx.Provider
      value={{
        can, realCan, role, roleLabel, canPreview, roles, setRole: (r) => void setRole(r), salesmanCode,
        setSalesmanCode: (c) => setView((v) => ({ ...v, salesmanCode: c })),
        filterSalesman: can("view_all_data") ? null : salesmanCode,
        previewing, verified,
        toggleVerified: (p) => setVerified((v) => ({ ...v, [p]: !v[p] })),
      }}
    >
      {children}
    </RoleCtx.Provider>
  );
}

export function useRole() {
  const c = useContext(RoleCtx);
  if (!c) throw new Error("useRole outside RoleProvider");
  return c;
}
