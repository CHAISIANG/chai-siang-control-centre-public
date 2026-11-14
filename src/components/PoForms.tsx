"use client";
import { useState, type FormEvent, type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { btnGhost, btnPrimary, Field, inputCls, Modal } from "./finui";
import { usePo } from "./po";
import { useFinance } from "./finance";
import { checkDeliveryLines, OUTCOMES, rmFmt, today, type Outcome, type Po } from "@/lib/po";
import { checkInvoiceLink, checkNewPo, compareLines, resolveLine, type DraftLine } from "@/lib/pounits";
import { buildInvoiceDraft, buildPoDraft, invSum, matchCustomer, poSum, totalCheck, type Cell } from "@/lib/poread";
import { readDocument } from "@/lib/poreadClient";

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


type Note = { level: "check" | "missing" | "ok"; text: string };
const cellNote = (label: string, c: Cell): Note[] => (c.status === "read" ? [] : [{ level: c.status, text: `${label}: ${c.note ?? (c.status === "missing" ? "not found." : "check it.")}` }]);

function ReadPanel({ busy, error, notes, onRead, label, canRead }: { busy: boolean; error: string | null; notes: Note[] | null; onRead: () => void; label: string; canRead: boolean }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onRead} disabled={!canRead || busy} className={`${btnGhost} ${!canRead ? "opacity-60" : ""}`}>{busy ? "Reading…" : label}</button>
        <span className="text-sm text-slate-500">{canRead ? "Fills the form from the file. You check it before saving." : "Choose the file first."}</span>
      </div>
      {error && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      {notes && (
        <div role="status" className="space-y-1 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
          <div className="font-medium text-slate-700">Read from the file. Anything marked below needs your check.</div>
          {notes.map((n, i) => <div key={i} className={n.level === "ok" ? "text-emerald-700" : n.level === "check" ? "text-amber-800" : "text-rose-700"}>{n.level === "ok" ? "✓ " : n.level === "check" ? "! " : "✗ "}{n.text}</div>)}
        </div>
      )}
    </div>
  );
}

export function NewPoModal({ onClose }: { onClose: () => void }) {
  const { addPo, clients, itemCodes, canManage, salesmanName } = usePo();
  const [poNo, setPoNo] = useState(""), [clientId, setClientId] = useState(""), [soNo, setSoNo] = useState(""), [poDate, setPoDate] = useState(today()), [winFrom, setWinFrom] = useState(today()), [winTo, setWinTo] = useState(today());
  const [keyedBy, setKeyedBy] = useState(canManage ? "" : salesmanName), [salesCode, setSalesCode] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<DraftLine[]>([{ code: "", qty: 1, unit: "cartons", unitPrice: 0 }]);
  const [reading, setReading] = useState(false), [readErr, setReadErr] = useState<string | null>(null), [notes, setNotes] = useState<Note[] | null>(null);
  async function readPo() {
    if (!file) return;
    setReading(true); setReadErr(null); setNotes(null);
    const r = await readDocument("po", file);
    setReading(false);
    if (!r.ok) { setReadErr(r.error); return; }
    const customers = clients.map((c) => ({ id: c.id, name: c.company_name }));
    const cid = matchCustomer(r.data.customerName, customers).id ?? clientId;
    const d = buildPoDraft(r.data, customers, itemCodes.filter((m) => m.clientId === cid));
    if (d.poNo.value) setPoNo(d.poNo.value);
    if (d.customer.id) setClientId(d.customer.id);
    if (d.poDate.value) setPoDate(d.poDate.value);
    if (d.winFrom.value) setWinFrom(d.winFrom.value);
    if (d.winTo.value) setWinTo(d.winTo.value);
    if (d.lines.length) setRows(d.lines.map((l) => ({ code: l.code, qty: l.qty, unit: l.unit, unitPrice: l.price })));
    const tc = totalCheck("PO", d.docTotal, poSum(d.lines), d.lines.length);
    setNotes([
      ...cellNote("PO number", d.poNo), ...cellNote("Customer", d.customer), ...cellNote("PO date", d.poDate), ...cellNote("Delivery window from", d.winFrom), ...cellNote("Delivery window to", d.winTo),
      ...d.lines.flatMap((l, i) => (l.status === "read" ? [] : [{ level: l.status, text: `Line ${i + 1}: ${l.note ?? "check it."}` } as Note])),
      { level: tc.ok ? "ok" : "check", text: tc.text },
    ]);
  }
  const map = itemCodes.filter((m) => m.clientId === clientId);
  const set = (i: number, p: Partial<DraftLine>) => setRows((a) => a.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const calc = rows.map((r) => ({ r, ...resolveLine(map, r) }));
  const total = calc.reduce((s, c) => s + c.amount, 0);
  return (
    <Form title="Key in a customer PO" wide onClose={onClose} label="Save order" submit={() => {
      const e = checkNewPo({ poNo, clientId, poDate, winFrom, winTo, draft: rows }, map);
      return e ?? addPo({ poNo, clientId, poDate, winFrom, winTo, soNo, keyedBy, salesCode, draft: rows, file });
    }}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Customer PO number"><input className={inputCls} value={poNo} onChange={(e) => setPoNo(e.target.value)} /></Field>
        <Field label="Customer"><select className={inputCls} value={clientId} onChange={(e) => setClientId(e.target.value)}><option value="">Choose customer</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field>
        <Field label="PO date"><input type="date" className={inputCls} value={poDate} onChange={(e) => setPoDate(e.target.value)} /></Field>
        <Field label="Sales order number (optional)"><input className={inputCls} value={soNo} onChange={(e) => setSoNo(e.target.value)} /></Field>
        <Field label="Delivery window from"><input type="date" className={inputCls} value={winFrom} onChange={(e) => setWinFrom(e.target.value)} /></Field>
        <Field label="Delivery window to"><input type="date" className={inputCls} value={winTo} onChange={(e) => setWinTo(e.target.value)} /></Field>
        {canManage ? (
          <>
            <Field label="Keyed by"><input className={inputCls} value={keyedBy} onChange={(e) => setKeyedBy(e.target.value)} /></Field>
            <Field label="Salesman code (so the salesman sees it)"><input className={inputCls} value={salesCode} onChange={(e) => setSalesCode(e.target.value)} /></Field>
          </>
        ) : <Field label="Keyed by"><input className={`${inputCls} bg-slate-50`} value={salesmanName || "From your login"} readOnly /></Field>}
      </div>
      <div className="text-sm font-medium text-slate-600">PO lines: type the customer&apos;s own item code, as printed on their PO</div>
      {clientId && map.length === 0 && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">This customer has no item codes yet. Ask Finance to add them under PO &amp; delivery → Item codes.</p>}
      {calc.map((c, i) => (
        <div key={i} className="rounded-lg border border-slate-200 p-2">
          <div className="grid grid-cols-12 items-center gap-2">
            <input aria-label="Customer item code" placeholder="Their code" className={`${inputCls} col-span-5 !mt-0 sm:col-span-2`} value={c.r.code} onChange={(e) => set(i, { code: e.target.value })} />
            <input aria-label="Quantity" type="number" min={1} className={`${inputCls} col-span-3 !mt-0 sm:col-span-2`} value={c.r.qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} />
            <select aria-label="Unit" className={`${inputCls} col-span-4 !mt-0 sm:col-span-2`} value={c.r.unit} onChange={(e) => set(i, { unit: e.target.value as DraftLine["unit"] })}><option value="units">Units</option><option value="cartons">Cartons</option></select>
            <input aria-label="Price as on the PO" type="number" step="0.01" min={0} className={`${inputCls} col-span-6 !mt-0 sm:col-span-2`} value={c.r.unitPrice} onChange={(e) => set(i, { unitPrice: Number(e.target.value) })} />
            <div className="col-span-5 text-[15px] sm:col-span-3">{c.map ? <><b>{Number.isInteger(c.cartons) ? c.cartons : c.cartons.toFixed(2)} cartons</b> of {c.map.ourCode}</> : c.r.code ? <span className="text-rose-700">Not in the list</span> : null}</div>
            <button type="button" aria-label="Remove line" disabled={rows.length === 1} onClick={() => setRows((a) => a.filter((_, k) => k !== i))} className="col-span-1 rounded p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"><Trash2 size={18} /></button>
          </div>
          {c.map && <div className="mt-1 pl-1 text-sm text-slate-500">{c.map.desc} · {c.map.pack} per carton · agreed {rmFmt(c.map.ctnPrice)} per carton</div>}
          {c.map && !c.wholeCartons && <div className="mt-1 pl-1 text-sm text-amber-700">Not a whole number of cartons. Check the quantity with the customer.</div>}
          {c.map && !c.priceOk && <div className="mt-1 pl-1 text-sm text-rose-700">Price differs from the agreed price. Confirm it with the customer, or update the item list.</div>}
        </div>
      ))}
      <button type="button" onClick={() => setRows((a) => [...a, { code: "", qty: 1, unit: "cartons", unitPrice: 0 }])} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"><Plus size={16} /> Add line</button>
      <div className="text-slate-600">PO total <b className="text-slate-900">{rmFmt(total)}</b></div>
      <Field label="Customer's PO, hard copy (photo or PDF)"><input type="file" accept="image/*,application/pdf" capture="environment" className={inputCls} onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></Field>
      <p className="text-sm text-slate-500">{file ? "PO copy will be attached." : "You can attach the PO copy later, but the second check and invoice stay locked until it is attached."}</p>
      <ReadPanel busy={reading} error={readErr} notes={notes} onRead={readPo} label="Read the PO" canRead={!!file} />
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
  const [mode, setMode] = useState<"printed" | "finance">("printed");
  const [no, setNo] = useState(""), [date, setDate] = useState(today()), [invoiceId, setInvoiceId] = useState(""), [scan, setScan] = useState<File | null>(null);
  const [ls, setLs] = useState(po.lines.map((l) => ({ invQty: l.poQty, invPrice: l.poPrice })));
  const set = (i: number, p: Partial<{ invQty: number; invPrice: number }>) => setLs((a) => a.map((l, k) => (k === i ? { ...l, ...p } : l)));
  const { itemCodes } = usePo();
  const [reading, setReading] = useState(false), [readErr, setReadErr] = useState<string | null>(null), [notes, setNotes] = useState<Note[] | null>(null);
  async function readInvoice() {
    if (!scan) return;
    setReading(true); setReadErr(null); setNotes(null);
    const r = await readDocument("invoice", scan);
    setReading(false);
    if (!r.ok) { setReadErr(r.error); return; }
    const d = buildInvoiceDraft(r.data, { poNo: po.poNo, lines: po.lines.map((l) => ({ sku: l.sku, desc: l.desc, cartons: l.poQty, ctnPrice: l.poPrice })) }, itemCodes.filter((m) => m.clientId === po.clientId));
    setMode("printed");
    if (d.invoiceNo.value) setNo(d.invoiceNo.value);
    if (d.invoiceDate.value) setDate(d.invoiceDate.value);
    setLs(d.lines.map((l) => ({ invQty: l.cartons, invPrice: l.ctnPrice })));
    const tc = totalCheck("invoice", d.docTotal, invSum(d.lines), d.lines.length);
    setNotes([
      ...cellNote("Invoice number", d.invoiceNo), ...cellNote("Invoice date", d.invoiceDate),
      d.poRef.matches ? { level: "ok", text: "The invoice names the same PO as the one you are linking." } as Note : { level: d.poRef.status === "missing" ? "missing" : "check", text: `PO number on the invoice: ${d.poRef.note ?? "check it."}` } as Note,
      ...d.lines.flatMap((l, i) => (l.status === "read" ? [] : [{ level: l.status, text: `Line ${i + 1} (${l.sku}): ${l.note ?? "check it."}` } as Note])),
      ...(d.extras.length ? [{ level: "check", text: `The invoice has items that are not on the PO: ${d.extras.join(", ")}.` } as Note] : []),
      { level: tc.ok ? "ok" : "check", text: tc.text },
    ]);
  }
  const cmp = compareLines(po.lines.map((l) => ({ cartons: l.poQty, ctnPrice: l.poPrice })), ls.map((l) => ({ cartons: l.invQty, ctnPrice: l.invPrice })));
  return (
    <Form title={`Link invoice to ${po.poNo}`} wide onClose={onClose} label="Link invoice" submit={() => {
      if (mode === "printed") {
        const e = checkInvoiceLink(pos.filter((p) => p.id !== po.id && p.invoiceNo).map((p) => p.invoiceNo!), po.poDate, po.lines.length, { no, date, lines: ls.map((l) => ({ cartons: l.invQty, ctnPrice: l.invPrice })) });
        if (e) return e;
      }
      return addInvoice(po.id, { invoiceId: mode === "finance" ? invoiceId : "", extNo: mode === "printed" ? no : "", extDate: mode === "printed" ? date : "", lines: ls, scan });
    }}>
      <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
        {([["printed", "Type the printed number"], ["finance", "Choose a Finance invoice"]] as const).map(([k, l]) => <button type="button" key={k} onClick={() => setMode(k)} className={`rounded px-3 py-1 ${mode === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l}</button>)}
      </div>
      {mode === "printed" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Invoice number, as printed"><input className={inputCls} value={no} onChange={(e) => setNo(e.target.value)} /></Field>
          <Field label="Invoice date"><input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        </div>
      ) : (
        <Field label="Invoice">
          <select className={inputCls} value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
            <option value="">{options.length ? "Choose invoice" : "No unlinked invoices for this customer"}</option>
            {options.map((i) => <option key={i.id} value={i.id}>{i.invoice_no} · {i.issue_date}</option>)}
          </select>
        </Field>
      )}
      <Field label="Scan of the invoice (photo or PDF)"><input type="file" accept="image/*,application/pdf" className={inputCls} onChange={(e) => setScan(e.target.files?.[0] ?? null)} /></Field>
      <ReadPanel busy={reading} error={readErr} notes={notes} onRead={readInvoice} label="Read the invoice" canRead={!!scan} />
      <div className="text-sm font-medium text-slate-600">Cartons and price per carton as printed on the invoice</div>
      {po.lines.map((l, i) => {
        const d = cmp.diffs[i];
        return (
          <div key={l.sku + i} className="grid grid-cols-12 items-center gap-2">
            <div className="col-span-12 text-sm text-slate-700 sm:col-span-5"><b>{l.sku}</b> · PO {l.poQty} cartons @ {rmFmt(l.poPrice)}</div>
            <input aria-label={`${l.sku} invoiced cartons`} type="number" min={0} className={`${inputCls} col-span-5 !mt-0 sm:col-span-2 ${d.some((x) => x.kind !== "price") ? "border-rose-300 bg-rose-50" : ""}`} value={ls[i].invQty} onChange={(e) => set(i, { invQty: Number(e.target.value) })} />
            <input aria-label={`${l.sku} invoiced price`} type="number" step="0.01" min={0} className={`${inputCls} col-span-7 !mt-0 sm:col-span-3 ${d.some((x) => x.kind === "price") ? "border-rose-300 bg-rose-50" : ""}`} value={ls[i].invPrice} onChange={(e) => set(i, { invPrice: Number(e.target.value) })} />
            <div className="col-span-12 text-sm sm:col-span-2">{d.length === 0 ? <span className="text-emerald-700">Matches</span> : <span className="text-rose-700">{d.map((x) => x.text).join("; ")}</span>}</div>
          </div>
        );
      })}
      <p className="text-sm text-slate-600">PO {rmFmt(cmp.poTotal)} · invoice {rmFmt(cmp.invTotal)}{cmp.invTotal !== cmp.poTotal && <span className="text-rose-700"> · {rmFmt(Math.abs(cmp.poTotal - cmp.invTotal))} {cmp.invTotal < cmp.poTotal ? "less" : "more"} than the PO</span>}. Differences are saved and flagged for you to explain.</p>
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
