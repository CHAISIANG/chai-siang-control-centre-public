"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import ClientModal from "@/components/ClientModal";
import { useFinance } from "@/components/finance";
import { AlertBadge, btnGhost, btnPrimary, StatusBadge } from "@/components/finui";
import { Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { effectiveStatus, fmtDate, money, openInvoices } from "@/lib/finance";

export default function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const { clients, invoices, settings, canManage, refresh } = useFinance();
  const [editing, setEditing] = useState(false);
  const c = clients.find((x) => x.id === id);
  if (!c) return <p className="text-slate-500">Client not found. <Link href="/finance/clients" className="text-indigo-600 underline">Back to clients</Link></p>;
  const cur = settings.currency;
  const mine = invoices.filter((i) => i.client_id === c.id);
  const open = openInvoices(mine);
  const owed = open.reduce((s, i) => s + i.balance_due, 0);
  const overdue = open.filter((i) => effectiveStatus(i) === "overdue").reduce((s, i) => s + i.balance_due, 0);
  const billed = mine.filter((i) => i.status !== "void").reduce((s, i) => s + i.total, 0);
  const payments = mine.flatMap((i) => i.payments.map((p) => ({ p, no: i.invoice_no, iid: i.id }))).sort((a, b) => b.p.paid_on.localeCompare(a.p.paid_on));

  return (
    <>
      <Link href="/finance/clients" className="text-sm text-indigo-600 hover:underline">← All clients</Link>
      <PageHeader title={c.company_name} sub={[c.contact_person, c.phone, c.email].filter(Boolean).join(" · ") || undefined}
        right={<div className="flex gap-2">{canManage && <button onClick={() => setEditing(true)} className={btnGhost}>Edit client</button>}{canManage && <Link href="/finance/invoices/new" className={btnPrimary}>New invoice</Link>}</div>} />
      <KpiStrip cols="lg:grid-cols-3">
        <Kpi label="Outstanding" value={money(owed, cur)} sub={`${open.length} open invoice${open.length === 1 ? "" : "s"}`} />
        <Kpi label="Overdue" value={money(overdue, cur)} tone={overdue ? "bad" : "good"} sub={overdue ? "Needs chasing" : "None overdue"} />
        <Kpi label="Total billed" value={money(billed, cur)} sub={`${mine.length} invoice${mine.length === 1 ? "" : "s"}`} />
      </KpiStrip>
      {(c.address || c.notes) && <Card className="mt-4"><p className="whitespace-pre-line text-slate-700">{c.address}</p>{c.notes && <p className="mt-2 text-sm text-slate-500">Notes: {c.notes}</p>}</Card>}

      <Card title="Invoices" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Date</Th><Th>Due</Th><Th right>Total</Th><Th right>Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {mine.length === 0 && <tr><Td first className="text-slate-500">No invoices for this client yet.</Td></tr>}
              {mine.map((i) => (
                <tr key={i.id} className="border-b border-slate-100">
                  <Td first><Link href={`/finance/invoices/${i.id}`} className="font-medium text-indigo-700 hover:underline">{i.invoice_no}</Link></Td>
                  <Td>{fmtDate(i.issue_date)}</Td><Td>{fmtDate(i.due_date)}</Td>
                  <Td right>{money(i.total, cur)}</Td><Td right>{money(i.balance_due, cur)}</Td>
                  <Td><span className="inline-flex flex-wrap items-center gap-1.5"><StatusBadge inv={i} /><AlertBadge inv={i} /></span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Payments received" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Date</Th><Th>Invoice</Th><Th>Method</Th><Th>Reference</Th><Th right>Amount</Th></tr></thead>
            <tbody>
              {payments.length === 0 && <tr><Td first className="text-slate-500">No payments yet.</Td></tr>}
              {payments.map(({ p, no, iid }) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <Td first>{fmtDate(p.paid_on)}</Td>
                  <Td><Link href={`/finance/invoices/${iid}`} className="text-indigo-700 hover:underline">{no}</Link></Td>
                  <Td>{p.method}</Td><Td>{p.reference || "—"}</Td><Td right>{money(p.amount, cur)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <ClientModal client={c} onClose={() => setEditing(false)} onSaved={async () => { await refresh(); }} />}
    </>
  );
}
