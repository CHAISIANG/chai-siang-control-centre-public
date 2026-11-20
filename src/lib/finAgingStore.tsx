"use client";
// The invoices behind Finance overview and Finance invoices. Live: the latest aging report in the database (each person
// sees only the salesmen their role allows, enforced by the database). Sample mode (the preview page) shows made-up invoices.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { SAMPLE_AGING_INVS, type AgingInv } from "./finAging";

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
