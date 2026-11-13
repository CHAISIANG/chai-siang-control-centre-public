"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";
import { ReminderPreview, ScoreBadge, useAr } from "@/components/ar";
import { btnGhost, btnPrimary, Modal } from "@/components/finui";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { balanceOf, bucketOf, BUCKETS, daysPastDue, isOpen, lastSent, standing, type ArInvoice, type Standing } from "@/lib/ar";
import { fmtDate, money } from "@/lib/finance";

const STAND: Record<Standing, { label: string; tone: "green" | "amber" | "red" | "blue" }> = {
  paid: { label: "Paid", tone: "green" }, current: { label: "Not yet due", tone: "blue" }, partial: { label: "Part paid", tone: "blue" }, overdue: { label: "Overdue", tone: "red" },
};
const sel = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700";

export default function ArInvoices() {
  const { invoices, customers, customer, score, today, canManage, currency } = useAr();
  const [cust, setCust] = useState("");
  const [status, setStatus] = useState("");
  const [bucket, setBucket] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ArInvoice[] | null>(null);
  const [creditFor, setCreditFor] = useState(false);
  const [orderCust, setOrderCust] = useState("");
  const [approved, setApproved] = useState(false);
  const [orderMsg, setOrderMsg] = useState<string | null>(null);

  const rows = invoices.filter((i) => (!cust || i.customerId === cust) && (!status || standing(i, today) === status) && (!bucket || (isOpen(i) && bucketOf(i, today) === Number(bucket))))
    .sort((a, b) => daysPastDue(b, today) - daysPastDue(a, today));
  const chasable = rows.filter((i) => isOpen(i) && daysPastDue(i, today) > 0);
  const allPicked = chasable.length > 0 && chasable.every((i) => picked.has(i.id));
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = invoices.filter((i) => picked.has(i.id));
  const orderScore = orderCust ? score(orderCust) : null;

  return (
    <>
      <PageHeader title="Invoices to collect" sub="Pick invoices and send reminders. The tone is chosen from how late each one is."
        right={<button className={btnGhost} onClick={() => setCreditFor(true)}>Check a customer before an order</button>} />
      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select aria-label="Customer" className={sel} value={cust} onChange={(e) => setCust(e.target.value)}><option value="">All customers</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <select aria-label="Status" className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any status</option>{(Object.keys(STAND) as Standing[]).map((s) => <option key={s} value={s}>{STAND[s].label}</option>)}</select>
          <select aria-label="Aging bucket" className={sel} value={bucket} onChange={(e) => setBucket(e.target.value)}><option value="">Any aging</option>{BUCKETS.map((b, k) => <option key={b.key} value={k}>{b.label}</option>)}</select>
          {(cust || status || bucket) && <button className="text-sm text-indigo-600 hover:underline" onClick={() => { setCust(""); setStatus(""); setBucket(""); }}>Clear filters</button>}
          <span className="ml-auto text-sm text-slate-500">{rows.length} invoice{rows.length === 1 ? "" : "s"}</span>
        </div>
        {canManage && picked.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-indigo-50 px-3 py-2 text-slate-800">
            <b>{picked.size} selected</b> · {money(chosen.reduce((s, i) => s + balanceOf(i), 0), currency)}
            <button className={btnPrimary + " !px-3 !py-1.5 !text-sm"} onClick={() => setPreview(chosen)}>Send reminders to all</button>
            <button className="text-sm text-indigo-700 hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200">
              <tr>
                <Th first><input type="checkbox" aria-label="Select all overdue invoices" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(chasable.map((i) => i.id)))} /></Th>
                <Th>Invoice</Th><Th>Customer</Th><Th>Due</Th><Th right>Days late</Th><Th right>Balance</Th><Th>Status</Th><Th>Last reminder</Th><Th />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><Td first className="text-slate-500" >No invoices match.</Td></tr>}
              {rows.map((i) => {
                const st = standing(i, today);
                const late = daysPastDue(i, today);
                const last = lastSent(i);
                return (
                  <tr key={i.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <Td first>{isOpen(i) && late > 0 ? <input type="checkbox" aria-label={`Select ${i.no}`} checked={picked.has(i.id)} onChange={() => toggle(i.id)} /> : null}</Td>
                    <Td><Link href={`/finance/ar/invoices/${i.id}`} className="font-medium text-indigo-700 hover:underline">{i.no}</Link></Td>
                    <Td>{customer(i.customerId).name}</Td>
                    <Td>{fmtDate(i.due)}</Td>
                    <Td right className={isOpen(i) && late > 60 ? "font-semibold text-rose-700" : isOpen(i) && late > 30 ? "text-orange-700" : isOpen(i) && late > 0 ? "text-yellow-700" : "text-slate-400"}>{isOpen(i) && late > 0 ? late : "—"}</Td>
                    <Td right>{money(balanceOf(i), currency)}</Td>
                    <Td><Badge tone={STAND[st].tone}>{STAND[st].label}</Badge></Td>
                    <Td className="text-sm text-slate-500">{last ? fmtDate(last.date) : "—"}</Td>
                    <Td right>{canManage && isOpen(i) && late > 0 && <button className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100" onClick={() => setPreview([i])}><Bell size={14} /> Remind</button>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {preview && <ReminderPreview invoices={preview} onClose={() => { setPreview(null); setPicked(new Set()); }} />}
      {creditFor && (
        <Modal title="Check a customer before an order" onClose={() => { setCreditFor(false); setOrderCust(""); }}>
          <div className="space-y-3">
            <p className="text-sm text-slate-500">This is the warning a salesperson or clerk sees before taking an order for a customer. Orders are not part of this system yet, so nothing is created.</p>
            <select aria-label="Customer for the order" className={sel + " w-full"} value={orderCust} onChange={(e) => { setOrderCust(e.target.value); setApproved(false); setOrderMsg(null); }}><option value="">Choose a customer…</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            {orderCust && orderScore === "D" && (
              <div role="alert" className="rounded-lg border border-rose-300 bg-rose-50 p-3 text-rose-900">
                <b>Credit warning: this customer is rated D.</b>
                <p className="mt-1 text-sm">{money(invoices.filter((i) => i.customerId === orderCust && isOpen(i) && daysPastDue(i, today) > 0).reduce((s, i) => s + balanceOf(i), 0), currency)} is overdue, the oldest by {Math.max(...invoices.filter((i) => i.customerId === orderCust && isOpen(i)).map((i) => daysPastDue(i, today)))} days. Get supervisor approval or payment before accepting this order.</p>
              </div>
            )}
            {orderCust && orderScore && orderScore !== "D" && <p className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{customer(orderCust).name} is rated <ScoreBadge score={orderScore} /> and can be ordered normally.</p>}
            {orderScore === "D" && <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> A supervisor has approved this order</label>}
            {orderMsg && <p role="status" className="rounded bg-emerald-50 px-3 py-2 text-emerald-800">{orderMsg}</p>}
            <div className="flex gap-3">
              <button disabled={!orderCust || (orderScore === "D" && !approved)} className={btnPrimary} onClick={() => setOrderMsg(`Cleared to take an order for ${customer(orderCust).name}${orderScore === "D" ? " with supervisor approval" : ""}. `)}>Clear for order</button>
              <button className={btnGhost} onClick={() => { setCreditFor(false); setOrderCust(""); setApproved(false); setOrderMsg(null); }}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
