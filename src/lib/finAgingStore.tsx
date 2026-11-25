"use client";
// The invoices behind Finance overview and Finance invoices. Live: the latest aging report in the database (each person
// sees only the salesmen their role allows, enforced by the database). Sample mode (the preview page) shows made-up invoices.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { NO_EXTRAS, SAMPLE_AGING_INVS, SAMPLE_EXTRAS, type AgingExtras, type AgingInv } from "./finAging";

export type AgingData = { list: AgingInv[]; asAt: string; loading: boolean; sample: boolean; error: string | null };
const SampleMode = createContext(false);
export function AgingSample({ children }: { children: ReactNode }) { return <SampleMode.Provider value>{children}</SampleMode.Provider>; }

type Row = { doc_no: string; doc_date: string | null; cust_code: string; customer: string; agent: string | null; due_date: string | null; outstanding: number | string; as_at: string };
async function loadAging(): Promise<{ list: AgingInv[]; error: string | null }> {
  const out: Row[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from("ar_invoices").select("doc_no, doc_date, cust_code, customer, agent, due_date, outstanding, as_at").order("doc_no").range(from, from + 999);
    if (error) return { list: [], error: error.message };
    out.push(...((data ?? []) as Row[]));
    if ((data ?? []).length < 1000) break;
  }
  return {
    error: null,
    list: out.filter((r) => Number(r.outstanding) > 0).map((r): AgingInv => ({ doc: r.doc_no, docDate: r.doc_date, cust: r.cust_code, customer: r.customer, agent: r.agent, due: r.due_date, owed: Number(r.outstanding), asAt: r.as_at })),
  };
}

export function useAging(): AgingData {
  const sample = useContext(SampleMode);
  const [live, setLive] = useState<{ list: AgingInv[]; error: string | null } | null>(null);
  useEffect(() => {
    if (sample) return;
    let on = true;
    void loadAging().then((r) => { if (on) setLive(r); });
    return () => { on = false; };
  }, [sample]);
  if (sample) return { list: SAMPLE_AGING_INVS, asAt: SAMPLE_AGING_INVS[0].asAt, loading: false, sample: true, error: null };
  return { list: live?.list ?? [], asAt: live?.list[0]?.asAt ?? "", loading: !live, sample: false, error: live?.error ?? null };
}

/** The aging report keeps a short customer number ("541"); the customer list uses MY01C + 5 digits. */
export const fullCustomerCode = (cust: string) => (/^\d+$/.test(cust) ? `MY01C${cust.padStart(5, "0")}` : cust);
const shortCustomerCode = (code: string) => (/^MY01C\d+$/.test(code) ? code.slice(5).replace(/^0+(?=\d)/, "") : code);

async function loadExtras(): Promise<AgingExtras> {
  const channel: AgingExtras["channel"] = {};
  for (let from = 0; from < 20000; from += 1000) {
    const { data } = await supabase.from("customers").select("code, channel").order("code").range(from, from + 999);   // each person sees the customers their role allows
    for (const r of (data ?? []) as { code: string; channel: string | null }[]) channel[shortCustomerCode(r.code)] = r.channel ?? undefined;
    if ((data ?? []).length < 1000) break;
  }
  const settled: AgingExtras["settled"] = {};
  const { data: st } = await supabase.from("credit_settled").select("doc_no, settled_on, summary_ref").limit(5000);   // only Finance and Management can read this
  for (const r of (st ?? []) as { doc_no: string; settled_on: string; summary_ref: string | null }[]) settled[r.doc_no] = { on: r.settled_on, ref: r.summary_ref ?? undefined };
  return { channel, settled };
}

/** Sales channel of each customer and Finance's settled marks, for the customers on screen. */
export function useAgingExtras(): AgingExtras {
  const sample = useContext(SampleMode);
  const [live, setLive] = useState<AgingExtras | null>(null);
  useEffect(() => {
    if (sample) return;
    let on = true;
    void loadExtras().then((r) => { if (on) setLive(r); });
    return () => { on = false; };
  }, [sample]);
  return sample ? SAMPLE_EXTRAS : live ?? NO_EXTRAS;
}
