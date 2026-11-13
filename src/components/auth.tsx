"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export type Profile = { id: string; full_name: string | null; role: string; salesman_code: string | null; active: boolean; protected: boolean };
export type RoleInfo = { name: string; label: string; is_super: boolean; is_system: boolean; sort: number };

type Ctx = {
  session: Session | null;
  profile: Profile | null;
  roleInfo: RoleInfo | null;
  /** true until the first session check (and profile load) has finished */
  loading: boolean;
  isSuper: boolean;
  /** the signed-in person's real permission (super admin passes everything) */
  realCan: (permission: string) => boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setRoleInfo(null); setPerms(new Set()); return; }
    const { data: p } = await supabase.from("profiles").select("id, full_name, role, salesman_code, active, protected").eq("id", s.user.id).maybeSingle();
    const prof = (p as Profile | null) ?? null;
    setProfile(prof);
    if (!prof) { setRoleInfo(null); setPerms(new Set()); return; }
    const [{ data: r }, { data: g }] = await Promise.all([
      supabase.from("roles").select("name, label, is_super, is_system, sort").eq("name", prof.role).maybeSingle(),
      supabase.from("role_permissions").select("permission").eq("role", prof.role).eq("allowed", true),
    ]);
    setRoleInfo((r as RoleInfo | null) ?? null);
    setPerms(new Set(((g ?? []) as { permission: string }[]).map((x) => x.permission)));
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session);
      if (active) setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Defer so the auth callback is not blocked by another request.
      setTimeout(() => { void loadProfile(s); }, 0);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const isSuper = !!roleInfo?.is_super && !!profile?.active;
  const value: Ctx = {
    session, profile, roleInfo, loading, isSuper,
    realCan: (p) => !!profile?.active && (isSuper || perms.has(p)),
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signOut: async () => { await supabase.auth.signOut(); },
    refreshProfile: async () => { await loadProfile(session); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
