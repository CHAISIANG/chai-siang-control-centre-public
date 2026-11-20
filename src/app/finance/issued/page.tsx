"use client";
import Link from "next/link";
import { useState } from "react";
import { useFinance } from "@/components/finance";
import { btnPrimary, StatusBadge } from "@/components/finui";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { alertFor, BUCKETS, bucketIndex, daysBetween, effectiveStatus, fmtDate, money, openInvoices, todayISO } from "@/lib/finance";

export default function IssuedOverview() {
  const { invoices, clients, settings, canManage, refresh } = useFinance();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const today = todayISO();
  const cur = settings.currency;
  const open = openInvoices(invoices);
  const outstanding = open.reduce((s, i) => s + i.balance_due, 0);
  const overdueList = open.filter((i) => effectiveStatus(i, today) === "overdue");
  const overdueAmt = overdueList.reduce((s, i) => s + i.balance_due, 0);
  const owing = new Set(open.map((i) => i.client_id)).size;

  const aging = clients.map((c) => {
    const row = [0, 0, 0, 0, 0];
    open.filter((i) => i.client_id === c.id).forEach((i) => { row[bucketIndex(i, today)] += i.balance_due; });
    return { c, row, total: row.reduce((a, b) => a + b, 0) };
  }).filter((r) => r.total > 0);
  const agingTotals = BUCKETS.map((_, k) => aging.reduce((s, r) => s + r.row[k], 0));

  const recent = invoices.slice(0, 5);
  const nameOf = (id: string) => clients.find((c) => c.id === id)?.company_name ?? "—";
  const alerts = open.map((i) => ({ i, a: alertFor(i, today) })).filter((x) => x.a).sort((x, y) => y.a!.days - x.a!.days);
  const recurring = invoices.filter((i) => i.recurrence && i.next_generate_date && i.status !== "void").sort((a, b) => a.next_generate_date!.localeCompare(b.next_generate_date!));

  async function generate(id: string) {
    setBusy(id); setErr(null);
    const { error } = await supabase.rpc("fin_generate_next", { src: id });
    if (error) setErr(error.message);
    await refresh();
    setBusy(null);
  }

  return (
    <>
      <PageHeader title="Invoices made in this app" sub="Invoices, payments and who owes what, for invoices created here (not the SAP aging)."
        right={canManage ? <Link href="/finance/invoices/new" className={btnPrimary}>New invoice</Link> : undefined} />
      <KpiStrip cols="lg:grid-cols-3">
        <Kpi label="Total outstanding" value={money(outstanding, cur)} sub={`${open.length} unpaid invoice${open.length === 1 ? "" : "s"}`} />
        <Kpi label="Overdue" value={money(overdueAmt, cur)} sub={`${overdueList.length} invoice${overdueList.length === 1 ? "" : "s"} past due`} tone={overdueAmt > 0 ? "bad" : "good"} pct={outstanding ? (overdueAmt / outstanding) * 100 : 0} />
        <Kpi label="Clients" value={String(clients.length)} sub={`${owing} with a balance`} />
      </KpiStrip>
      {err && <p role="alert" className="mt-4 rounded bg-rose-50 px-3 py-2 text-rose-800">{err}</p>}

      <Card title="Aging report" className="mt-4" right={<span className="text-sm text-slate-500">Balance by days past due date</span>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr><Th first>Client</Th>{BUCKETS.map((b) => <Th key={b} right>{b}</Th>)}<Th right>Total</Th></tr>
            </thead>
            <tbody>
              {aging.length === 0 && <tr><Td first className="text-slate-500">Nothing outstanding.</Td></tr>}
              {aging.map((r) => (
                <tr key={r.c.id} className="border-b border-slate-100">
                  <Td first><Link href={`/finance/clients/${r.c.id}`} className="font-medium text-slate-900 hover:underline">{r.c.company_name}</Link></Td>
                  {r.row.map((v, k) => <Td key={k} right className={v && k > 0 ? (k > 2 ? "font-semibold text-rose-700" : "text-amber-700") : v ? "" : "text-slate-300"}>{v ? v.toLocaleString("en-MY", { minimumFractionDigits: 2 }) : "—"}</Td>)}
                  <Td right className="font-semibold">{r.total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</Td>
                </tr>
              ))}
            </tbody>
            {aging.length > 0 && (
              <tfoot className="border-t-2 border-slate-200">
                <tr><Td first className="font-semibold">Total ({cur})</Td>{agingTotals.map((v, k) => <Td key={k} right className="font-semibold">{v.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</Td>)}<Td right className="font-semibold">{outstanding.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</Td></tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Overdue and due soon" right={<span className="text-sm text-slate-500">Yellow: due within 3 days. Red: overdue.</span>}>
          {alerts.length === 0 ? <p className="text-slate-500">Nothing needs chasing today.</p> : (
            <ul className="divide-y divide-slate-100">
              {alerts.map(({ i, a }) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/finance/invoices/${i.id}`} className="font-medium text-slate-900 hover:underline">{i.invoice_no}</Link>
                    <div className="truncate text-sm text-slate-500">{nameOf(i.client_id)} · due {fmtDate(i.due_date)}</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular-nums text-slate-800">{money(i.balance_due, cur)}</div>
                    <Badge tone={a!.tone}>{a!.label}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent invoices" right={<Link href="/finance/invoices" className="text-sm text-indigo-600 hover:underline">All invoices</Link>}>
          <ul className="divide-y divide-slate-100">
            {recent.length === 0 && <li className="py-2 text-slate-500">No invoices yet.</li>}
            {recent.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <Link href={`/finance/invoices/${i.id}`} className="font-medium text-slate-900 hover:underline">{i.invoice_no}</Link>
                  <div className="truncate text-sm text-slate-500">{nameOf(i.client_id)} · {fmtDate(i.issue_date)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums text-slate-800">{money(i.total, cur)}</span>
                  <StatusBadge inv={i} />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Recurring invoices" className="mt-4" right={<span className="text-sm text-slate-500">Next invoice to generate</span>}>
        {recurring.length === 0 ? <p className="text-slate-500">No recurring invoices. Tick &ldquo;Repeat&rdquo; on an invoice to add one.</p> : (
          <ul className="divide-y divide-slate-100">
            {recurring.map((i) => {
              const d = daysBetween(today, i.next_generate_date!);
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/finance/invoices/${i.id}`} className="font-medium text-slate-900 hover:underline">{i.invoice_no}</Link>
                    <span className="ml-2 text-sm text-slate-500">{nameOf(i.client_id)} · {i.recurrence}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-slate-600">Next: {fmtDate(i.next_generate_date)} {d < 0 ? <Badge tone="red">{-d} days late</Badge> : d === 0 ? <Badge tone="amber">today</Badge> : <span className="text-slate-400">(in {d} days)</span>}</span>
                    {canManage && <button disabled={busy === i.id} onClick={() => void generate(i.id)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50">{busy === i.id ? "Generating…" : "Generate now"}</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
