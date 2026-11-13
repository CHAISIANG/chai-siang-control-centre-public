"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { btnGhost, btnPrimary, Field, inputCls, Modal } from "./finui";
import { usePo } from "./po";
import { useFinance } from "./finance";
import { checkDeliveryLines, checkNewPo, OUTCOMES, today, type Outcome, type Po, type PoLine } from "@/lib/po";

function Form({ title, onClose, wide, submit, label, children }: { title: string; onClose: () => void; wide?: boolean; submit: () => string | null | Promise<string | null>; label: string; children: ReactNode }) {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(e: FormEvent) { e.preventDefault(); setBusy(true); setErr(null); const r = await submit(); setBusy(false); if (r) setErr(r); else onClose(); }
  return (
    <Modal title={title} onClose={onClose} wide={wide}>
      <form onSubmit={go} className="space-y-3">
        {children}
        {err && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className={btnGhost}>Cancel</button><button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : label}</button></div>
      </form>
    </Modal>
  );
}

const blank: PoLine = { sku: "", desc: "", poQty: 1, poPrice: 0, outcome: "delivered" };

export function NewPoModal({ onClose }: { onClose: () => void }) {
  const { addPo, clients, canManage, salesmanName } = usePo();
  const [poNo, setPoNo] = useState(""), [clientId, setClientId] = useState(""), [soNo, setSoNo] = useState(""), [poDate, setPoDate] = useState(today()), [reqDate, setReqDate] = useState(today());
  const [keyedBy, setKeyedBy] = useState(canManage ? "" : salesmanName), [salesCode, setSalesCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [lines, setLines] = useState<PoLine[]>([{ ...blank }]);
  const set = (i: number, p: Partial<PoLine>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...p } : l)));
  return (
    <Form title="Key in a customer PO" wide onClose={onClose} label="Save order" submit={() => {
      const e = checkNewPo({ poNo, clientId, poDate, reqDate, lines: lines.map((l) => ({ sku: l.sku, qty: l.poQty, price: l.poPrice })) });
      return e ?? addPo({ poNo, clientId, poDate, reqDate, soNo, keyedBy, salesCode, lines, file });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Customer PO number"><input className={inputCls} value={poNo} onChange={(e) => setPoNo(e.target.value)} /></Field>
        <Field label="Customer"><select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Choose customer</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field>
        <Field label="PO date"><input type="date" className={inputCls} value={poDate} onChange={(e) => setPoDate(e.target.value)} /></Field>
        <Field label="Requested delivery date"><input type="date" className={inputCls} value={reqDate} onChange={(e) => setReqDate(e.target.value)} /></Field>
        <Field label="Sales order number (optional)"><input className={inputCls} value={soNo} onChange={(e) => setSoNo(e.target.value)} /></Field>
        {canManage ? (
          <>
            <Field label="Keyed by"><input className={inputCls} value={keyedBy} onChange={(e) => setKeyedBy(e.target.value)} /></Field>
            <Field label="Salesman code (so the salesman sees it)"><input className={inputCls} value={salesCode} onChange={(e) => setSalesCode(e.target.value)} /></Field>
          </>
        ) : <Field label="Keyed by"><input className={`${inputCls} bg-slate-50`} value={salesmanName || "From your login"} readOnly /></Field>}
      </div>
      <div className="text-sm font-medium text-slate-600">PO lines, as printed on the customer&apos;s PO</div>
      {lines.map((l, i) => (
        <div key={i} className="grid grid-cols-12 items-end gap-2">
          <input aria-label="Item code" placeholder="Item code" className={`${inputCls} col-span-4 sm:col-span-3`} value={l.sku} onChange={(e) => set(i, { sku: e.target.value })} />
          <input aria-label="Description" placeholder="Description" className={`${inputCls} col-span-8 sm:col-span-4`} value={l.desc} onChange={(e) => set(i, { desc: e.target.value })} />
          <input aria-label="Quantity" type="number" min={1} className={`${inputCls} col-span-4 sm:col-span-2`} value={l.poQty} onChange={(e) => set(i, { poQty: Number(e.target.value) })} />
          <input aria-label="Price" type="number" step="0.01" min={0} className={`${inputCls} col-span-6 sm:col-span-2`} value={l.poPrice} onChange={(e) => set(i, { poPrice: Number(e.target.value) })} />
          <button type="button" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} className="col-span-2 mb-1 rounded p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 sm:col-span-1"><Trash2 size={18} /></button>
        </div>
      ))}
      <button type="button" onClick={() => setLines((ls) => [...ls, { ...blank }])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"><Plus size={16} /> Add line</button>
      <Field label="Customer's PO, hard copy (photo or PDF)"><input type="file" accept="image/*,application/pdf" capture="environment" className={inputCls} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <p className="text-sm text-slate-500">{file ? "PO copy will be attached." : "You can attach the PO copy later, but the second check and invoice stay locked until it is attached."}</p>
    </Form>
  );
}

export function CheckModal({ po, onClose }: { po: Po; onClose: () => void }) {
  const { markChecked } = usePo();
  const [who, setWho] = useState("");
  return (
    <Form title="Second check" onClose={onClose} label="Confirm checked" submit={() => markChecked(po.id, who)}>
      <p className="text-sm text-slate-600">Compare the keyed order with the customer&apos;s PO, line by line. It was keyed by {po.salesman}, so someone else must check it.</p>
      <Field label="Checked by"><input className={inputCls} value={who} onChange={(e) => setWho(e.target.value)} /></Field>
    </Form>
  );
}

export function InvoiceModal({ po, onClose }: { po: Po; onClose: () => void }) {
  const { addInvoice, pos } = usePo();
  const { invoices } = useFinance();
  const options = invoices.filter((i) => i.client_id === po.clientId && i.status !== "void" && !pos.some((p) => p.invoiceId === i.id));
  const [invoiceId, setInvoiceId] = useState("");
  const [ls, setLs] = useState(po.lines.map((l) => ({ invQty: l.poQty, invPrice: l.poPrice })));
  const set = (i: number, p: Partial<{ invQty: number; invPrice: number }>) => setLs((a) => a.map((l, k) => (k === i ? { ...l, ...p } : l)));
  return (
    <Form title={`Link invoice to ${po.poNo}`} wide onClose={onClose} label="Link invoice" submit={() => addInvoice(po.id, { invoiceId, lines: ls })}>
      <Field label="Invoice">
        <select className={inputCls} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
          <option value="">{options.length ? "Choose invoice" : "No unlinked invoices for this customer"}</option>
          {options.map((i) => <option key={i.id} value={i.id}>{i.invoice_no} · {i.issue_date}</option>)}
        </select>
      </Field>
      <div className="text-sm font-medium text-slate-600">Quantity and price as printed on the invoice</div>
      {po.lines.map((l, i) => (
        <div key={l.sku + i} className="grid grid-cols-12 items-center gap-2">
          <div className="col-span-12 text-sm text-slate-700 sm:col-span-5"><b>{l.sku}</b> · PO {l.poQty} @ RM {l.poPrice.toFixed(2)}</div>
          <input aria-label={`${l.sku} invoiced quantity`} type="number" min={0} className={`${inputCls} col-span-6 sm:col-span-3`} value={ls[i].invQty} onChange={(e) => set(i, { invQty: Number(e.target.value) })} />
          <input aria-label={`${l.sku} invoiced price`} type="number" step="0.01" min={0} className={`${inputCls} col-span-6 sm:col-span-4`} value={ls[i].invPrice} onChange={(e) => set(i, { invPrice: Number(e.target.value) })} />
        </div>
      ))}
      <p className="text-sm text-slate-500">If a number differs from the PO, it is saved and flagged for you to explain.</p>
    </Form>
  );
}

export function DeliveryModal({ po, onClose }: { po: Po; onClose: () => void }) {
  const { addDelivery } = usePo();
  const [date, setDate] = useState(today()), [driver, setDriver] = useState(""), [route, setRoute] = useState(""), [file, setFile] = useState<File | null>(null);
  const [ls, setLs] = useState(po.lines.map((l) => ({ outcome: "delivered" as Outcome, qty: l.invQty ?? l.poQty, reason: "" })));
  const set = (i: number, p: Partial<(typeof ls)[number]>) => setLs((a) => a.map((l, k) => {
    if (k !== i) return l;
    const n = { ...l, ...p };
    if (p.outcome === "delivered") n.qty = po.lines[i].poQty;
    if (p.outcome === "cancelled" || p.outcome === "dropped") n.qty = 0;
    if (p.qty !== undefined && p.outcome === undefined && p.qty < po.lines[i].poQty && n.outcome === "delivered") n.outcome = "short";
    return n;
  }));
  return (
    <Form title={`Record delivery for ${po.poNo}`} wide onClose={onClose} label="Save delivery" submit={() => {
      if (!date) return "Enter the delivery date.";
      if (date > today()) return "The delivery date cannot be in the future.";
      if (!driver.trim()) return "Enter the driver.";
      const e = checkDeliveryLines(ls.map((l, i) => ({ sku: po.lines[i].sku, poQty: po.lines[i].poQty, ...l })));
      return e ?? addDelivery(po.id, { date, driver, route, lines: ls, file });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Delivered on"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Driver"><input className={inputCls} value={driver} onChange={(e) => setDriver(e.target.value)} /></Field>
        <Field label="Route"><input className={inputCls} value={route} onChange={(e) => setRoute(e.target.value)} /></Field>
      </div>
      <div className="text-sm font-medium text-slate-600">What happened to each item</div>
      {po.lines.map((l, i) => (
        <div key={l.sku + i} className={`rounded-lg border p-3 ${ls[i].outcome === "delivered" ? "border-slate-200" : ls[i].outcome === "cancelled" ? "border-amber-300 bg-amber-50/50" : "border-rose-200 bg-rose-50/40"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2"><span className="font-medium text-slate-900">{l.sku} <span className="font-normal text-slate-500">{l.desc}</span></span><span className="text-sm text-slate-500">Ordered {l.poQty}</span></div>
          <div className="mt-2 grid grid-cols-12 gap-2">
            <select aria-label="Outcome" className={`${inputCls} col-span-12 !mt-0 sm:col-span-6`} value={ls[i].outcome} onChange={(e) => set(i, { outcome: e.target.value as Outcome })}>{OUTCOMES.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}</select>
            <input aria-label={`${l.sku} quantity received`} type="number" min={0} max={l.poQty} disabled={ls[i].outcome === "cancelled" || ls[i].outcome === "dropped"} className={`${inputCls} col-span-5 !mt-0 sm:col-span-2 disabled:bg-slate-100`} value={ls[i].qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} />
            <input aria-label={`${l.sku} reason`} placeholder={ls[i].outcome === "delivered" ? "No reason needed" : "Reason (required)"} disabled={ls[i].outcome === "delivered"} className={`${inputCls} col-span-7 !mt-0 sm:col-span-4 disabled:bg-slate-100`} value={ls[i].reason} onChange={(e) => set(i, { reason: e.target.value })} />
          </div>
          {ls[i].outcome !== "delivered" && <div className="mt-1.5 text-sm text-slate-600">{OUTCOMES.find((o) => o.key === ls[i].outcome)!.counts}</div>}
        </div>
      ))}
      <Field label="Signed delivery copy (photo or PDF, can be added later)"><input type="file" accept="image/*,application/pdf" className={inputCls} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
    </Form>
  );
}

export function ReasonModal({ po, issue, onClose }: { po: Po; issue: { key: string; text: string }; onClose: () => void }) {
  const { addReason } = usePo();
  const [r, setR] = useState("");
  return (
    <Form title="Why did this happen?" onClose={onClose} label="Save reason" submit={() => addReason(po.id, issue.key, r)}>
      <p className="text-sm text-slate-700">{issue.text}</p>
      <Field label="Reason and what was agreed"><textarea rows={3} className={inputCls} value={r} onChange={(e) => setR(e.target.value)} placeholder="Example: Out of stock, balance delivered next Monday." /></Field>
    </Form>
  );
}
