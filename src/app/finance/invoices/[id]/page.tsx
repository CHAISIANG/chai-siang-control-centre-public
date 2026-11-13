"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Mail, Pencil, Printer, Repeat, Trash2, Wallet } from "lucide-react";
import { useFinance } from "@/components/finance";
import { AlertBadge, btnGhost, btnPrimary, Field, inputCls, Modal, StatusBadge } from "@/components/finui";
import { Badge } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { alertFor, effectiveStatus, fmtDate, money, reminderEmail, round2, todayISO, type FinInvoice } from "@/lib/finance";

const METHODS = ["Bank transfer", "Cheque", "Cash", "Online banking (FPX)", "DuitNow / e-wallet", "Other"];

function PaymentModal({ inv, cur, onClose, onDone }: { inv: FinInvoice; cur: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [amount, setAmount] = useState(inv.balance_due.toFixed(2));
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState(METHODS[0]);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amt = round2(Number(amount));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!(amt > 0)) return setErr("Enter an amount above 0.");
    if (amt > inv.balance_due) return setErr(`That is more than the balance of ${money(inv.balance_due, cur)}.`);
    setBusy(true); setErr(null);
    const { error } = await supabase.from("fin_payments").insert({ invoice_id: inv.id, paid_on: paidOn, amount: amt, method, reference, note });
    if (error) { setBusy(false); return setErr(error.message); }
    await onDone();
    onClose();
  }
  return (
    <Modal title={`Record payment · ${inv.invoice_no}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-500">Balance due {money(inv.balance_due, cur)}. Enter less for a part payment.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Amount (${cur})`}><input type="number" step="0.01" min="0.01" max={inv.balance_due} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required /></Field>
          <Field label="Date received"><input type="date" className={inputCls} value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} required /></Field>
        </div>
        <Field label="Method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map((m) => <option key={m}>{m}</option>)}</select></Field>
        <Field label="Reference (transfer or cheque no.)"><input className={inputCls} value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
        <Field label="Note"><input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        {amt > 0 && amt <= inv.balance_due && <p className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">After this payment: balance {money(round2(inv.balance_due - amt), cur)} · {amt === inv.balance_due ? "marked Paid" : "marked Part paid"}</p>}
        {err && <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
        <div className="flex gap-3"><button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Record payment"}</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function ReminderModal({ inv, onClose, onDone }: { inv: FinInvoice; onClose: () => void; onDone: () => Promise<void> }) {
  const { clients, settings } = useFinance();
  const client = clients.find((c) => c.id === inv.client_id)!;
  const a = alertFor(inv);
  const init = reminderEmail(inv, client, settings, a);
  const [subject, setSubject] = useState(init.subject);
  const [body, setBody] = useState(init.body);
  const [copied, setCopied] = useState(false);
  async function log() { await supabase.from("fin_reminders").insert({ invoice_id: inv.id, level: a?.key ?? "manual" }); await onDone(); }
  const mailto = `mailto:${encodeURIComponent(client.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return (
    <Modal title="Reminder email" onClose={onClose} wide>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">{a ? <>Notice level: <b>{a.label}</b>.</> : "This invoice is not due yet; this is a general reminder."} Edit the text, then send it from your own mail app. Nothing is sent from here.</p>
        <Field label={`To${client.email ? "" : " (no email saved for this client)"}`}><input readOnly className={inputCls + " bg-slate-50"} value={client.email} /></Field>
        <Field label="Subject"><input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
        <Field label="Message"><textarea rows={14} className={inputCls + " font-mono text-sm"} value={body} onChange={(e) => setBody(e.target.value)} /></Field>
        <div className="flex flex-wrap gap-3">
          <a href={mailto} onClick={() => void log()} className={btnPrimary}>Open in mail app</a>
          <button type="button" className={btnGhost} onClick={() => { void navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => { setCopied(true); void log(); }); }}>{copied ? "Copied" : "Copy text"}</button>
        </div>
      </div>
    </Modal>
  );
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { invoices, clients, settings, canManage, refresh } = useFinance();
  const [modal, setModal] = useState<"pay" | "remind" | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reminders, setReminders] = useState<number | null>(null);
  const inv = invoices.find((i) => i.id === id);
  const loadReminders = useCallback(async () => {
    const { count } = await supabase.from("fin_reminders").select("id", { count: "exact", head: true }).eq("invoice_id", id);
    setReminders(count ?? 0);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReminders();
  }, [loadReminders]);
  if (!inv) return <p className="text-slate-500">Invoice not found. <Link href="/finance/invoices" className="text-indigo-600 underline">Back to invoices</Link></p>;
  const client = clients.find((c) => c.id === inv.client_id);
  const s = settings;
  const cur = s.currency;
  const status = effectiveStatus(inv);
  const open = status !== "paid" && status !== "void" && inv.balance_due > 0;

  async function act(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true); setErr(null);
    const { error } = await fn();
    if (error) setErr(error.message);
    await refresh();
    setBusy(false);
  }

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link href="/finance/invoices" className="mr-auto text-sm text-indigo-600 hover:underline">← All invoices</Link>
        <StatusBadge inv={inv} /> <AlertBadge inv={inv} />
        {open && canManage && <button onClick={() => setModal("pay")} className={btnPrimary + " inline-flex items-center gap-2"}><Wallet size={18} /> Record payment</button>}
        {open && <button onClick={() => setModal("remind")} className={btnGhost + " inline-flex items-center gap-2"}><Mail size={18} /> Reminder email{reminders ? ` (${reminders} sent)` : ""}</button>}
        {canManage && inv.recurrence && inv.next_generate_date && <button disabled={busy} onClick={() => void act(() => supabase.rpc("fin_generate_next", { src: inv.id }))} className={btnGhost + " inline-flex items-center gap-2"}><Repeat size={18} /> Generate next ({fmtDate(inv.next_generate_date)})</button>}
        {canManage && status !== "paid" && status !== "void" && <Link href={`/finance/invoices/${inv.id}/edit`} className={btnGhost + " inline-flex items-center gap-2"}><Pencil size={18} /> Edit</Link>}
        <button onClick={() => window.print()} className={btnGhost + " inline-flex items-center gap-2"}><Printer size={18} /> Print</button>
        {canManage && status !== "void" && inv.amount_paid === 0 && <button disabled={busy} onClick={() => { if (confirm(`Void ${inv.invoice_no}? Its number is kept and it stops counting as owed.`)) void act(() => supabase.from("fin_invoices").update({ status: "void", recurrence: null, next_generate_date: null }).eq("id", inv.id)); }} className="rounded-md border border-rose-300 px-4 py-2 text-base font-medium text-rose-700 hover:bg-rose-50">Void</button>}
      </div>
      {err && <p role="alert" className="no-print mb-4 rounded bg-rose-50 px-3 py-2 text-rose-800">{err}</p>}

      <article id="inv-print" className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-800 shadow-sm print:rounded-none print:border-0 print:shadow-none">
        <header className="inv-navy flex flex-wrap items-start justify-between gap-4 bg-[#14213d] px-6 py-6 text-white">
          <div>
            <h2 className="text-xl font-semibold">{s.company_name}</h2>
            <p className="mt-1 max-w-xs whitespace-pre-line text-sm text-slate-200">{s.company_address}</p>
            <p className="mt-1 text-sm text-slate-200">{[s.company_phone, s.company_email].filter(Boolean).join(" · ")}</p>
            {(s.reg_no || s.sst_no) && <p className="mt-1 text-xs text-slate-300">{[s.reg_no && `Reg. no. ${s.reg_no}`, s.sst_no && `SST no. ${s.sst_no}`].filter(Boolean).join(" · ")}</p>}
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tracking-wide">{s.sst_no ? "TAX INVOICE" : "INVOICE"}</div>
            <div className="mt-1 text-lg">{inv.invoice_no}</div>
            {status === "void" && <div className="mt-1 inline-block rounded border border-white/60 px-2 text-sm">VOID</div>}
            {status === "paid" && <div className="mt-1 inline-block rounded border border-emerald-300 px-2 text-sm text-emerald-200">PAID</div>}
          </div>
        </header>

        <div className="grid gap-6 px-6 py-5 sm:grid-cols-2">
          <div>
            <div className="text-sm text-slate-500">Bill to</div>
            <div className="mt-1 font-semibold text-slate-900">{client?.company_name}</div>
            {client?.contact_person && <div className="text-sm">Attn: {client.contact_person}</div>}
            <div className="whitespace-pre-line text-sm text-slate-600">{client?.address}</div>
            <div className="text-sm text-slate-600">{[client?.phone, client?.email].filter(Boolean).join(" · ")}</div>
          </div>
          <dl className="grid grid-cols-2 gap-y-1 text-sm sm:justify-self-end">
            <dt className="pr-6 text-slate-500">Invoice date</dt><dd className="text-right">{fmtDate(inv.issue_date)}</dd>
            <dt className="pr-6 text-slate-500">Due date</dt><dd className="text-right font-medium">{fmtDate(inv.due_date)}</dd>
            <dt className="pr-6 text-slate-500">Terms</dt><dd className="text-right">Net {Math.max(0, Math.round((new Date(inv.due_date).getTime() - new Date(inv.issue_date).getTime()) / 86400000))} days</dd>
            {inv.recurrence && <><dt className="pr-6 text-slate-500">Repeats</dt><dd className="text-right capitalize">{inv.recurrence}</dd></>}
          </dl>
        </div>

        <div className="overflow-x-auto px-6">
          <table className="w-full text-sm">
            <thead><tr className="border-y border-slate-300 bg-slate-50 text-left text-slate-600"><th className="py-2 pr-2 font-medium">Description</th><th className="px-2 py-2 text-right font-medium">Qty</th><th className="px-2 py-2 text-right font-medium">Unit price</th><th className="py-2 pl-2 text-right font-medium">Amount ({cur})</th></tr></thead>
            <tbody>
              {inv.items.map((it) => (
                <tr key={it.id} className="border-b border-slate-100"><td className="py-2 pr-2">{it.description}</td><td className="px-2 py-2 text-right tabular-nums">{it.qty}</td><td className="px-2 py-2 text-right tabular-nums">{it.unit_price.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td><td className="py-2 pl-2 text-right tabular-nums">{it.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td></tr>
              ))}
            </tbody>
          </table>
          <dl className="ml-auto mt-3 w-full max-w-xs space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums">{money(inv.subtotal, cur)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">SST ({inv.tax_rate}%)</dt><dd className="tabular-nums">{money(inv.tax_amount, cur)}</dd></div>
            <div className="flex justify-between border-t border-slate-300 pt-1 text-base font-semibold"><dt>Total</dt><dd className="tabular-nums">{money(inv.total, cur)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Paid</dt><dd className="tabular-nums">{money(inv.amount_paid, cur)}</dd></div>
            <div className="inv-navy -mx-2 flex justify-between rounded bg-[#14213d] px-2 py-1.5 text-base font-semibold text-white"><dt>Balance due</dt><dd className="tabular-nums">{money(inv.balance_due, cur)}</dd></div>
          </dl>
        </div>

        {inv.payments.length > 0 && (
          <div className="px-6 pt-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-700">Payment history</h3>
            <table className="w-full text-sm">
              <tbody>
                {inv.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-2">{fmtDate(p.paid_on)}</td><td className="px-2 py-1.5">{p.method}{p.reference ? ` · ${p.reference}` : ""}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{money(p.amount, cur)}</td>
                    <td className="no-print w-8 py-1.5 text-right">{canManage && <button aria-label="Delete payment" title="Delete this payment" className="rounded p-1 text-slate-400 hover:text-rose-600" onClick={() => { if (confirm(`Delete the ${money(p.amount, cur)} payment of ${fmtDate(p.paid_on)}? The balance goes back up.`)) void act(() => supabase.from("fin_payments").delete().eq("id", p.id)); }}><Trash2 size={16} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="grid gap-4 px-6 py-5 text-sm sm:grid-cols-2">
          <div>
            <h3 className="font-semibold text-slate-700">Pay by bank transfer</h3>
            {s.bank_account_no ? (
              <p className="mt-1 text-slate-600">{s.bank_name}<br />Account name: {s.bank_account_name}<br />Account no.: <b className="text-slate-800">{s.bank_account_no}</b><br />Reference: {inv.invoice_no}</p>
            ) : <p className="mt-1 text-slate-400">Add your bank details in Finance settings.</p>}
          </div>
          {inv.notes && <div><h3 className="font-semibold text-slate-700">Notes</h3><p className="mt-1 whitespace-pre-line text-slate-600">{inv.notes}</p></div>}
        </div>
        <footer className="border-t border-slate-200 px-6 py-3 text-center text-xs text-slate-500">Payment terms: {Math.max(0, Math.round((new Date(inv.due_date).getTime() - new Date(inv.issue_date).getTime()) / 86400000))} days from invoice date. This is a computer-generated invoice.</footer>
      </article>
      {inv.recurring_source && <p className="no-print mt-3 text-center text-sm text-slate-500"><Badge tone="grey">Generated from a recurring invoice</Badge></p>}

      {modal === "pay" && <PaymentModal inv={inv} cur={cur} onClose={() => setModal(null)} onDone={refresh} />}
      {modal === "remind" && client && <ReminderModal inv={inv} onClose={() => setModal(null)} onDone={async () => { await loadReminders(); }} />}
    </>
  );
}
