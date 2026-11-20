"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useFinance } from "@/components/finance";
import { AlertBadge, btnPrimary, inputCls, StatusBadge } from "@/components/finui";
import { Card, PageHeader, Td, Th } from "@/components/ui";
import { effectiveStatus, fmtDate, money, STATUS_LABEL, type InvStatus } from "@/lib/finance";

const TABS: ("all" | InvStatus)[] = ["all", "unpaid", "partial", "overdue", "paid", "void"];

export default function IssuedInvoices() {
  const { invoices, clients, settings, canManage } = useFinance();
  const [tab, setTab] = useState<"all" | InvStatus>("all");
  const [q, setQ] = useState("");
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.company_name ?? "—";
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: invoices.length };
    invoices.forEach((i) => { const s = effectiveStatus(i); c[s] = (c[s] ?? 0) + 1; });
    return c;
  }, [invoices]);
  const rows = invoices.filter((i) => (tab === "all" || effectiveStatus(i) === tab) &&
    (!q.trim() || `${i.invoice_no} ${nameOf(i.client_id)} ${i.notes}`.toLowerCase().includes(q.trim().toLowerCase())));
  const cur = settings.currency;

  return (
    <>
      <PageHeader title="Invoices made in this app" right={canManage ? <Link href="/finance/invoices/new" className={btnPrimary}>New invoice</Link> : undefined} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`rounded-md border px-3 py-1.5 text-sm font-medium ${tab === t ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
                {t === "all" ? "All" : STATUS_LABEL[t]} <span className="opacity-70">{counts[t] ?? 0}</span>
              </button>
            ))}
          </div>
          <label className="relative ml-auto w-full sm:w-64">
            <span className="sr-only">Search invoices</span>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className={`${inputCls} !mt-0 !pl-9`} placeholder="Search number or client" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Client</Th><Th>Date</Th><Th>Due</Th><Th right>Total</Th><Th right>Balance</Th><Th>Status</Th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><Td first className="text-slate-500">No invoices match.</Td></tr>}
              {rows.map((i) => (
                <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <Td first><Link href={`/finance/invoices/${i.id}`} className="font-medium text-indigo-700 hover:underline">{i.invoice_no}</Link>{i.recurrence && <span className="ml-2 text-xs text-slate-400">{i.recurrence}</span>}</Td>
                  <Td>{nameOf(i.client_id)}</Td>
                  <Td>{fmtDate(i.issue_date)}</Td>
                  <Td>{fmtDate(i.due_date)}</Td>
                  <Td right>{money(i.total, cur)}</Td>
                  <Td right className={i.balance_due > 0 ? "font-medium text-slate-900" : "text-slate-400"}>{money(i.balance_due, cur)}</Td>
                  <Td><span className="inline-flex flex-wrap items-center gap-1.5"><StatusBadge inv={i} /><AlertBadge inv={i} /></span></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
