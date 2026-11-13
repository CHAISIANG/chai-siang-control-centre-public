"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth";
import { buildCustomers, buildSalesmen, type Claim, type ClaimStatus, type Customer, type CustomerRow, type Lorry, type MonthlyRow, type Salesman, type SalesmanRow } from "@/lib/mock";
import { setCompanyLine, type FormKey } from "@/lib/paf";

export type ClaimFile = { id: number; claimId: string; kind: "photo" | "document"; name: string; path: string | null };

type Ctx = {
  loading: boolean;
  error: string | null;
  salesmen: Salesman[];
  customers: Customer[];
  claims: Claim[];
  claimFiles: ClaimFile[];
  lorries: Lorry[];
  reloadClaims: () => Promise<void>;
  reloadLorries: () => Promise<void>;
};

const DataCtx = createContext<Ctx | null>(null);

type ClaimRow = {
  id: string; form_key: FormKey; customer_code: string | null; customer_name: string; salesman_code: string | null; amount: number | string;
  status: ClaimStatus; remark: string | null; form_values: Record<string, string>; submitted_on: string | null;
  claim_files: { id: number; kind: "photo" | "document"; file_name: string; storage_path: string | null }[];
};
type LorryRow = { lorry_no: string; driver: string | null; route: string | null; status: Lorry["status"]; invoices: number; load_pct: number };

const fmtDay = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "");

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const approved = !!profile && profile.active && profile.role !== "pending";
  const [state, setState] = useState<{ loading: boolean; error: string | null; salesmenRows: SalesmanRow[]; monthly: MonthlyRow[]; customerRows: CustomerRow[]; claimRows: ClaimRow[]; lorries: Lorry[] }>({
    loading: true, error: null, salesmenRows: [], monthly: [], customerRows: [], claimRows: [], lorries: [],
  });

  const fetchClaims = useCallback(async () => {
    const { data, error } = await supabase.from("claims").select("*, claim_files(id, kind, file_name, storage_path)").order("created_at", { ascending: false });
    return { rows: (data ?? []) as ClaimRow[], error: error?.message ?? null };
  }, []);
  const fetchLorries = useCallback(async () => {
    const { data, error } = await supabase.from("lorries").select("*").order("lorry_no");
    const lorries = ((data ?? []) as LorryRow[]).map((l) => ({ lorryNo: l.lorry_no, driver: l.driver ?? "—", route: l.route ?? "—", status: l.status, invoices: l.invoices, loadPct: l.load_pct }));
    return { lorries, error: error?.message ?? null };
  }, []);

  useEffect(() => {
    if (!approved) return;
    let active = true;
    (async () => {
      const [sm, mo, cu, cl, lo, st] = await Promise.all([
        supabase.from("salesmen").select("code, name, area").order("code"),
        supabase.from("salesman_monthly").select("salesman_code, month, rl_acct, active_acct, erc, sales_target, net_sales").eq("year", 2026),
        supabase.from("customers").select("code, name, channel, route_name, visit_day, payment_term, salesman_code").order("name").limit(2000),
        fetchClaims(),
        fetchLorries(),
        supabase.from("app_settings").select("value").eq("key", "paf_company_line").maybeSingle(),
      ]);
      if (st.data?.value) setCompanyLine(st.data.value as string);
      if (!active) return;
      const error = sm.error?.message ?? mo.error?.message ?? cu.error?.message ?? cl.error ?? lo.error;
      setState({
        loading: false, error,
        salesmenRows: (sm.data ?? []) as SalesmanRow[], monthly: (mo.data ?? []) as MonthlyRow[], customerRows: (cu.data ?? []) as CustomerRow[],
        claimRows: cl.rows, lorries: lo.lorries,
      });
    })();
    return () => { active = false; };
  }, [approved, fetchClaims, fetchLorries]);

  const value = useMemo<Ctx>(() => {
    const salesmen = buildSalesmen(state.salesmenRows, state.monthly);
    const customers = buildCustomers(state.customerRows);
    const nameOf = new Map(salesmen.map((s) => [s.code, s.name]));
    const claims: Claim[] = state.claimRows.map((c) => ({
      id: c.id, formKey: c.form_key, customer: c.customer_name, customerCode: c.customer_code,
      salesman: c.salesman_code ? nameOf.get(c.salesman_code) ?? c.salesman_code : "—", salesmanCode: c.salesman_code,
      amount: Number(c.amount), status: c.status, submitted: fmtDay(c.submitted_on), attachments: c.claim_files.length,
      remark: c.remark ?? "", values: c.form_values ?? {},
    }));
    const claimFiles: ClaimFile[] = state.claimRows.flatMap((c) => c.claim_files.map((f) => ({ id: f.id, claimId: c.id, kind: f.kind, name: f.file_name, path: f.storage_path })));
    return {
      loading: state.loading && approved, error: state.error, salesmen, customers, claims, claimFiles, lorries: state.lorries,
      reloadClaims: async () => { const r = await fetchClaims(); setState((p) => ({ ...p, claimRows: r.rows })); },
      reloadLorries: async () => { const r = await fetchLorries(); setState((p) => ({ ...p, lorries: r.lorries })); },
    };
  }, [state, approved, fetchClaims, fetchLorries]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export function useData() {
  const c = useContext(DataCtx);
  if (!c) throw new Error("useData outside DataProvider");
  return c;
}
