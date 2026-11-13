"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useFinance } from "./finance";
import { btnGhost, btnPrimary, Field, inputCls } from "./finui";
import { Card, PageHeader } from "./ui";
import { supabase } from "@/lib/supabase";
import { addDays, calcTotals, money, round2, todayISO, toISO, type FinInvoice } from "@/lib/finance";

type Line = { key: number; description: string; qty: string; unit_price: string };
let seq = 0;
const blank = (): Line => ({ key: ++seq, description: "", qty: "1", unit_price: "" });

function addMonths(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate();
  return toISO(new Date(y, m - 1 + n, Math.min(d, last)));
}

export default function InvoiceForm({ invoice }: { invoice?: FinInvoice }) {
  const router = useRouter();
  const { clients, settings, refresh } = useFinance();
  const editing = !!invoice;
  const [clientId, setClientId] = useState(invoice?.client_id ?? "");
  const [issue, setIssue] = useState(invoice?.issue_date ?? todayISO());
  const [due, setDue] = useState(invoice?.due_date ?? addDays(todayISO(), settings.payment_terms_days));
  const [dueTouched, setDueTouched] = useState(editing);
  const [taxRate, setTaxRate] = useState(String(invoice?.tax_rate ?? settings.tax_rate));
  const [notes, setNotes] = useState(invoice?.notes ?? "");
  const [rec, setRec] = useState<"" | "monthly" | "quarterly">(invoice?.recurrence ?? "");
  const [nextGen, setNextGen] = useState(invoice?.next_generate_date ?? "");
  const [lines, setLines] = useState<Line[]>(invoice?.items.length ? invoice.items.map((i) => ({ key: ++seq, description: i.description, qty: String(i.qty), unit_price: String(i.unit_price) })) : [blank()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const rate = Number(taxRate) || 0;
  const t = calcTotals(lines.map((l) => ({ qty: Number(l.qty), unit_price: Number(l.unit_price) })), rate);
  const cur = settings.currency;

  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function changeIssue(v: string) {
    setIssue(v);
    if (!dueTouched && v) setDue(addDays(v, settings.payment_terms_days));
    if (rec && v) setNextGen(addMonths(v, rec === "monthly" ? 1 : 3));
  }
  function changeRec(v: "" | "monthly" | "quarterly") {
    setRec(v);
    setNextGen(v ? addMonths(issue, v === "monthly" ? 1 : 3) : "");
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const items = lines.filter((l) => l.description.trim());
    if (!clientId) return setErr("Choose a client.");
    if (items.length === 0) return setErr("Add at least one line item with a description.");
    if (items.some((l) => !(Number(l.qty) > 0) || Number(l.unit_price) < 0 || l.unit_price === "")) return setErr("Each line needs a quantity above 0 and a unit price.");
    if (!issue || !due || due < issue) return setErr("The due date cannot be before the invoice date.");
    if (rate < 0 || rate > 100) return setErr("The tax rate must be between 0 and 100.");
    if (rec && !nextGen) return setErr("Choose when the next invoice is generated.");
    if (invoice && invoice.amount_paid > t.total) return setErr(`This invoice already has ${money(invoice.amount_paid, cur)} paid. The total cannot go below that.`);
    setBusy(true);
    const head = { client_id: clientId, issue_date: issue, due_date: due, tax_rate: rate, notes, recurrence: rec || null, next_generate_date: rec ? nextGen : null };
    let id = invoice?.id;
    if (invoice) {
      const r = await supabase.from("fin_invoices").update(head).eq("id", invoice.id);
      if (r.error) { setBusy(false); return setErr(r.error.message); }
      const d = await supabase.from("fin_invoice_items").delete().eq("invoice_id", invoice.id);
      if (d.error) { setBusy(false); return setErr(d.error.message); }
    } else {
      const r = await supabase.from("fin_invoices").insert(head).select("id").single();
      if (r.error || !r.data) { setBusy(false); return setErr(r.error?.message ?? "Could not create the invoice."); }
      id = r.data.id as string;
    }
    const ins = await supabase.from("fin_invoice_items").insert(items.map((l, n) => ({ invoice_id: id, sort: n, description: l.description.trim(), qty: Number(l.qty), unit_price: round2(Number(l.unit_price)) })));
    if (ins.error) { setBusy(false); return setErr(ins.error.message); }
    await refresh();
    router.push(`/finance/invoices/${id}`);
  }

  return (
    <form onSubmit={save}>
      <PageHeader title={editing ? `Edit ${invoice!.invoice_no}` : "New invoice"} sub={editing ? undefined : "The invoice number is assigned when you save."} />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Invoice details" className="lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client" className="sm:col-span-2">
              <select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)} required>
                <option value="">Choose a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
              {clients.length === 0 && <span className="mt-1 block text-sm font-normal text-amber-700">No clients yet. <Link href="/finance/clients" className="underline">Add one first</Link>.</span>}
            </Field>
            <Field label="Invoice date"><input type="date" className={inputCls} value={issue} onChange={(e) => changeIssue(e.target.value)} required /></Field>
            <Field label={`Due date (default: ${settings.payment_terms_days} days)`}><input type="date" className={inputCls} value={due} min={issue} onChange={(e) => { setDue(e.target.value); setDueTouched(true); }} required /></Field>
            <Field label="Repeat">
              <select className={inputCls} value={rec} onChange={(e) => changeRec(e.target.value as "" | "monthly" | "quarterly")}>
                <option value="">Does not repeat</option><option value="monthly">Every month</option><option value="quarterly">Every quarter</option>
              </select>
            </Field>
            {rec && <Field label="Next invoice on"><input type="date" className={inputCls} value={nextGen} onChange={(e) => setNextGen(e.target.value)} required /></Field>}
          </div>
        </Card>
        <Card title="SST">
          <Field label="SST rate (%)"><input type="number" step="0.01" min="0" max="100" className={inputCls} value={taxRate} onChange={(e) => setTaxRate(e.target.value)} /></Field>
          <p className="mt-2 text-sm text-slate-500">Service tax is {settings.tax_rate}% by default. Set 0 for exempt items.{settings.sst_no ? ` SST no. ${settings.sst_no}.` : ""}</p>
        </Card>
      </div>

      <Card title="Line items" className="mt-4">
        <div className="space-y-3">
          <div className="hidden grid-cols-[1fr_90px_130px_130px_36px] gap-2 text-sm font-medium text-slate-500 sm:grid"><span>Description</span><span>Qty</span><span>Unit price</span><span className="text-right">Amount</span><span /></div>
          {lines.map((l) => {
            const amt = round2((Number(l.qty) || 0) * (Number(l.unit_price) || 0));
            return (
              <div key={l.key} className="grid grid-cols-2 gap-2 sm:grid-cols-[1fr_90px_130px_130px_36px] sm:items-center">
                <input aria-label="Description" placeholder="Description" className={`${inputCls} col-span-2 !mt-0 sm:col-span-1`} value={l.description} onChange={(e) => setLine(l.key, { description: e.target.value })} />
                <input aria-label="Quantity" type="number" min="0.01" step="0.01" className={`${inputCls} !mt-0`} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} />
                <input aria-label="Unit price" type="number" min="0" step="0.01" placeholder="0.00" className={`${inputCls} !mt-0`} value={l.unit_price} onChange={(e) => setLine(l.key, { unit_price: e.target.value })} />
                <div className="text-right tabular-nums text-slate-700 sm:px-2">{amt.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</div>
                <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="justify-self-end rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-30"><Trash2 size={18} /></button>
              </div>
            );
          })}
          <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline"><Plus size={16} /> Add line</button>
        </div>
        <dl className="ml-auto mt-5 w-full max-w-xs space-y-1 border-t border-slate-200 pt-3 text-base">
          <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{money(t.subtotal, cur)}</dd></div>
          <div className="flex justify-between"><dt className="text-slate-500">SST ({rate}%)</dt><dd className="tabular-nums">{money(t.tax, cur)}</dd></div>
          <div className="flex justify-between border-t border-slate-200 pt-1 text-lg font-semibold text-slate-900"><dt>Total</dt><dd className="tabular-nums">{money(t.total, cur)}</dd></div>
        </dl>
      </Card>

      <Card title="Notes" className="mt-4">
        <textarea aria-label="Notes" rows={3} className={inputCls + " !mt-0"} placeholder="Shown on the invoice, for example a PO number or delivery reference" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Card>

      {err && <p role="alert" className="mt-4 rounded bg-rose-50 px-3 py-2 text-rose-800">{err}</p>}
      <div className="mt-4 flex gap-3">
        <button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : editing ? "Save changes" : "Create invoice"}</button>
        <Link href={editing ? `/finance/invoices/${invoice!.id}` : "/finance/invoices"} className={btnGhost}>Cancel</Link>
      </div>
    </form>
  );
}
