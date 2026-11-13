"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useFinance } from "./finance";
import type { Po, PoLine } from "@/lib/po";

type Result = string | null; // null = done, otherwise the message to show
type Ctx = {
  pos: Po[];
  loading: boolean;
  error: string | null;
  canManage: boolean;
  addPo: (v: { poNo: string; clientId: string; poDate: string; reqDate: string; soNo: string; salesman: string; lines: PoLine[] }) => Promise<Result>;
  markChecked: (id: string, checker: string) => Promise<Result>;
  addInvoice: (id: string, v: { invoiceId: string; lines: { invQty: number; invPrice: number }[] }) => Promise<Result>;
  addDelivery: (id: string, v: { date: string; driver: string; route: string; qty: number[]; file: File | null }) => Promise<Result>;
  addProof: (id: string, file: File) => Promise<Result>;
  addReason: (id: string, key: string, reason: string) => Promise<Result>;
  proofUrl: (path: string) => Promise<string | null>;
};
const PoCtx = createContext<Ctx | null>(null);
export const usePo = () => { const c = useContext(PoCtx); if (!c) throw new Error("usePo outside PoProvider"); return c; };

type LineRow = { sku: string; descr: string; po_qty: string | number; po_price: string | number; inv_qty: string | number | null; inv_price: string | number | null; del_qty: string | number | null; sort: number; id: number };
type PoRow = {
  id: string; client_id: string; po_no: string; po_date: string; req_date: string; so_no: string | null; keyed_by: string; checked_by: string | null;
  invoice_id: string | null; delivered_date: string | null; driver: string | null; route: string | null; proof_path: string | null; note: string;
  fin_po_lines: LineRow[];
};
const num = (v: string | number | null) => (v === null ? undefined : Number(v));

/** Saved in Supabase. Customers and invoices come from the Finance data that is already loaded. */
export function PoProvider({ children }: { children: ReactNode }) {
  const { clients, invoices, canManage } = useFinance();
  const [rows, setRows] = useState<PoRow[]>([]);
  const [reasons, setReasons] = useState<Record<string, Record<string, string>>>({});
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from("fin_pos").select("*, fin_po_lines(*)").order("req_date", { ascending: false }).order("po_no"),
      supabase.from("fin_po_reasons").select("po_id, issue_key, reason"),
    ]);
    const by: Record<string, Record<string, string>> = {};
    for (const x of (r.data ?? []) as { po_id: string; issue_key: string; reason: string }[]) (by[x.po_id] ??= {})[x.issue_key] = x.reason;
    setRows((p.data ?? []) as unknown as PoRow[]);
    setReasons(by);
    setState({ loading: false, error: p.error?.message ?? r.error?.message ?? null });
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const pos = useMemo<Po[]>(() => rows.map((r) => {
    const inv = r.invoice_id ? invoices.find((i) => i.id === r.invoice_id) : undefined;
    return {
      id: r.id, poNo: r.po_no, clientId: r.client_id, customer: clients.find((c) => c.id === r.client_id)?.company_name ?? "Unknown customer",
      poDate: r.po_date, reqDate: r.req_date, soNo: r.so_no ?? undefined, salesman: r.keyed_by, checkedBy: r.checked_by ?? undefined,
      invoiceId: r.invoice_id ?? undefined, invoiceNo: inv?.invoice_no, invoiceDate: inv?.issue_date,
      deliveredDate: r.delivered_date ?? undefined, driver: r.driver ?? undefined, route: r.route ?? undefined, proofPath: r.proof_path ?? undefined,
      note: r.note || undefined, reasons: reasons[r.id] ?? {},
      lines: [...r.fin_po_lines].sort((a, b) => a.sort - b.sort || a.id - b.id).map((l) => ({ sku: l.sku, desc: l.descr, poQty: Number(l.po_qty), poPrice: Number(l.po_price), invQty: num(l.inv_qty), invPrice: num(l.inv_price), delQty: num(l.del_qty) })),
    };
  }), [rows, reasons, clients, invoices]);

  const run = useCallback(async (f: () => PromiseLike<{ error: { message: string } | null }>): Promise<Result> => {
    const { error } = await f();
    if (error) return error.message;
    await load();
    return null;
  }, [load]);

  const upload = useCallback(async (id: string, file: File) => {
    const path = `${id}/${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from("po-proofs").upload(path, file, { contentType: file.type || undefined });
    return { path, error };
  }, []);

  const value = useMemo<Ctx>(() => ({
    pos, loading: state.loading, error: state.error, canManage,
    addPo: (v) => {
      if (!v.poNo.trim()) return Promise.resolve("Enter the customer's PO number.");
      if (!v.clientId) return Promise.resolve("Choose the customer.");
      if (!v.salesman.trim()) return Promise.resolve("Enter who is keying the order.");
      if (!v.lines.length || v.lines.some((l) => !l.sku.trim() || !(l.poQty > 0) || !(l.poPrice >= 0))) return Promise.resolve("Every line needs an item code, a quantity above 0 and a price.");
      return run(() => supabase.rpc("po_create", { p_client: v.clientId, p_po_no: v.poNo, p_po_date: v.poDate, p_req_date: v.reqDate, p_so_no: v.soNo, p_keyed_by: v.salesman, p_lines: v.lines.map((l) => ({ sku: l.sku, descr: l.desc, qty: l.poQty, price: l.poPrice })) }));
    },
    markChecked: (id, checker) => run(() => supabase.rpc("po_mark_checked", { p_id: id, p_checker: checker })),
    addInvoice: (id, v) => {
      if (!v.invoiceId) return Promise.resolve("Choose the invoice.");
      if (v.lines.some((l) => !(l.invQty >= 0) || !(l.invPrice >= 0))) return Promise.resolve("Check the quantities and prices.");
      return run(() => supabase.rpc("po_link_invoice", { p_id: id, p_invoice: v.invoiceId, p_lines: v.lines.map((l) => ({ qty: l.invQty, price: l.invPrice })) }));
    },
    addDelivery: async (id, v) => {
      if (v.qty.some((q) => !(q >= 0))) return "Check the delivered quantities.";
      let path: string | null = null;
      if (v.file) { const u = await upload(id, v.file); if (u.error) return `The signed copy could not be uploaded: ${u.error.message}`; path = u.path; }
      return run(() => supabase.rpc("po_record_delivery", { p_id: id, p_date: v.date, p_driver: v.driver, p_route: v.route, p_qty: v.qty, p_proof_path: path }));
    },
    addProof: async (id, file) => {
      const u = await upload(id, file);
      if (u.error) return `The signed copy could not be uploaded: ${u.error.message}`;
      return run(() => supabase.rpc("po_set_proof", { p_id: id, p_path: u.path }));
    },
    addReason: (id, key, reason) => run(() => supabase.rpc("po_add_reason", { p_id: id, p_key: key, p_reason: reason })),
    proofUrl: async (path) => (await supabase.storage.from("po-proofs").createSignedUrl(path, 300)).data?.signedUrl ?? null,
  }), [pos, state, canManage, run, upload]);

  if (state.loading) return <p className="text-slate-500">Loading purchase orders…</p>;
  if (state.error) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">Purchase orders could not be loaded: {state.error}</p>;
  return <PoCtx.Provider value={value}>{children}</PoCtx.Provider>;
}
