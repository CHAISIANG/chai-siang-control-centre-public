"use client";
import { useState } from "react";
import { useFinance } from "@/components/finance";
import { btnPrimary, Field, inputCls } from "@/components/finui";
import { Card, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import type { FinSettings } from "@/lib/finance";

export default function FinanceSettings() {
  const { settings, canManage, refresh } = useFinance();
  const [f, setF] = useState<FinSettings>(settings);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const txt = (k: keyof FinSettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  const num = (k: "tax_rate" | "payment_terms_days") => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: Number(e.target.value) }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase.from("fin_settings").update({ ...f, updated_at: new Date().toISOString() }).eq("id", 1);
    if (!error) await refresh();
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved. New invoices use these details; existing invoices keep their own tax rate." });
    setBusy(false);
  }
  if (!canManage) return <p className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 text-slate-600">Your role can view finance but not change its settings.</p>;
  const ro = !canManage;
  return (
    <form onSubmit={save}>
      <PageHeader title="Finance settings" sub="These details appear on every invoice." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Company">
          <div className="space-y-3">
            <Field label="Company name"><input className={inputCls} value={f.company_name} onChange={txt("company_name")} disabled={ro} required /></Field>
            <Field label="Address"><textarea rows={3} className={inputCls} value={f.company_address} onChange={txt("company_address")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Phone"><input className={inputCls} value={f.company_phone} onChange={txt("company_phone")} /></Field>
              <Field label="Email"><input type="email" className={inputCls} value={f.company_email} onChange={txt("company_email")} /></Field>
              <Field label="Company reg. no."><input className={inputCls} value={f.reg_no} onChange={txt("reg_no")} /></Field>
              <Field label="SST registration no."><input className={inputCls} value={f.sst_no} onChange={txt("sst_no")} /></Field>
            </div>
          </div>
        </Card>
        <div className="space-y-4">
          <Card title="Tax and terms">
            <div className="grid grid-cols-3 gap-3">
              <Field label="SST rate (%)"><input type="number" step="0.01" min="0" max="100" className={inputCls} value={f.tax_rate} onChange={num("tax_rate")} /></Field>
              <Field label="Currency"><input className={inputCls} value={f.currency} onChange={txt("currency")} maxLength={4} /></Field>
              <Field label="Payment terms (days)"><input type="number" min="0" className={inputCls} value={f.payment_terms_days} onChange={num("payment_terms_days")} /></Field>
            </div>
            <p className="mt-2 text-sm text-slate-500">Service tax is 8% for most taxable services; some are at 6%. Check which applies to you with the Royal Malaysian Customs Department.</p>
          </Card>
          <Card title="Bank details for transfers">
            <div className="space-y-3">
              <Field label="Bank"><input className={inputCls} value={f.bank_name} onChange={txt("bank_name")} /></Field>
              <Field label="Account name"><input className={inputCls} value={f.bank_account_name} onChange={txt("bank_account_name")} /></Field>
              <Field label="Account number"><input className={inputCls} value={f.bank_account_no} onChange={txt("bank_account_no")} /></Field>
            </div>
          </Card>
        </div>
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-4 rounded px-3 py-2 ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}
      <button disabled={busy} className={btnPrimary + " mt-4"}>{busy ? "Saving…" : "Save settings"}</button>
    </form>
  );
}
