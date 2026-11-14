"use client";
// Sends the attached reports to the protected load functions, one report at a time. Each report is replaced in one step: all or nothing.
import { supabase } from "./supabase";
import { agingPayload, coveragePayload, customersPayload, productsPayload, reportYear } from "./reportPayloads";
import { agingAsAt, KIND_LABEL, type Aging, type Coverage, type CustomerReport, type Kind, type ProductSales } from "./reports";

export type Loaded = { aging?: Aging; coverage?: Coverage; products?: ProductSales; customers?: CustomerReport };
export type UploadResult = { kind: Kind; ok: boolean; message: string };

const rm = (n: number) => "RM " + Math.round(n).toLocaleString("en-MY");

export async function uploadReports(data: Loaded, names: Partial<Record<Kind, string>>, today: string): Promise<UploadResult[]> {
  const out: UploadResult[] = [];
  const asAt = (data.aging ? agingAsAt(data.aging) : "") || (data.products?.lines.map((l) => l.date).sort().pop() ?? "") || today;
  const year = reportYear(data, today);
  const run = async (kind: Kind, call: PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: (d: Record<string, number | string>) => string) => {
    const { data: d, error } = await call;
    out.push(error ? { kind, ok: false, message: error.message } : { kind, ok: true, message: ok((d ?? {}) as Record<string, number | string>) });
  };
  if (data.aging) await run("aging", supabase.rpc("load_aging", { p_rows: agingPayload(data.aging), p_file: names.aging ?? "", p_as_at: asAt }), (d) => `${Number(d.rows).toLocaleString()} open invoices loaded, ${rm(Number(d.total))} owed`);
  if (data.customers) await run("customers", supabase.rpc("load_customers", { p_rows: customersPayload(data.customers), p_file: names.customers ?? "", p_as_at: asAt }), (d) => `${Number(d.rows).toLocaleString()} customers loaded, ${rm(Number(d.total))} this year`);
  if (data.products) await run("products", supabase.rpc("load_products", { p_rows: productsPayload(data.products), p_file: names.products ?? "" }), (d) => `${Number(d.rows).toLocaleString()} invoice lines loaded for ${d.from} to ${d.to}, ${rm(Number(d.net))} net`);
  if (data.coverage) await run("coverage", supabase.rpc("load_coverage", { p_reps: coveragePayload(data.coverage), p_file: names.coverage ?? "", p_year: year }), (d) => `${Number(d.rows).toLocaleString()} monthly figures updated${Number(d.new_salesmen) ? `, ${d.new_salesmen} new salesman added` : ""}`);
  return out.sort((a, b) => Object.keys(KIND_LABEL).indexOf(a.kind) - Object.keys(KIND_LABEL).indexOf(b.kind));
}
