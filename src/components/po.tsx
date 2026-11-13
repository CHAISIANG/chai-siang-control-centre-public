"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "./auth";
import { useRole } from "./role";
import type { Outcome, Po, PoLine } from "@/lib/po";

type Result = string | null; // null = done, otherwise the message to show
export type PoClient = { id: string; company_name: string };
type Ctx = {
  pos: Po[];
  clients: PoClient[];
  canManage: boolean;      // Finance: second check, invoice, delivery, credit notes
  salesmanName: string;    // the signed-in salesman, shown as "Keyed by"
  addPo: (v: { poNo: string; clientId: string; poDate: string; reqDate: string; soNo: string; keyedBy: string; salesCode: string; lines: PoLine[]; file: File | null }) => Promise<Result>;
  addCopy: (id: string, file: File) => Promise<Result>;
  markChecked: (id: string, checker: string) => Promise<Result>;
  addInvoice: (id: string, v: { invoiceId: string; lines: { invQty: number; invPrice: number }[] }) => Promise<Result>;
  addDelivery: (id: string, v: { date: string; driver: string; route: string; lines: { qty: number; outcome: Outcome; reason: string }[]; file: File | null }) => Promise<Result>;
  addProof: (id: string, file: File) => Promise<Result>;
  addReason: (id: string, key: string, reason: string) => Promise<Result>;
  raiseCredit: (id: string) => Promise<Result>;
  fileUrl: (path: string) => Promise<string | null>;
};
const PoCtx = createContext<Ctx | null>(null);
export const usePo = () => { const c = useContext(PoCtx); if (!c) throw new Error("usePo outside PoProvider"); return c; };

type Row = {
  id: string; client_id: string; customer: string; po_no: string; po_date: string; req_date: string; so_no: string | null; keyed_by: string; checked_by: string | null; salesman_code: string | null;
  invoice_id: string | null; invoice_no: string | null; invoice_date: string | null; delivered_date: string | null; driver: string | null; route: string | null;
  proof_path: string | null; po_copy_path: string | null; note: string; credit_raised_at: string | null;
  lines: { sku: string; descr: string; po_qty: number | string; po_price: number | string; inv_qty: number | string | null; inv_price: number | string | null; del_qty: number | string | null; outcome: Outcome; reason: string | null }[];
  reasons: Record<string, string>;
};
const num = (v: number | string | null) => (v === null ? undefined : Number(v));

/** Saved in Supabase. Finance people see every PO; a salesman sees only their own, decided by the database. */
export function PoProvider({ children, needs }: { children: ReactNode; needs: "finance" | "mine" }) {
  const { can } = useRole();
  const { profile } = useAuth();
  const allowed = needs === "finance" ? can("page_finance") : can("page_po_mine") || can("page_finance");
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<PoClient[]>([]);
  const [state, setState] = useState<{ loading: boolean; error: string | null }>({ loading: true, error: null });

  const load = useCallback(async () => {
    const [p, c] = await Promise.all([supabase.rpc("po_list"), supabase.rpc("po_clients")]);
    setRows((p.data ?? []) as Row[]);
    setClients((c.data ?? []) as PoClient[]);
    setState({ loading: false, error: p.error?.message ?? c.error?.message ?? null });
  }, []);
  useEffect(() => {
    if (!allowed) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [allowed, load]);

  const pos = useMemo<Po[]>(() => rows.map((r) => ({
    id: r.id, poNo: r.po_no, clientId: r.client_id, customer: r.customer, poDate: r.po_date, reqDate: r.req_date, soNo: r.so_no ?? undefined,
    salesman: r.keyed_by, salesCode: r.salesman_code ?? undefined, checkedBy: r.checked_by ?? undefined,
    invoiceId: r.invoice_id ?? undefined, invoiceNo: r.invoice_no ?? undefined, invoiceDate: r.invoice_date ?? undefined,
    deliveredDate: r.delivered_date ?? undefined, driver: r.driver ?? undefined, route: r.route ?? undefined,
    proofPath: r.proof_path ?? undefined, copyPath: r.po_copy_path ?? undefined, creditRaisedAt: r.credit_raised_at ?? undefined,
    note: r.note || undefined, reasons: r.reasons ?? {},
    lines: r.lines.map((l) => ({ sku: l.sku, desc: l.descr, poQty: Number(l.po_qty), poPrice: Number(l.po_price), invQty: num(l.inv_qty), invPrice: num(l.inv_price), delQty: num(l.del_qty), outcome: l.outcome, reason: l.reason ?? undefined })),
  })), [rows]);

  const run = useCallback(async (f: () => PromiseLike<{ error: { message: string } | null }>): Promise<Result> => {
    const { error } = await f();
    if (error) return error.message;
    await load();
    return null;
  }, [load]);

  const upload = useCallback(async (id: string, file: File, kind: "copy" | "proof") => {
    const path = `${id}/${kind}-${Date.now()}-${file.name.replace(/[^\w.-]+/g, "_")}`;
    const { error } = await supabase.storage.from("po-proofs").upload(path, file, { contentType: file.type || undefined });
    return { path, error };
  }, []);

  const value = useMemo<Ctx>(() => ({
    pos, clients, canManage: can("finance_manage"), salesmanName: profile?.full_name ?? "",
    addPo: async (v) => {
      const { data, error } = await supabase.rpc("po_create", { p_client: v.clientId, p_po_no: v.poNo, p_po_date: v.poDate, p_req_date: v.reqDate, p_so_no: v.soNo, p_keyed_by: v.keyedBy, p_salesman_code: v.salesCode, p_lines: v.lines.map((l) => ({ sku: l.sku, descr: l.desc, qty: l.poQty, price: l.poPrice })) });
      if (error) return error.message;
      if (v.file) {
        const u = await upload(data as string, v.file, "copy");
        if (u.error) { await load(); return `The order was saved, but the PO copy could not be uploaded: ${u.error.message}. Open the order and attach it again.`; }
        const e = await supabase.rpc("po_set_copy", { p_id: data as string, p_path: u.path });
        if (e.error) { await load(); return `The order was saved, but the PO copy could not be attached: ${e.error.message}`; }
      }
      await load();
      return null;
    },
    addCopy: async (id, file) => {
      const u = await upload(id, file, "copy");
      if (u.error) return `The PO copy could not be uploaded: ${u.error.message}`;
      return run(() => supabase.rpc("po_set_copy", { p_id: id, p_path: u.path }));
    },
    markChecked: (id, checker) => run(() => supabase.rpc("po_mark_checked", { p_id: id, p_checker: checker })),
    addInvoice: (id, v) => {
      if (!v.invoiceId) return Promise.resolve("Choose the invoice.");
      if (v.lines.some((l) => !(l.invQty >= 0) || !(l.invPrice >= 0))) return Promise.resolve("Check the quantities and prices.");
      return run(() => supabase.rpc("po_link_invoice", { p_id: id, p_invoice: v.invoiceId, p_lines: v.lines.map((l) => ({ qty: l.invQty, price: l.invPrice })) }));
    },
    addDelivery: async (id, v) => {
      let path: string | null = null;
      if (v.file) { const u = await upload(id, v.file, "proof"); if (u.error) return `The signed copy could not be uploaded: ${u.error.message}`; path = u.path; }
      return run(() => supabase.rpc("po_record_delivery", { p_id: id, p_date: v.date, p_driver: v.driver, p_route: v.route, p_lines: v.lines, p_proof_path: path }));
    },
    addProof: async (id, file) => {
      const u = await upload(id, file, "proof");
      if (u.error) return `The signed copy could not be uploaded: ${u.error.message}`;
      return run(() => supabase.rpc("po_set_proof", { p_id: id, p_path: u.path }));
    },
    addReason: (id, key, reason) => run(() => supabase.rpc("po_add_reason", { p_id: id, p_key: key, p_reason: reason })),
    raiseCredit: (id) => run(() => supabase.rpc("po_raise_credit", { p_id: id })),
    fileUrl: async (path) => (await supabase.storage.from("po-proofs").createSignedUrl(path, 300)).data?.signedUrl ?? null,
  }), [pos, clients, can, profile, run, upload, load]);

  if (!allowed) return <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600">Your role does not include this page. Ask your administrator to switch it on under Roles &amp; permissions.</p>;
  if (state.loading) return <p className="text-slate-500">Loading purchase orders…</p>;
  if (state.error) return <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">Purchase orders could not be loaded: {state.error}</p>;
  return <PoCtx.Provider value={value}>{children}</PoCtx.Provider>;
}
