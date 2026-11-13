"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Camera, Check, Circle, FileText, Receipt, Truck } from "lucide-react";
import { Chain } from "@/components/PoChain";
import { CheckModal, DeliveryModal, InvoiceModal, ReasonModal } from "@/components/PoForms";
import { usePo } from "@/components/po";
import { btnPrimary, btnGhost } from "@/components/finui";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { daysBetween, invTotal, issues, today, poTotal, rmFmt, scoreOf } from "@/lib/po";

export default function PoTrace() {
  const { id } = useParams<{ id: string }>();
  const { pos, addProof, proofUrl, canManage } = usePo();
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "check" | "invoice" | "delivery" | { key: string; text: string }>(null);
  const po = pos.find((p) => p.id === id);
  if (!po) return <PageHeader title="PO not found" sub="This purchase order is not in the list." right={<Link href="/finance/po" className="text-indigo-700 hover:underline">Back to PO tracking</Link>} />;
  const found = issues(po);
  const next = !po.checkedBy ? { label: "Second check", go: () => setModal("check") }
    : !po.invoiceNo ? { label: "Link invoice", go: () => setModal("invoice") }
    : !po.deliveredDate ? { label: "Record delivery", go: () => setModal("delivery") }
    : !po.proofPath ? { label: "Upload signed copy", pick: true } : null;
  const sc = scoreOf(po);
  const steps = [
    { icon: FileText, title: "PO received", date: po.poDate, done: true, lines: [`Customer PO ${po.poNo}`, `Requested delivery ${po.reqDate}`, `Taken by ${po.salesman}`] },
    { icon: FileText, title: "Order keyed", date: po.soNo ? po.poDate : undefined, done: !!po.soNo, lines: po.soNo ? [`Sales order ${po.soNo}`, po.checkedBy ? `Checked against PO by ${po.checkedBy}` : "Waiting for second check"] : ["Not keyed yet"] },
    { icon: Receipt, title: "Invoice issued", date: po.invoiceDate, done: !!po.invoiceNo, lines: po.invoiceNo ? [po.invoiceNo, rmFmt(invTotal(po))] : ["No invoice yet"] },
    { icon: Truck, title: "Delivered", date: po.deliveredDate, done: !!po.deliveredDate, lines: po.deliveredDate ? [`Driver ${po.driver} · ${po.route}`] : po.invoiceNo ? [`Waiting. ${today() > po.reqDate ? daysBetween(po.reqDate, today()) + " day(s) late" : "Due " + po.reqDate}`] : ["After invoicing"] },
    { icon: Camera, title: "Signed proof", date: po.proofPath ? po.deliveredDate : undefined, done: !!po.proofPath, lines: [po.proofPath ? "Signed copy uploaded" : po.deliveredDate ? "Not uploaded yet" : "After delivery"] },
  ];

  return (
    <>
      <Link href="/finance/po" className="no-print mb-3 inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"><ArrowLeft size={16} /> PO & delivery tracking</Link>
      <PageHeader title={po.poNo} sub={`${po.customer} · PO dated ${po.poDate}`} right={<div className="flex items-center gap-2"><Chain po={po} />{canManage && next && ("pick" in next ? (
        <label className={`${btnPrimary} cursor-pointer`}>{next.label}<input type="file" accept="image/*,application/pdf" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setFileErr(await addProof(po.id, f)); e.target.value = ""; }} /></label>
      ) : <button onClick={next.go} className={btnPrimary}>{next.label}</button>)}</div>} />
      {fileErr && <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{fileErr}</p>}

      <Card title="Trace">
        <ol className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {steps.map((s, i) => (
            <li key={i} className={`rounded-lg border p-3 ${s.done ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-slate-50"}`}>
              <div className="flex items-center gap-2 text-base font-semibold text-slate-800">
                {s.done ? <Check size={18} className="text-emerald-600" /> : <Circle size={18} className="text-slate-300" />}{s.title}
              </div>
              <div className="mt-0.5 text-sm text-slate-500">{s.date ?? "Pending"}</div>
              <ul className="mt-2 space-y-0.5 text-sm text-slate-700">{s.lines.map((l) => <li key={l}>{l}</li>)}</ul>
              {i === 4 && po.proofPath && <button onClick={async () => { const u = await proofUrl(po.proofPath!); if (u) window.open(u, "_blank", "noopener"); else setFileErr("The signed copy could not be opened."); }} className="mt-2 inline-block text-sm font-medium text-indigo-700 hover:underline">View signed copy</button>}
              {i === 2 && po.invoiceNo && <Link href={`/finance/invoices/${po.invoiceId}`} className="mt-2 inline-block text-sm font-medium text-indigo-700 hover:underline">Open invoice</Link>}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="mt-4" title="PO, invoice and delivery side by side" right={<span className="text-sm text-slate-500">Red cells do not match the PO</span>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Item</Th><Th right>PO qty</Th><Th right>Invoiced qty</Th><Th right>Delivered qty</Th><Th right>PO price</Th><Th right>Invoice price</Th></tr></thead>
            <tbody>
              {po.lines.map((l) => {
                const bad = "bg-rose-50 font-medium text-rose-700";
                return (
                  <tr key={l.sku} className="border-b border-slate-100">
                    <Td first><div className="font-medium text-slate-900">{l.sku}</div><div className="text-sm text-slate-500">{l.desc}</div></Td>
                    <Td right>{l.poQty}</Td>
                    <Td right className={l.invQty !== undefined && l.invQty !== l.poQty ? bad : ""}>{l.invQty ?? "–"}</Td>
                    <Td right className={l.delQty !== undefined && l.delQty < l.poQty ? bad : ""}>{l.delQty ?? "–"}</Td>
                    <Td right>{rmFmt(l.poPrice)}</Td>
                    <Td right className={l.invPrice !== undefined && l.invPrice !== l.poPrice ? bad : ""}>{l.invPrice !== undefined ? rmFmt(l.invPrice) : "–"}</Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="border-t border-slate-200"><Td first className="font-medium">PO total</Td><Td /><Td /><Td /><Td right className="font-medium">{rmFmt(poTotal(po))}</Td><Td right className={po.invoiceNo && invTotal(po) !== poTotal(po) ? "font-medium text-rose-700" : "font-medium"}>{po.invoiceNo ? rmFmt(invTotal(po)) : "–"}</Td></tr></tfoot>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title="Service level for this order">
          {sc ? (
            <div className="grid grid-cols-3 gap-3 p-4 text-center">
              {([["On time", sc.onTime], ["In full", sc.inFull], ["Accurate", sc.accurate]] as const).map(([l, ok]) => (
                <div key={l} className={`rounded-lg border p-3 ${ok ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"}`}>
                  <div className={`font-display text-2xl font-semibold ${ok ? "text-emerald-700" : "text-rose-700"}`}>{ok ? "Yes" : "No"}</div>
                  <div className="text-sm text-slate-600">{l}</div>
                </div>
              ))}
              <div className="col-span-3 text-left text-sm text-slate-600">{sc.perfect ? "Perfect order." : "Not a perfect order."} Fill rate {sc.fillPct.toFixed(0)}%.</div>
            </div>
          ) : <p className="p-4 text-slate-500">Scored once the goods are delivered.</p>}
        </Card>

        <Card title="Problems to resolve" right={<span className="text-sm text-slate-500">{found.filter((f) => !f.reason).length} open</span>}>
          {found.length === 0 ? <p className="p-4 text-slate-500">No problems on this order.</p> : (
            <ul className="divide-y divide-slate-100">
              {found.map((f) => (
                <li key={f.text} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="text-slate-800">{f.text}{f.reason && <span className="block text-sm text-slate-500">Reason: {f.reason}</span>}</span>
                  {f.reason ? <Badge tone="green">Explained</Badge> : !canManage ? null : <button onClick={() => setModal({ key: f.key, text: f.text })} className={`${btnGhost} shrink-0 !px-3 !py-1 !text-sm`}>Add reason</button>}
                </li>
              ))}
            </ul>
          )}
          {po.note && <p className="border-t border-slate-100 px-4 py-3 text-sm text-slate-600">Note: {po.note}</p>}
        </Card>
      </div>
      {modal === "check" && <CheckModal po={po} onClose={() => setModal(null)} />}
      {modal === "invoice" && <InvoiceModal po={po} onClose={() => setModal(null)} />}
      {modal === "delivery" && <DeliveryModal po={po} onClose={() => setModal(null)} />}
      {modal && typeof modal === "object" && <ReasonModal po={po} issue={modal} onClose={() => setModal(null)} />}
    </>
  );
}
