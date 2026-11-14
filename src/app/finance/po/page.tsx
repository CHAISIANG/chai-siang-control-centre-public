"use client";
import Link from "next/link";
import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Chain } from "@/components/PoChain";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { NewPoModal } from "@/components/PoForms";
import { usePo } from "@/components/po";
import { btnPrimary } from "@/components/finui";
import { openIssues, stageOf, summary } from "@/lib/po";

const pctTxt = (n: number) => `${n.toFixed(0)}%`;
const tone = (n: number): "good" | "warn" | "bad" => (n >= 95 ? "good" : n >= 85 ? "warn" : "bad");
const issueTone = { late: "red", overdue: "red", short: "amber", dropped: "red", substituted: "amber", price: "amber", qty: "amber", proof: "blue", credit: "amber", copy: "red", early: "amber" } as const;
const issueLabel = { late: "Late", overdue: "Not delivered", short: "Short", dropped: "Dropped", substituted: "Substituted", price: "Price differs", qty: "Qty differs", proof: "No proof", credit: "Credit note due", copy: "No PO copy", early: "Early" } as const;

export default function PoTracking() {
  const [tab, setTab] = useState<"all" | "attention">("attention");
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const { pos: POS, canManage } = usePo();
  const s = summary(POS);
  const rows = POS.filter((p) => tab === "all" || openIssues(p).length > 0 || stageOf(p) !== "closed")
    .filter((p) => !q || (p.poNo + p.customer + (p.invoiceNo ?? "")).toLowerCase().includes(q.toLowerCase()));
  const customers = [...new Set(POS.map((p) => p.customer))].map((c) => ({ c, ...summary(POS.filter((p) => p.customer === c)) }));

  return (
    <>
      <PageHeader title="PO & delivery tracking" sub="Follow each customer PO from order to invoice to signed delivery, and see how well we met it." right={<div className="flex items-center gap-2"><Link href="/finance/po/codes" className="rounded-md border border-slate-300 bg-white px-3 py-2 text-base font-medium text-slate-700 hover:bg-slate-100">Item codes</Link>{canManage && <button onClick={() => setAdding(true)} className={`${btnPrimary} inline-flex items-center gap-1`}><Plus size={18} /> Key in PO</button>}</div>} />
      <KpiStrip>
        <Kpi label="On time" value={pctTxt(s.onTime)} tone={tone(s.onTime)} pct={s.onTime} sub="Delivered by the requested date" />
        <Kpi label="In full" value={pctTxt(s.inFull)} tone={tone(s.inFull)} pct={s.inFull} sub="All cartons delivered" />
        <Kpi label="Accurate" value={pctTxt(s.accurate)} tone={tone(s.accurate)} pct={s.accurate} sub="Invoice matches the PO" />
        <Kpi label="Perfect orders" value={pctTxt(s.perfect)} tone={tone(s.perfect)} pct={s.perfect} sub={`${s.delivered} delivered orders · target 95%`} />
      </KpiStrip>

      <Card className="mt-4" title="Purchase orders" right={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
            {([["attention", "Needs attention"], ["all", "All orders"]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} className={`rounded px-3 py-1 ${tab === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>
            ))}
          </div>
          <label className="relative"><Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="PO, invoice or customer" className="w-52 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm" /></label>
        </div>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>PO no.</Th><Th>Customer</Th><Th>Requested</Th><Th>Invoice</Th><Th>Progress</Th><Th>Problems</Th><Th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><Td first className="text-slate-500">{POS.length === 0 ? "No purchase orders yet. Use Key in PO when a customer sends one." : "Nothing needs attention."}</Td></tr>}
              {rows.map((p) => (
                <tr key={p.id} className="border-b border-slate-100">
                  <Td first><Link href={`/finance/po/${p.id}`} className="font-medium text-indigo-700 hover:underline">{p.poNo}</Link></Td>
                  <Td>{p.customer}</Td>
                  <Td>{p.reqDate}</Td>
                  <Td>{p.invoiceNo ?? <span className="text-slate-400">Not invoiced</span>}</Td>
                  <Td><Chain po={p} /></Td>
                  <Td><div className="flex gap-1">{openIssues(p).length === 0 ? <span className="text-slate-400">None</span> : [...new Set(openIssues(p).map((i) => i.kind))].map((k) => <Badge key={k} tone={issueTone[k]}>{issueLabel[k]}</Badge>)}</div></Td>
                  <Td right><Link href={`/finance/po/${p.id}`} className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700 hover:bg-slate-100">Trace</Link></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-4" title="Service level by customer">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th right>Delivered</Th><Th right>On time</Th><Th right>In full</Th><Th right>Accurate</Th><Th right>Perfect</Th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.c} className="border-b border-slate-100">
                  <Td first className="font-medium text-slate-900">{c.c}</Td>
                  <Td right>{c.delivered}</Td>
                  {[c.onTime, c.inFull, c.accurate, c.perfect].map((v, i) => <Td key={i} right className={v >= 95 ? "text-emerald-700" : v >= 85 ? "text-amber-700" : "font-medium text-rose-700"}>{pctTxt(v)}</Td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && <NewPoModal onClose={() => setAdding(false)} />}
    </>
  );
}
