"use client";
import Link from "next/link";
import { useState } from "react";
import { Camera, FileSpreadsheet, FileText, Image as ImageIcon, Paperclip, Plus, Printer, X } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td } from "@/components/ui";
import { Modal, btnGhost, btnPrimary, inputCls } from "@/components/finui";
import { useAuth } from "@/components/auth";
import { exportExcel, GridHead, PrintSheet, useGrid, usePrintA4, type ExcelCol, type GridCol, type PrintCol } from "@/components/grid";
import { EXC_DOC_KINDS, EXC_KINDS, type DeliveryException, type ExcDocKind, type ExcKind } from "@/lib/delivery/rules";
import { addExceptionDocs, excDocLink, logException, resolveException, useDelivery, useDeliverySample, type NewExcDoc, type Result } from "@/lib/delivery/store";

const day = (s: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const COLS: GridCol<DeliveryException>[] = [
  { id: "date", label: "Date", kind: "date", value: (e) => e.at },
  { id: "doc", label: "Invoice", kind: "text", value: (e) => e.docNo },
  { id: "kind", label: "What happened", kind: "pick", value: (e) => e.kind, options: EXC_KINDS.map((k) => ({ code: k, name: k })) },
  { id: "detail", label: "Details", kind: "text", value: (e) => e.detail },
  { id: "note", label: "Credit / debit note", kind: "text", value: (e) => e.noteNo ?? "" },
  { id: "status", label: "Status", kind: "pick", value: (e) => e.status, options: [{ code: "Open", name: "Open" }, { code: "Resolved", name: "Settled" }] },
];
const byId = (a: DeliveryException, b: DeliveryException) => a.id.localeCompare(b.id);

/** Rejected, short, refused to sign, lost document and the like, each tied to an invoice. */
export default function Exceptions() {
  const sample = useDeliverySample();
  const { jobs, exceptions } = useDelivery(sample);
  const { profile } = useAuth();
  const me = profile?.full_name ?? "Warehouse";
  const [tab, setTab] = useState<"Open" | "Resolved" | "All">("Open");
  const [adding, setAdding] = useState(false);
  const [settling, setSettling] = useState<DeliveryException | null>(null);
  const [papers, setPapers] = useState<string | null>(null);
  const [msg, setMsg] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const { pageStyle, print } = usePrintA4();
  const shown = exceptions.filter((e) => tab === "All" || e.status === tab);
  const grid = useGrid(shown, COLS, { id: "date", dir: -1 }, byId);
  const rows = grid.rows;
  const open = exceptions.filter((e) => e.status === "Open").length;

  const excelCols: ExcelCol<DeliveryException>[] = [
    { label: "Date", width: 12, value: (e) => e.at }, { label: "Invoice", width: 14, value: (e) => e.docNo }, { label: "What happened", width: 30, value: (e) => e.kind },
    { label: "Details", width: 50, value: (e) => e.detail }, { label: "Quantity", width: 10, right: true, value: (e) => e.qty ?? "" }, { label: "Credit / debit note", width: 20, value: (e) => e.noteNo ?? "" },
    { label: "Status", width: 10, value: (e) => (e.status === "Open" ? "Open" : "Settled") }, { label: "How settled", width: 40, value: (e) => e.resolution ?? "" }, { label: "Logged by", width: 18, value: (e) => e.by },
    { label: "Documents kept", width: 40, value: (e) => (e.docs ?? []).map((d) => `${d.kind}${d.number ? ` ${d.number}` : ""}`).join(", ") },
  ];
  const printCols: PrintCol<DeliveryException>[] = [
    { label: "Date", cell: (e) => day(e.at) }, { label: "Invoice", cell: (e) => e.docNo }, { label: "What happened", cell: (e) => e.kind }, { label: "Details", cell: (e) => e.detail },
    { label: "Note", cell: (e) => e.noteNo ?? "–" }, { label: "Status", cell: (e) => (e.status === "Open" ? "Open" : "Settled") },
  ];

  return (
    <>
      {pageStyle}
      <div className="no-print">
        <PageHeader title="Delivery exceptions" sub="Goods rejected, short or damaged, customers who refuse to sign, lost documents. Each one is tied to an invoice and ends with a credit note or a new delivery."
          right={<Link href="/logistics/sop#kecuali" className="text-sm text-indigo-600 hover:underline">What to do (SOP)</Link>} />
        {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data, kept in this browser only.</p>}
        <KpiStrip cols="lg:grid-cols-3">
          <Kpi label="Open" value={String(open)} tone={open ? "bad" : "good"} sub="Waiting to be settled" />
          <Kpi label="Settled" value={String(exceptions.length - open)} sub="Credit note or new delivery done" />
          <Kpi label="All logged" value={String(exceptions.length)} sub="In this list" />
        </KpiStrip>
        <Card className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div role="tablist" className="flex gap-1.5">
              {(["Open", "Resolved", "All"] as const).map((t) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md border px-3 py-1.5 text-sm font-medium ${tab === t ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>{t === "Resolved" ? "Settled" : t}</button>)}
            </div>
            <div className="ml-auto flex flex-wrap gap-2">
              <button onClick={() => setAdding(true)} className={`${btnPrimary} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Plus size={16} /> Log an exception</button>
              <button onClick={() => { setBusy(true); void exportExcel(rows, excelCols, "Delivery exceptions.xlsx", "Exceptions").finally(() => setBusy(false)); }} disabled={busy || !rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><FileSpreadsheet size={16} /> Export Excel</button>
              <button onClick={print} disabled={!rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Printer size={16} /> Print A4</button>
            </div>
          </div>
          {msg && <div role={msg.ok ? "status" : "alert"} className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</div>}
          {grid.active.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Showing {plural(rows.length, "exception", "exceptions")} of {shown.length}:</span>
              {grid.active.map((c) => <button key={c.id} onClick={() => grid.setFilter(c.id, {})} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-800 hover:bg-indigo-100">{c.label} <X size={12} /></button>)}
              <button onClick={grid.clearFilters} className="text-indigo-600 hover:underline">Clear all</button>
            </div>
          )}
          <div className="overflow-x-auto pb-24">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr>{COLS.map((c, k) => <GridHead key={c.id} col={c} grid={grid} first={k === 0} />)}<th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Documents</th><th /></tr></thead>
              <tbody>
                {rows.length === 0 && <tr><Td first className="text-slate-500">{tab === "Open" ? "Nothing open." : "No exceptions."}</Td></tr>}
                {rows.map((e) => (
                  <tr key={e.id} className="border-b border-slate-100 align-top hover:bg-slate-50">
                    <Td first className="whitespace-nowrap">{day(e.at)}</Td>
                    <Td className="whitespace-nowrap font-medium text-slate-900">{e.docNo}</Td>
                    <Td>{e.kind}{e.qty ? <div className="text-xs text-slate-500">qty {e.qty}</div> : null}</Td>
                    <Td className="max-w-md !whitespace-normal">{e.detail}{e.resolution && <div className="mt-1 text-xs text-emerald-700">Settled {day(e.resolvedAt ?? "")}: {e.resolution}</div>}</Td>
                    <Td>{e.noteNo ?? <span className="text-slate-300">–</span>}</Td>
                    <Td><Badge tone={e.status === "Open" ? "red" : "green"}>{e.status === "Open" ? "Open" : "Settled"}</Badge></Td>
                    <Td><button onClick={() => setPapers(e.id)} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-sm ${e.docs?.length ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`} title="Credit or debit note, GRN, photos"><Paperclip size={14} />{e.docs?.length ? e.docs.length : "Add"}</button></Td>
                    <Td>{e.status === "Open" && <button onClick={() => setSettling(e)} className="rounded-md border border-slate-300 px-2.5 py-1 text-sm hover:bg-slate-100">Settle</button>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {adding && <AddModal sample={sample} docs={jobs.map((j) => j.docNo)} me={me} onClose={() => setAdding(false)} onDone={(r) => { setMsg(r); setAdding(false); }} />}
      {papers && exceptions.find((e) => e.id === papers) && <DocsModal sample={sample} ex={exceptions.find((e) => e.id === papers)!} me={me} onClose={() => setPapers(null)} onDone={(r) => setMsg(r)} />}
      {settling && <SettleModal sample={sample} ex={settling} me={me} onClose={() => setSettling(null)} onDone={(r) => { setMsg(r); setSettling(null); }} />}
      <PrintSheet title="Delivery exceptions" rows={rows} cols={printCols} rowKey={(e) => e.id} size="9pt" lines={[`Printed ${day(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()))}`, [tab === "All" ? "" : tab === "Open" ? "Open only" : "Settled only", grid.describe()].filter(Boolean).join(" · ")]} />
    </>
  );
}

function AddModal({ sample, docs, me, onClose, onDone }: { sample: boolean; docs: string[]; me: string; onClose: () => void; onDone: (r: Result) => void }) {
  const [doc, setDoc] = useState(""); const [kind, setKind] = useState<ExcKind>(EXC_KINDS[0]); const [detail, setDetail] = useState(""); const [qty, setQty] = useState(""); const [note, setNote] = useState(""); const [err, setErr] = useState("");
  const [files, setFiles] = useState<NewExcDoc[]>([]); const [busy, setBusy] = useState(false);
  return (
    <Modal title="Log an exception" onClose={onClose}>
      <label className="block text-sm font-medium text-slate-700">Invoice<input list="exc-docs" className={inputCls} value={doc} onChange={(e) => setDoc(e.target.value.toUpperCase())} placeholder="Start typing the invoice number" /></label>
      <datalist id="exc-docs">{docs.map((d) => <option key={d} value={d} />)}</datalist>
      <label className="mt-3 block text-sm font-medium text-slate-700">What happened<select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as ExcKind)}>{EXC_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>
      <label className="mt-3 block text-sm font-medium text-slate-700">Details<textarea rows={3} className={inputCls} value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Item, quantity, who said what, what the driver did" /></label>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Quantity (optional)<input inputMode="decimal" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} /></label>
        <label className="text-sm font-medium text-slate-700">Credit / debit note (optional)<input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      </div>
      <DocsPicker docs={files} setDocs={setFiles} />
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button disabled={busy} onClick={async () => { setBusy(true); const r = await logException(sample, doc.trim(), kind, detail, qty.trim() && Number.isFinite(Number(qty)) ? Number(qty) : undefined, note, me, files); setBusy(false); if (r.ok) onDone(r); else setErr(r.text); }} className={btnPrimary}>{busy ? "Saving…" : "Save"}</button></div>
    </Modal>
  );
}
function SettleModal({ sample, ex, me, onClose, onDone }: { sample: boolean; ex: DeliveryException; me: string; onClose: () => void; onDone: (r: Result) => void }) {
  const [res, setRes] = useState(""); const [note, setNote] = useState(ex.noteNo ?? ""); const [err, setErr] = useState("");
  const [docs, setDocs] = useState<NewExcDoc[]>([]); const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Settle ${ex.docNo}`} onClose={onClose}>
      <p className="text-sm text-slate-600">{ex.kind}: {ex.detail}</p>
      <label className="mt-3 block text-sm font-medium text-slate-700">How was it settled?<textarea rows={3} className={inputCls} value={res} onChange={(e) => setRes(e.target.value)} placeholder="For example: credit note raised and stamped copy received" autoFocus /></label>
      <label className="mt-3 block text-sm font-medium text-slate-700">Credit / debit note number (optional)<input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <DocsPicker docs={docs} setDocs={setDocs} hint="For example the stamped credit note, the GRN, or the debit note." />
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button disabled={busy} onClick={async () => {
        setBusy(true);
        if (docs.length) { const d = await addExceptionDocs(sample, ex.id, docs, me); if (!d.ok) { setBusy(false); setErr(d.text); return; } }
        const r = await resolveException(sample, ex.id, res, note); setBusy(false);
        if (r.ok) onDone(docs.length ? { ok: true, text: `Marked as settled, with ${docs.length} ${docs.length === 1 ? "document" : "documents"}.` } : r); else setErr(r.text);
      }} className={btnPrimary}>{busy ? "Saving…" : "Mark settled"}</button></div>
    </Modal>
  );
}

const isImg = (name: string) => /\.(jpe?g|png|heic|webp|gif)$/i.test(name);
/** Choose photos or scans to keep, and say what each one is. */
function DocsPicker({ docs, setDocs, hint = "For example a photo of the damaged goods, the credit or debit note, or the GRN." }: { docs: NewExcDoc[]; setDocs: (d: NewExcDoc[]) => void; hint?: string }) {
  const pick = (list: FileList | null) => {
    if (!list?.length) return;
    setDocs([...docs, ...[...list].map((file): NewExcDoc => ({ kind: file.type.startsWith("image/") ? "Photo" : "Credit note", number: "", file }))]);
  };
  const set = (i: number, p: Partial<NewExcDoc>) => setDocs(docs.map((d, k) => (k === i ? { ...d, ...p } : d)));
  return (
    <div className="mt-4 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="text-sm font-medium text-slate-700">Supporting documents</div><div className="text-xs text-slate-500">{hint}</div></div>
        <div className="flex gap-2">
          <label className={`${btnGhost} inline-flex cursor-pointer items-center gap-1.5 !px-2.5 !py-1 !text-sm`}><Camera size={15} /> Take photo<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} /></label>
          <label className={`${btnGhost} inline-flex cursor-pointer items-center gap-1.5 !px-2.5 !py-1 !text-sm`}><Paperclip size={15} /> Choose files<input type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} /></label>
        </div>
      </div>
      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((d, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 rounded-md bg-slate-50 px-2 py-1.5 text-sm">
              {isImg(d.file.name) ? <ImageIcon size={16} className="text-slate-500" /> : <FileText size={16} className="text-slate-500" />}
              <span className="min-w-0 flex-1 truncate" title={d.file.name}>{d.file.name}</span>
              <select value={d.kind} onChange={(e) => set(i, { kind: e.target.value as ExcDocKind })} className="rounded border border-slate-300 bg-white px-1.5 py-1 text-sm" aria-label={`What ${d.file.name} is`}>{EXC_DOC_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              {(d.kind === "Credit note" || d.kind === "Debit note" || d.kind === "GRN") && <input value={d.number} onChange={(e) => set(i, { number: e.target.value })} placeholder={`${d.kind} no.`} className="w-32 rounded border border-slate-300 px-1.5 py-1 text-sm" aria-label={`${d.kind} number`} />}
              <button onClick={() => setDocs(docs.filter((_, k) => k !== i))} className="text-slate-400 hover:text-rose-600" aria-label={`Remove ${d.file.name}`}><X size={15} /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The papers kept with one exception: open them, or add more (also after it is settled). */
function DocsModal({ sample, ex, me, onClose, onDone }: { sample: boolean; ex: DeliveryException; me: string; onClose: () => void; onDone: (r: Result) => void }) {
  const [docs, setDocs] = useState<NewExcDoc[]>([]); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const kept = ex.docs ?? [];
  return (
    <Modal title={`Documents for ${ex.docNo}`} onClose={onClose}>
      <p className="text-sm text-slate-600">{ex.kind}: {ex.detail}</p>
      {kept.length ? (
        <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {kept.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
              {isImg(d.file) ? <ImageIcon size={16} className="text-slate-500" /> : <FileText size={16} className="text-slate-500" />}
              <span className="font-medium text-slate-900">{d.kind}{d.number ? ` ${d.number}` : ""}</span>
              <span className="min-w-0 flex-1 truncate text-slate-500">{d.file} · {d.by}, {d.at}</span>
              {d.path && !sample
                ? <button onClick={async () => { const u = await excDocLink(d.path!); if (u) window.open(u, "_blank", "noopener"); else setErr("The file could not be opened."); }} className="text-indigo-700 hover:underline">Open</button>
                : <span className="text-xs text-slate-400">{sample ? "Opens in the app" : ""}</span>}
            </li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-slate-500">No documents kept yet.</p>}
      <DocsPicker docs={docs} setDocs={setDocs} />
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Close</button><button disabled={busy || !docs.length} onClick={async () => { setBusy(true); const r = await addExceptionDocs(sample, ex.id, docs, me); setBusy(false); if (r.ok) { onDone(r); setDocs([]); setErr(""); } else setErr(r.text); }} className={btnPrimary}>{busy ? "Saving…" : `Keep ${docs.length || ""} ${docs.length === 1 ? "document" : "documents"}`}</button></div>
    </Modal>
  );
}
