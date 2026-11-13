"use client";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { COMMITTED, type Account, type Order, type OrderStatus, type Product } from "./data";

type ProductRow = { sku: string; barcode: string; name: string; size: string; category: Product["category"]; per_carton: number; unit_price: string | number; stock: number; tiers: Product["tiers"]; promo: string | null; bundle: boolean; art: Product["art"] };
type AccountRow = { code: string; company_name: string; tier: string; credit_limit: string | number; outstanding: string | number };
type OrderRow = { id: string; ref: string; status: OrderStatus; total: string | number; created_at: string; portal_order_lines: { sku: string; name: string; cartons: number }[] };

export type PlaceResult = { ok: true; ref: string; total: number; cartons: number } | { ok: false; error: string };

/** Loads the signed-in distributor's account, the catalogue and their orders. Prices and discounts shown here are repeated by the database when an order is placed. */
export function usePortal(userId: string) {
  const [state, setState] = useState<{ loading: boolean; error: string | null; account: Account | null; products: Product[]; orders: Order[] }>({ loading: true, error: null, account: null, products: [], orders: [] });

  const load = useCallback(async () => {
    const [ac, pr, od] = await Promise.all([
      supabase.from("portal_accounts").select("code, company_name, tier, credit_limit, outstanding").eq("user_id", userId).eq("active", true).maybeSingle(),
      supabase.from("portal_products").select("sku, barcode, name, size, category, per_carton, unit_price, stock, tiers, promo, bundle, art").eq("active", true).order("sort"),
      supabase.from("portal_orders").select("id, ref, status, total, created_at, portal_order_lines(sku, name, cartons)").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
    ]);
    const a = ac.data as AccountRow | null;
    setState({
      loading: false,
      error: ac.error?.message ?? pr.error?.message ?? od.error?.message ?? null,
      account: a ? { code: a.code, company: a.company_name, tier: a.tier, creditLimit: Number(a.credit_limit), outstanding: Number(a.outstanding) } : null,
      products: ((pr.data ?? []) as ProductRow[]).map((p) => ({ sku: p.sku, barcode: p.barcode, name: p.name, size: p.size, category: p.category, perCarton: p.per_carton, unitPrice: Number(p.unit_price), stock: p.stock, tiers: p.tiers ?? [], promo: p.promo ?? undefined, bundle: p.bundle, art: p.art })),
      orders: ((od.data ?? []) as unknown as OrderRow[]).map((o) => ({ id: o.id, ref: o.ref, status: o.status, total: Number(o.total), date: o.created_at.slice(0, 10), lines: o.portal_order_lines.map((l) => ({ sku: l.sku, name: l.name, n: l.cartons })) })),
    });
  }, [userId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const place = useCallback(async (lines: { sku: string; n: number }[]): Promise<PlaceResult> => {
    const { data, error } = await supabase.rpc("portal_place_order", { p_lines: lines.map((l) => ({ sku: l.sku, cartons: l.n })) });
    await load();
    if (error) return { ok: false, error: error.message };
    const d = data as { ref: string; total: number | string; cartons: number };
    return { ok: true, ref: d.ref, total: Number(d.total), cartons: d.cartons };
  }, [load]);

  const creditUsed = state.account ? state.account.outstanding + state.orders.filter((o) => COMMITTED.includes(o.status)).reduce((s, o) => s + o.total, 0) : 0;
  return { ...state, creditUsed, place, reload: load };
}
