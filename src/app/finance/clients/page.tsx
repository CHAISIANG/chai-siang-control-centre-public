"use client";
import Link from "next/link";
import { useState } from "react";
import ClientModal from "@/components/ClientModal";
import { useFinance } from "@/components/finance";
import { btnPrimary } from "@/components/finui";
import { Card, PageHeader, Td, Th } from "@/components/ui";
import { effectiveStatus, money, openInvoices } from "@/lib/finance";

export default function Clients() {
  const { clients, invoices, settings, canManage, refresh } = useFinance();
  const [adding, setAdding] = useState(false);
  const rows = clients.map((c) => {
    const mine = openInvoices(invoices.filter((i) => i.client_id === c.id));
    return { c, n: invoices.filter((i) => i.client_id === c.id).length, owed: mine.reduce((s, i) => s + i.balance_due, 0), overdue: mine.filter((i) => effectiveStatus(i) === "overdue").reduce((s, i) => s + i.balance_due, 0) };
  });
  return (
    <>
      <PageHeader title="Clients" right={canManage ? <button onClick={() => setAdding(true)} className={btnPrimary}>New client</button> : undefined} />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Company</Th><Th>Contact</Th><Th right>Invoices</Th><Th right>Outstanding</Th><Th right>of which overdue</Th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><Td first className="text-slate-500">No clients yet.</Td></tr>}
              {rows.map(({ c, n, owed, overdue }) => (
                <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <Td first><Link href={`/finance/clients/${c.id}`} className="font-medium text-indigo-700 hover:underline">{c.company_name}</Link></Td>
                  <Td>{c.contact_person || "—"}</Td>
                  <Td right>{n}</Td>
                  <Td right className={owed ? "font-medium text-slate-900" : "text-slate-400"}>{money(owed, settings.currency)}</Td>
                  <Td right className={overdue ? "font-medium text-rose-700" : "text-slate-400"}>{money(overdue, settings.currency)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && <ClientModal onClose={() => setAdding(false)} onSaved={async () => { await refresh(); }} />}
    </>
  );
}
