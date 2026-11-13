"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ReminderPreview, ScoreBadge, useAr } from "@/components/ar";
import { btnGhost, btnPrimary, Field, inputCls, Modal } from "@/components/finui";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { balanceOf, daysPastDue, isOpen, paidOf, SCORE_NOTE, scoreFor, standing } from "@/lib/ar";
import { fmtDate, money, round2, todayISO } from "@/lib/finance";

export default function ArInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const { invoices, customer, today, addPayment, addNote, templates, canManage, currency } = useAr();
  const [saving, setSaving] = useState(false);
  const [remind, setRemind] = useState(false);
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
  const [method, setMethod] = useState("Bank transfer");
  const [payErr, setPayErr] = useState<string | null>(null);
  const [noteErr, setNoteErr] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const inv = invoices.find((i) => i.id === id);
  if (!inv) return <p className="text-slate-500">Invoice not found. <Link href="/finance/ar/invoices" className="text-indigo-600 underline">Back to invoices</Link></p>;
  const c = customer(inv.customerId);
  const late = daysPastDue(inv, today);
  const st = standing(inv, today);
  const sc = scoreFor(c.id, invoices, today);

  return (
    <>
      <Link href="/finance/ar/invoices" className="text-sm text-indigo-600 hover:underline">← All invoices</Link>
      <PageHeader title={inv.no} sub={`${c.name} · issued ${fmtDate(inv.issue)} · due ${fmtDate(inv.due)}`}
        right={canManage && isOpen(inv) && (
          <div className="flex gap-2">
            <button className={btnGhost} onClick={() => { setAmount(balanceOf(inv).toFixed(2)); setPaidOn(todayISO()); setPayErr(null); setPaying(true); }}>Add payment</button>
            {late > 0 && <button className={btnPrimary} onClick={() => setRemind(true)}>Send reminder</button>}
          </div>
        )} />
      <KpiStrip cols="lg:grid-cols-4">
        <Kpi label="Invoice total" value={money(inv.total, currency)} />
        <Kpi label="Paid" value={money(paidOf(inv), currency)} tone="good" />
        <Kpi label="Balance" value={money(balanceOf(inv), currency)} tone={st === "overdue" ? "bad" : "neutral"} />
        <Kpi label={st === "paid" ? "Status" : late > 0 ? "Days past due" : "Due in"} value={st === "paid" ? "Paid" : late > 0 ? String(late) : `${-late} days`} tone={late > 60 ? "bad" : late > 0 ? "warn" : "good"} />
      </KpiStrip>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card title="Customer" className="lg:col-span-1">
          <div className="font-medium text-slate-900">{c.name}</div>
          <div className="text-sm text-slate-600">{c.contact}</div>
          <div className="text-sm text-slate-600">{c.email}</div>
          <div className="text-sm text-slate-600">+{c.phone}</div>
          <div className="mt-3 flex items-center gap-2"><ScoreBadge score={sc.score} /><span className="text-sm text-slate-500">{SCORE_NOTE[sc.score]}</span></div>
        </Card>
        <Card title="Payments" className="lg:col-span-2">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Date</Th><Th>Method</Th><Th right>Amount</Th><Th right>Days vs due</Th></tr></thead>
            <tbody>
              {inv.payments.length === 0 && <tr><Td first className="text-slate-500">No payments yet.</Td></tr>}
              {inv.payments.map((p, n) => {
                const d = Math.round((new Date(p.date).getTime() - new Date(inv.due).getTime()) / 86400000);
                return <tr key={n} className="border-b border-slate-100"><Td first>{fmtDate(p.date)}</Td><Td>{p.method}</Td><Td right>{money(p.amount, currency)}</Td><Td right className={d > 0 ? "text-rose-700" : "text-emerald-700"}>{d > 0 ? `${d} late` : d === 0 ? "on the day" : `${-d} early`}</Td></tr>;
              })}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Reminder history">
          {inv.reminders.length === 0 ? <p className="text-slate-500">No reminders sent for this invoice.</p> : (
            <ul className="divide-y divide-slate-100">
              {[...inv.reminders].reverse().map((r, n) => (
                <li key={n} className="flex items-center justify-between gap-2 py-2"><span>{fmtDate(r.date)} · {templates.find((t) => t.id === r.template)?.name ?? "Reminder"}{r.auto ? " (automatic)" : ""}{r.status === "failed" && r.error ? <span className="block text-xs text-rose-700">{r.error}</span> : null}</span><span className="flex gap-1.5">{r.status === "failed" && <Badge tone="red">Failed</Badge>}<Badge tone="grey">{r.channel === "email" ? "Email" : "WhatsApp"}</Badge></span></li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Notes">
          <p className="min-h-12 whitespace-pre-line text-slate-700">{inv.notes || <span className="text-slate-400">No notes yet.</span>}</p>
          <form className="mt-3 flex gap-2" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; setSaving(true); const err = await addNote(inv.id, note.trim()); setSaving(false); setNoteErr(err); if (!err) setNote(""); }}>
            <input aria-label="New note" className={inputCls + " !mt-0"} placeholder="For example: promised to pay Friday. Write HOLD to pause reminders." value={note} onChange={(e) => setNote(e.target.value)} />
            <button disabled={saving || !canManage} className={btnGhost + " shrink-0"}>Add note</button>
          </form>
          {noteErr && <p role="alert" className="mt-2 text-sm text-rose-700">{noteErr}</p>}
        </Card>
      </div>

      {remind && <ReminderPreview invoices={[inv]} onClose={() => setRemind(false)} />}
      {paying && (
        <Modal title={`Add payment · ${inv.no}`} onClose={() => setPaying(false)}>
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            const err = await addPayment(inv.id, Number(amount), paidOn, method);
            setSaving(false);
            if (err) setPayErr(err); else { setPaying(false); setPayErr(null); }
          }}>
            <Field label="Amount (RM)"><input type="number" step="0.01" min="0.01" max={balanceOf(inv)} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus required /></Field>
            <Field label="Date received"><input type="date" className={inputCls} value={paidOn} max={todayISO()} onChange={(e) => setPaidOn(e.target.value)} required /></Field>
            <Field label="Method"><select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}>{["Bank transfer", "Cheque", "Cash", "DuitNow / e-wallet"].map((m) => <option key={m}>{m}</option>)}</select></Field>
            <p className="text-sm text-slate-500">Balance is {money(balanceOf(inv), currency)}. Enter less for a part payment.{Number(amount) > 0 && Number(amount) <= balanceOf(inv) ? ` After this: ${money(round2(balanceOf(inv) - Number(amount)), currency)} left${Number(amount) === balanceOf(inv) ? ", marked Paid" : ""}.` : ""}</p>
            {payErr && <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">{payErr}</p>}
            <div className="flex gap-3"><button disabled={saving} className={btnPrimary}>{saving ? "Saving…" : "Save payment"}</button><button type="button" className={btnGhost} onClick={() => setPaying(false)}>Cancel</button></div>
          </form>
        </Modal>
      )}
    </>
  );
}
