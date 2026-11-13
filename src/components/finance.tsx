"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useRole } from "./role";
import { DEFAULT_SETTINGS, type FinClient, type FinInvoice, type FinReminder, type FinSettings, type FinTemplate } from "@/lib/finance";

type Ctx = {
  loading: boolean;
  error: string | null;
  settings: FinSettings;
  clients: FinClient[];
  invoices: FinInvoice[];
  templates: FinTemplate[];
  canManage: boolean;
  refresh: () => Promise<void>;
};
const FinCtx = createContext<Ctx | null>(null);

type InvRow = Omit<FinInvoice, "items" | "payments" | "reminders" | "subtotal" | "tax_rate" | "tax_amount" | "total" | "amount_paid" | "balance_due"> & {
  subtotal: string | number; tax_rate: string | number; tax_amount: string | number; total: string | number; amount_paid: string | number; balance_due: string | number;
  fin_invoice_items: (Omit<FinInvoice["items"][number], "qty" | "unit_price" | "amount"> & { qty: string | number; unit_price: string | number; amount: string | number })[];
  fin_payments: (Omit<FinInvoice["payments"][number], "amount"> & { amount: string | number })[];
};

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { can } = useRole();
  const allowed = can("page_finance");
  const [state, setState] = useState<{ loading: boolean; error: string | null; settings: FinSettings; clients: FinClient[]; invoices: FinInvoice[]; templates: FinTemplate[] }>({
    loading: true, error: null, settings: DEFAULT_SETTINGS, clients: [], invoices: [], templates: [],
  });

  const load = useCallback(async () => {
    await supabase.rpc("fin_mark_overdue");
    const [st, cl, inv, rem, tpl] = await Promise.all([
      supabase.from("fin_settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("fin_clients").select("*").order("company_name"),
      supabase.from("fin_invoices").select("*, fin_invoice_items(*), fin_payments(*)").order("issue_date", { ascending: false }).order("invoice_no", { ascending: false }),
      supabase.from("fin_reminders").select("id, invoice_id, channel, template, subject, status, error, auto, created_at").order("created_at"),
      supabase.from("fin_reminder_templates").select("*").order("sort"),
    ]);
    const error = st.error?.message ?? cl.error?.message ?? inv.error?.message ?? rem.error?.message ?? tpl.error?.message ?? null;
    const remindersBy = new Map<string, FinReminder[]>();
    for (const r of (rem.data ?? []) as FinReminder[]) remindersBy.set(r.invoice_id, [...(remindersBy.get(r.invoice_id) ?? []), r]);
    const invoices = ((inv.data ?? []) as unknown as InvRow[]).map((r): FinInvoice => ({
      ...r,
      subtotal: Number(r.subtotal), tax_rate: Number(r.tax_rate), tax_amount: Number(r.tax_amount), total: Number(r.total),
      amount_paid: Number(r.amount_paid), balance_due: Number(r.balance_due),
      items: r.fin_invoice_items.map((i) => ({ ...i, qty: Number(i.qty), unit_price: Number(i.unit_price), amount: Number(i.amount) })).sort((a, b) => a.sort - b.sort || a.id - b.id),
      payments: r.fin_payments.map((p) => ({ ...p, amount: Number(p.amount) })).sort((a, b) => a.paid_on.localeCompare(b.paid_on) || a.id - b.id),
      reminders: remindersBy.get(r.id) ?? [],
    }));
    const s = st.data as (Omit<FinSettings, "tax_rate"> & { tax_rate: string | number }) | null;
    setState({
      loading: false, error,
      settings: s ? { ...DEFAULT_SETTINGS, ...s, tax_rate: Number(s.tax_rate) } : DEFAULT_SETTINGS,
      clients: (cl.data ?? []) as FinClient[], invoices, templates: (tpl.data ?? []) as FinTemplate[],
    });
  }, []);

  useEffect(() => {
    if (!allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [allowed, load]);

  const value = useMemo<Ctx>(() => ({ ...state, canManage: can("finance_manage"), refresh: load, loading: state.loading && allowed }), [state, can, load, allowed]);
  if (!allowed) {
    return <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">Your role does not include Finance. Ask your administrator to switch it on under Roles &amp; permissions.</p>;
  }
  return <FinCtx.Provider value={value}>{value.loading ? <p className="text-slate-500">Loading finance data…</p> : children}</FinCtx.Provider>;
}

export function useFinance() {
  const c = useContext(FinCtx);
  if (!c) throw new Error("useFinance outside FinanceProvider");
  return c;
}
