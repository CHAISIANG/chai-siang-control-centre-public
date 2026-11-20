"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { FileSpreadsheet, Plus, Printer, X } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td } from "@/components/ui";
import { Modal, btnGhost, btnPrimary, inputCls } from "@/components/finui";
import { useAuth } from "@/components/auth";
import { exportExcel, GridHead, PrintSheet, useGrid, usePrintA4, type ExcelCol, type GridCol, type PrintCol } from "@/components/grid";
import { CAUSES, DECISIONS, type Cause, type DamagedItem, type Decision } from "@/lib/delivery/rules";
import { decideDamaged, logDamaged, useDelivery, useDeliverySample, type Result } from "@/lib/delivery/store";

const day = (s?: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const COLS: GridCol<DamagedItem>[] = [
  { id: "date", label: "Found on", kind: "date", value: (d) => d.foundOn },
  { id: "item", label: "Item", kind: "text", value: (d) => `${d.itemCode} ${d.description}` },
  { id: "qty", label: "Quantity", kind: "num", right: true, value: (d) => d.qty },
  { id: "cause", label: "Cause", kind: "pick", value: (d) => d.cause, options: CAUSES.map((c) => ({ code: c, name: c })) },
  { id: "decision", label: "Decision", kind: "pick", value: (d) => d.decision ?? "Pending", options: [{ code: "Pending", name: "Waiting for a decision" }, ...DECISIONS.map((x) => ({ code: x, name: x }))] },
];
const byId = (a: DamagedItem, b: DamagedItem) => a.id.localeCompare(b.id);

/** Damaged or leaking stock found in the warehouse: it sits in Zone F until someone decides what happens to it. */
export default function Damaged() {
  const sample = useDeliverySample();
  const { damaged } = useDelivery(sample);
  const { profile } = useAuth();
  const me = profile?.full_name ?? "Warehouse";
  const [tab, setTab] = useState<"Pending" | "Decided" | "All">("Pending");
  const [adding, setAdding] = useState(false);
  const [deciding, setDeciding] = useState<DamagedItem | null>(null);
  const [msg, setMsg] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { pageStyle, print } = usePrintA4();
  const shown = damaged.filter((d) => tab === "All" || (tab === "Pending" ? !d.decision : !!d.decision));
  const grid = useGrid(shown, COLS, { id: "date", dir: -1 }, byId);
  const rows = grid.rows;
  const pending = damaged.filter((d) => !d.decision);

  const excelCols: ExcelCol<DamagedItem>[] = [
    { label: "Found on", width: 12, value: (d) => d.foundOn }, { label: "Item code", width: 18, value: (d) => d.itemCode }, { label: "Description", width: 34, value: (d) => d.description },
    { label: "Quantity", width: 10, right: true, total: true, value: (d) => d.qty }, { label: "Unit", width: 10, value: (d) => d.uom }, { label: "Zone", width: 6, value: (d) => d.zone },
    { label: "Cause", width: 12, value: (d) => d.cause }, { label: "Photo", width: 20, value: (d) => d.photo ?? "" }, { label: "Decision", width: 20, value: (d) => d.decision ?? "Pending" },
    { label: "Decided by", width: 18, value: (d) => d.decidedBy ?? "" }, { label: "Reason / note", width: 40, value: (d) => d.note ?? "" }, { label: "Logged by", width: 18, value: (d) => d.by },
  ];
  const printCols: PrintCol<DamagedItem>[] = [
    { label: "Found on", cell: (d) => day(d.foundOn) }, { label: "Item", cell: (d) => `${d.itemCode} ${d.description}` }, { label: "Qty", right: true, cell: (d) => `${d.qty} ${d.uom}` },
    { label: "Cause", cell: (d) => d.cause }, { label: "Decision", cell: (d) => d.decision ?? "Pending" }, { label: "Decided by", cell: (d) => d.decidedBy ?? "–" },
  ];

  return (
    <>
      {pageStyle}
      <div className="no-print">
        <PageHeader title="Damaged stock" sub="Damaged or leaking stock found in the warehouse. It stays in Zone F, never back on a shelf or on a delivery, until someone decides: return, claim, rework or write-off."
          right={<Link href="/logistics/sop#rosak" className="text-sm text-indigo-600 hover:underline">What to do (SOP)</Link>} />
        {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data, kept in this browser only.</p>}
        <KpiStrip cols="lg:grid-cols-3">
          <Kpi label="In Zone F, waiting" value={String(pending.length)} tone={pending.length ? "warn" : "good"} sub="No decision yet" />
          <Kpi label="Decided" value={String(damaged.length - pending.length)} sub="Return, claim, rework or write-off" />
          <Kpi label="Written off" value={String(damaged.filter((d) => d.decision === "Write-off").length)} sub="Needs a written reason" />
        </KpiStrip>
        <Card className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div role="tablist" className="flex gap-1.5">
              {(["Pending", "Decided", "All"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md border px-3 py-1.5 text-sm font-medium ${tab === t ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>{t === "Pending" ? "Waiting" : t}</button>)}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button onClick={() => setAdding(true)} className={`${btnPrimary} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Plus size={16} /> Log damaged stock</button>
              <button onClick={() => { setBusy(true); void exportExcel(rows, excelCols, "Damaged stock.xlsx", "Damaged stock", `Total (${rows.length} entries)`).finally(() => setBusy(false)); }} disabled={busy || !rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><FileSpreadsheet size={16} /> Export Excel</button>
              <button onClick={print} disabled={!rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Printer size={16} /> Print A4</button>
            </div>
          </div>
          {msg && <div role={msg.ok ? "status" : "alert"} className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</div>}
          {grid.active.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Showing {plural(rows.length, "entry", "entries")} of {shown.length}:</span>
              {grid.active.map((c) => <button key={c.id} onClick={() => grid.setFilter(c.id, {})} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-800 hover:bg-indigo-100">{c.label} <X size={12} /></button>)}
              <button onClick={grid.clearFilters} className="text-indigo-600 hover:underline">Clear all</button>
            </div>
          )}
          <div className="overflow-x-auto pb-24">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr>{COLS.map((c, k) => <GridHead key={c.id} col={c} grid={grid} first={k === 0} />)}<th /></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><Td first className="text-slate-500">{tab === "Pending" ? "Nothing waiting in Zone F." : "No entries."}</Td></tr>}
                {rows.map((d) => (
                  <tr key={d.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                    <Td first className="whitespace-nowrap">{day(d.foundOn)}</Td>
                    <Td><span className="font-medium text-slate-900">{d.itemCode}</span><div className="text-sm text-slate-600">{d.description}</div>{d.photo && <div className="text-xs text-slate-500">photo: {d.photo}</div>}</Td>
                    <Td right>{d.qty} {d.uom}</Td>
                    <Td><Badge tone={d.cause === "Leaking" ? "red" : "amber"}>{d.cause}</Badge></Td>
                    <Td>{d.decision ? <><Badge tone={d.decision === "Write-off" ? "red" : "green"}>{d.decision}</Badge><div className="mt-0.5 text-xs text-slate-500">{d.decidedBy}, {day(d.decidedOn)}{d.note ? `: ${d.note}` : ""}</div></> : <Badge tone="grey">Waiting for a decision</Badge>}</Td>
                    <Td>{!d.decision && <button onClick={() => setDeciding(d)} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100">Decide</button>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {adding && <AddModal sample={sample} me={me} onClose={() => setAdding(false)} onDone={(r) => { setMsg(r); setAdding(false); }} />}
      {deciding && <DecideModal sample={sample} item={deciding} me={me} onClose={() => setDeciding(null)} onDone={(r) => { setMsg(r); setDeciding(null); }} />}
      <PrintSheet title="Damaged stock" rows={rows} cols={printCols} rowKey={(d) => d.id} size="9pt" lines={[`Printed ${day(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()))}`, [tab === "All" ? "" : tab === "Pending" ? "Waiting for a decision" : "Decided", grid.describe()].filter(Boolean).join(" · ")]} />
    </>
  );
}

function AddModal({ sample, me, onClose, onDone }: { sample: boolean; me: string; onClose: () => void; onDone: (r: Result) => void }) {
  const [code, setCode] = useState(""); const [desc, setDesc] = useState(""); const [qty, setQty] = useState(""); const [uom, setUom] = useState("Carton"); const [cause, setCause] = useState<Cause>("Crushed"); const [err, setErr] = useState("");
  const photo = useRef<HTMLInputElement>(null);
  return (
    <Modal title="Log damaged stock" onClose={onClose}>
      <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">Move it to Zone F first and label it (date, item, quantity, cause). Never put it back on a shelf.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Item code<input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} autoFocus /></label>
        <label className="text-sm font-medium text-slate-700">Description<input className={inputCls} value={desc} onChange={(e) => setDesc(e.target.value)} /></label>
        <label className="text-sm font-medium text-slate-700">Quantity<input inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="text-sm font-medium text-slate-700">Unit<select className={inputCls} value={uom} onChange={(e) => setUom(e.target.value)}><option>Carton</option><option>Pack</option><option>Pallet</option></select></label>
      </div>
      <label className="mt-3 block text-sm font-medium text-slate-700">Cause<select className={inputCls} value={cause} onChange={(e) => setCause(e.target.value as Cause)}>{CAUSES.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className="mt-3 block text-sm font-medium text-slate-700">Photo (optional)<input ref={photo} type="file" accept="image/*" capture="environment" className={`${inputCls} !py-1.5`} /></label>
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={async () => { const r = await logDamaged(sample, { itemCode: code, description: desc, qty: Number(qty), uom, cause, photo: photo.current?.files?.[0] }, me); if (r.ok) onDone(r); else setErr(r.text); }} className={btnPrimary}>Save</button></div>
    </Modal>
  );
}
function DecideModal({ sample, item, me, onClose, onDone }: { sample: boolean; item: DamagedItem; me: string; onClose: () => void; onDone: (r: Result) => void }) {
  const [dec, setDec] = useState<Decision>("Return to principal"); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  return (
    <Modal title={`Decide: ${item.itemCode}`} onClose={onClose}>
      <p className="text-sm text-slate-600">{item.qty} {item.uom} of {item.description || item.itemCode}, {item.cause.toLowerCase()}.</p>
      <label className="mt-3 block text-sm font-medium text-slate-700">Decision<select className={inputCls} value={dec} onChange={(e) => setDec(e.target.value as Decision)}>{DECISIONS.map((d) => <option key={d}>{d}</option>)}</select></label>
      <label className="mt-3 block text-sm font-medium text-slate-700">{dec === "Write-off" ? "Reason (required for a write-off)" : "Note (optional)"}<textarea rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      {dec === "Write-off" && <p className="mt-2 text-xs text-slate-500">A write-off needs approval: <mark className="rounded bg-amber-100 px-1 text-amber-900">who approves and the amount limit are still to be confirmed</mark>. Your name is recorded as the approver.</p>}
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={async () => { const r = await decideDamaged(sample, item.id, dec, me, note); if (r.ok) onDone(r); else setErr(r.text); }} className={btnPrimary}>Save decision</button></div>
    </Modal>
  );
}
