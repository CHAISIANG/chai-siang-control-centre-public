"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth";
import { buildCustomers, buildSalesmen, DAYS_ELAPSED, type ArRow, type Claim, type ClaimStatus, type Customer, type CustomerRow, type CustSalesRow, type Lorry, type MonthlyRow, type Salesman, type SalesmanRow } from "@/lib/mock";
import { setCompanyLine, setDistributorRep, type FormKey } from "@/lib/paf";

export type UploadRow = { report: string; file_name: string | null; row_count: number | null; status: string; uploaded_at: string };
export type ClaimFile = { id: number; claimId: string; kind: "photo" | "document"; name: string; path: string | null };

type Ctx = {
  loading: boolean;
  error: string | null;
  salesmen: Salesman[];
  customers: Customer[];
  claims: Claim[];
  claimFiles: ClaimFile[];
  lorries: Lorry[];
  /** Date of the aging report, for example 2026-11-13. Empty until the reports are loaded. */
  asAt: string;
  /** Days of November in the sales figures (the day of the latest invoice). */
  mtdDay: number;
  uploads: UploadRow[];
  /** Fetch everything again, for example after reports were uploaded. */
  reload: () => void;
  reloadClaims: () => Promise<void>;
  reloadLorries: () => Promise<void>;
};

const DataCtx = createContext<Ctx | null>(null);

type ClaimRow = {
  id: string; form_key: FormKey; customer_code: string | null; customer_name: string; salesman_code: string | null; amount: number | string;
  status: ClaimStatus; remark: string | null; form_values: Record<string, string>; submitted_on: string | null;
  salesman_name: string | null; principal_name: string | null; principal_on: string | null;
  claim_files: { id: number; kind: "photo" | "document"; file_name: string; storage_path: string | null }[];
  sign_required: boolean | null; sign_signature_path: string | null; sign_chop_path: string | null; sign_chop_placement: Record<string, number> | null;
  signer_name: string | null; signed_at: string | null; signed_by_name: string | null;
};
type LorryRow = { lorry_no: string; driver: string | null; route: string | null; status: Lorry["status"]; invoices: number; load_pct: number };

const fmtDay = (d: string | null) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "");

export function DataProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const approved = !!profile && profile.active && profile.role !== "pending";
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{ loading: boolean; error: string | null; salesmenRows: SalesmanRow[]; monthly: MonthlyRow[]; customerRows: CustomerRow[]; claimRows: ClaimRow[]; lorries: Lorry[]; ar: ArRow[]; custSales: CustSalesRow[]; asAt: string; mtdDay: number; uploads: UploadRow[] }>({
    loading: true, error: null, salesmenRows: [], monthly: [], customerRows: [], claimRows: [], lorries: [], ar: [], custSales: [], asAt: "", mtdDay: DAYS_ELAPSED, uploads: [],
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
      const [sm, mo, cu, cl, lo, st, ar, cs, dly, up] = await Promise.all([
        supabase.from("salesmen").select("code, name, area").order("code"),
        supabase.from("salesman_monthly").select("salesman_code, month, rl_acct, active_acct, erc, sales_target, net_sales").eq("year", 2026),
        supabase.from("customers").select("code, name, channel, route_name, visit_day, payment_term, salesman_code").order("name").limit(2000),
        fetchClaims(),
        fetchLorries(),
        supabase.from("app_settings").select("key, value").in("key", ["paf_company_line", "paf_distributor_rep"]),
        // The report tables are optional: if they are missing or empty the screens simply show no balances.
        supabase.rpc("ar_summary"),
        supabase.from("customer_sales").select("code, ytd, ytd_ams, py_ams").limit(5000),
        supabase.rpc("sales_daily"),
        supabase.from("upload_log").select("report, file_name, row_count, status, uploaded_at").order("uploaded_at", { ascending: false }).limit(40),
      ]);
      const arRows = (ar.data ?? []) as (ArRow & { as_at: string })[];
      const lastDay = ((dly.data ?? []) as { sale_date: string }[]).map((d) => d.sale_date).sort().pop();
      for (const row of (st.data ?? []) as { key: string; value: string }[]) {
        if (row.key === "paf_company_line") setCompanyLine(row.value);
        if (row.key === "paf_distributor_rep") setDistributorRep(row.value);
      }
      if (!active) return;
      const error = sm.error?.message ?? mo.error?.message ?? cu.error?.message ?? cl.error ?? lo.error;
      setState({
        loading: false, error,
        salesmenRows: (sm.data ?? []) as SalesmanRow[], monthly: (mo.data ?? []) as MonthlyRow[], customerRows: (cu.data ?? []) as CustomerRow[],
        claimRows: cl.rows, lorries: lo.lorries,
        ar: arRows, custSales: (cs.data ?? []) as CustSalesRow[], asAt: arRows[0]?.as_at ?? "", mtdDay: lastDay ? Number(lastDay.slice(8, 10)) : DAYS_ELAPSED, uploads: (up.data ?? []) as UploadRow[],
      });
    })();
    return () => { active = false; };
  }, [approved, fetchClaims, fetchLorries, version]);

  const value = useMemo<Ctx>(() => {
    const salesmen = buildSalesmen(state.salesmenRows, state.monthly, state.mtdDay);
    const customers = buildCustomers(state.customerRows, state.ar, state.custSales);
    const nameOf = new Map(salesmen.map((s) => [s.code, s.name]));
    const claims: Claim[] = state.claimRows.map((c) => ({
      id: c.id, formKey: c.form_key, customer: c.customer_name, customerCode: c.customer_code,
      salesman: c.salesman_code ? nameOf.get(c.salesman_code) ?? c.salesman_name ?? c.salesman_code : "—", salesmanCode: c.salesman_code,
      amount: Number(c.amount), status: c.status, submitted: fmtDay(c.submitted_on), attachments: c.claim_files.length,
      remark: c.remark ?? "", principalName: c.principal_name ?? "", principalOn: c.principal_on ?? "", values: c.form_values ?? {},
      signRequired: c.sign_required !== false,
      sign: c.signed_at && c.sign_signature_path && c.sign_chop_path ? { signaturePath: c.sign_signature_path, chopPath: c.sign_chop_path, placement: c.sign_chop_placement ?? {}, signerName: c.signer_name ?? "", signedAt: new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(c.signed_at)).replace(",", ""), by: c.signed_by_name ?? "" } : null,
    }));
    const claimFiles: ClaimFile[] = state.claimRows.flatMap((c) => c.claim_files.map((f) => ({ id: f.id, claimId: c.id, kind: f.kind, name: f.file_name, path: f.storage_path })));
    return {
      loading: state.loading && approved, error: state.error, salesmen, customers, claims, claimFiles, lorries: state.lorries, asAt: state.asAt, mtdDay: state.mtdDay, uploads: state.uploads, reload: () => setVersion((v) => v + 1),
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
