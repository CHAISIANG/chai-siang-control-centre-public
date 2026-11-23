"use client";
import { canLoad, useFleet, warnings } from "@/lib/fleet";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { FileSpreadsheet, Printer, Upload, X } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td } from "@/components/ui";
import { Modal, btnGhost, btnPrimary, inputCls } from "@/components/finui";
import { useAuth } from "@/components/auth";
import { exportExcel, GridHead, PrintSheet, useGrid, usePrintA4, type ExcelCol, type GridCol, type PrintCol } from "@/components/grid";
import { STATUSES, STATUS_HELP, statusTone, vehicleText, type DeliveryJob, type Status, type Vehicle } from "@/lib/delivery/rules";
import { attachPods, markDelivered, markFailed, markLoaded, markPicked, podLink, replan, resetDelivery, setDocCase, useDelivery, useDeliverySample, type Result } from "@/lib/delivery/store";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string) => (s ? new Date(`${s.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;
const byDoc = (a: DeliveryJob, b: DeliveryJob) => a.docNo.localeCompare(b.docNo, "en", { numeric: true });
const TABS: ("All" | Status)[] = ["All", ...STATUSES];
const caseText = (j: DeliveryJob) => (j.docCase === "DO" ? "With DO" : "No DO");

const COLS: GridCol<DeliveryJob>[] = [
  { id: "doc", label: "Invoice", kind: "text", value: (j) => j.docNo },
  { id: "customer", label: "Customer", kind: "text", value: (j) => `${j.customerName} ${j.customer}` },
  { id: "case", label: "Document", kind: "pick", value: (j) => j.docCase, options: [{ code: "DO", name: "With DO" }, { code: "NO_DO", name: "No DO" }] },
  { id: "status", label: "Status", kind: "pick", value: (j) => j.status, options: STATUSES.map((s) => ({ code: s, name: s })) },
  { id: "vehicle", label: "Lorry / transporter, route", kind: "text", value: (j) => `${vehicleText(j.vehicle)} ${j.route ?? ""}` },
  { id: "date", label: "Invoice date", kind: "date", value: (j) => j.docDate },
  { id: "pod", label: "POD", kind: "text", value: (j) => j.podFile ?? "" },
  { id: "amount", label: "Amount", kind: "num", right: true, value: (j) => j.amount },
];

export default function Deliveries() {
  const sample = useDeliverySample();
  const { jobs, loading: loadingJobs } = useDelivery(sample);
  const { profile } = useAuth();
  const me = profile?.full_name ?? "Warehouse";
  const [tab, setTab] = useState<"All" | Status>("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<(Result & { extra?: string[] }) | null>(null);
  const [busy, setBusy] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const { pageStyle, print } = usePrintA4();

  const count = (s: Status) => jobs.filter((j) => j.status === s).length;
  const tabbed = useMemo(() => {
    const k = q.trim().toLowerCase();
    return jobs.filter((j) => (tab === "All" || j.status === tab) && (!k || `${j.docNo} ${j.customerName} ${j.customer}`.toLowerCase().includes(k)));
  }, [jobs, tab, q]);
  const grid = useGrid(tabbed, COLS, { id: "date", dir: -1 }, byDoc);
  const rows = grid.rows;
  const total = rows.reduce((s, j) => s + j.amount, 0);
  const selected = rows.filter((j) => sel.has(j.docNo)).map((j) => j.docNo);
  const allOn = rows.length > 0 && rows.every((j) => sel.has(j.docNo));
  const current = jobs.find((j) => j.docNo === open) ?? null;

  async function run(fn: () => Promise<Result>, clear = false) {
    setBusy(true);
    const r = await fn();
    setBusy(false); setMsg(r);
    if (r.ok && clear) setSel(new Set());
    return r;
  }
  async function onFiles(list: FileList | null) {
    if (!list?.length) return;
    await run(() => attachPods(sample, [...list], me));
    if (files.current) files.current.value = "";
  }

  const excelCols: ExcelCol<DeliveryJob>[] = [
    { label: "Invoice", width: 14, value: (j) => j.docNo }, { label: "Customer code", width: 14, value: (j) => j.customer }, { label: "Customer", width: 36, value: (j) => j.customerName },
    { label: "Salesman", width: 10, value: (j) => j.agent }, { label: "Document", width: 10, value: caseText }, { label: "Status", width: 11, value: (j) => j.status },
    { label: "Lorry / transporter", width: 30, value: (j) => vehicleText(j.vehicle) }, { label: "Route", width: 14, value: (j) => j.route ?? "" },
    { label: "Invoice date", width: 13, value: (j) => j.docDate }, { label: "POD file", width: 28, value: (j) => j.podFile ?? "" },
    { label: "Amount (RM)", width: 14, right: true, money: true, total: true, value: (j) => Math.round(j.amount * 100) / 100 },
  ];
  const printCols: PrintCol<DeliveryJob>[] = [
    { label: "Invoice", cell: (j) => j.docNo }, { label: "Customer", cell: (j) => j.customerName }, { label: "Document", cell: caseText }, { label: "Status", cell: (j) => j.status },
    { label: "Lorry / transporter", cell: (j) => vehicleText(j.vehicle) || "–" }, { label: "Route", cell: (j) => j.route ?? "–" }, { label: "Date", cell: (j) => day(j.docDate) },
    { label: "POD", cell: (j) => (j.podFile ? "Yes" : "–") }, { label: "Amount", right: true, cell: (j) => money(j.amount), total: money(total) },
  ];

  return (
    <>
      {pageStyle}
      <div className="no-print">
        <PageHeader title="Deliveries" sub="Every invoice from the SAP import, from picking to a scanned proof of delivery (POD). Follow the Warehouse SOP."
          right={<Link href="/logistics/sop" className="text-sm text-indigo-600 hover:underline">Warehouse SOP</Link>} />
        {sample && <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data, kept in this browser only. <button onClick={() => { resetDelivery(); setSel(new Set()); setMsg(null); }} className="font-medium underline">Reset the sample</button></p>}
        <KpiStrip cols="lg:grid-cols-5">
          <Kpi label="To pick" value={String(count("Invoiced"))} sub="Invoiced, not picked" tone={count("Invoiced") ? "warn" : "good"} />
          <Kpi label="To load" value={String(count("Picked"))} sub="Picked and checked" />
          <Kpi label="Out for delivery" value={String(count("Loaded"))} sub="Loaded" />
          <Kpi label="POD missing" value={String(count("Delivered"))} sub="Delivered, not scanned" tone={count("Delivered") ? "bad" : "good"} />
          <Kpi label="Failed" value={String(count("Failed"))} sub="Need a new plan" tone={count("Failed") ? "bad" : "good"} />
        </KpiStrip>

        <Card className="mt-4">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <div role="tablist" aria-label="Filter by status" className="flex flex-wrap gap-1.5">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setSel(new Set()); }} title={t === "All" ? "" : STATUS_HELP[t]}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium ${tab === t ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"}`}>
                  {t === "Delivered" ? "POD missing" : t} <span className="opacity-70">{t === "All" ? jobs.length : count(t)}</span>
                </button>
              ))}
            </div>
            <div className="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice or customer" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm sm:w-56 sm:flex-none" aria-label="Search" />
              <input ref={files} type="file" multiple accept="image/*,.pdf" className="hidden" onChange={(e) => void onFiles(e.target.files)} />
              <button onClick={() => files.current?.click()} disabled={busy} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Upload size={16} /> Upload PODs</button>
              <button onClick={() => { setBusy(true); void exportExcel(rows, excelCols, "Deliveries.xlsx", "Deliveries", `Total (${rows.length.toLocaleString()} invoices)`).finally(() => setBusy(false)); }} disabled={busy || !rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><FileSpreadsheet size={16} /> Export Excel</button>
              <button onClick={print} disabled={!rows.length} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Printer size={16} /> Print A4</button>
            </div>
          </div>

          {msg && (
            <div role={msg.ok ? "status" : "alert"} className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
              {msg.text}
              {msg.ok && msg.extra && msg.extra.length > 0 && <ul className="mt-1 list-disc pl-5 text-amber-800">{msg.extra.map((x, i) => <li key={i}>{x}</li>)}</ul>}
            </div>
          )}
          {grid.active.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-slate-500">Showing {plural(rows.length, "invoice", "invoices")} of {tabbed.length.toLocaleString()}:</span>
              {grid.active.map((c) => <button key={c.id} onClick={() => grid.setFilter(c.id, {})} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-0.5 text-indigo-800 hover:bg-indigo-100">{c.label} <X size={12} /></button>)}
              <button onClick={grid.clearFilters} className="text-indigo-600 hover:underline">Clear all</button>
            </div>
          )}
          {selected.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-sm">
              <b className="font-semibold text-indigo-900">{plural(selected.length, "invoice", "invoices")} selected</b>
              <button disabled={busy} onClick={() => void run(() => markPicked(sample, selected, me), true)} className={`${btnGhost} !px-3 !py-1 !text-sm`}>Mark picked</button>
              <button disabled={busy} onClick={() => setLoading(true)} className={`${btnGhost} !px-3 !py-1 !text-sm`}>Load…</button>
              <button disabled={busy} onClick={() => void run(() => markDelivered(sample, selected, me), true)} className={`${btnGhost} !px-3 !py-1 !text-sm`}>Mark delivered</button>
              <button onClick={() => setSel(new Set())} className="ml-auto text-indigo-700 hover:underline">Clear selection</button>
            </div>
          )}

          <div className="overflow-x-auto pb-24">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr>
                  <th className="w-8 px-2 py-2 text-left"><input type="checkbox" className="h-4 w-4" checked={allOn} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((j) => j.docNo)) : new Set())} aria-label="Select all shown" /></th>
                  {COLS.map((c) => <GridHead key={c.id} col={c} grid={grid} />)}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><Td first className="text-slate-500">{loadingJobs ? "Loading…" : "No invoices match."}</Td></tr>}
                {rows.map((j) => (
                  <tr key={j.docNo} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="px-2 py-2"><input type="checkbox" className="h-4 w-4" checked={sel.has(j.docNo)} onChange={(e) => setSel((s) => { const n = new Set(s); if (e.target.checked) n.add(j.docNo); else n.delete(j.docNo); return n; })} aria-label={`Select ${j.docNo}`} /></td>
                    <Td className="whitespace-nowrap"><button onClick={() => setOpen(j.docNo)} className="font-medium text-indigo-700 hover:underline">{j.docNo}</button></Td>
                    <Td>{j.customerName}<div className="text-xs text-slate-500">{j.customer}</div></Td>
                    <Td>{j.docCase === "DO" ? "With DO" : <Badge tone="grey">No DO</Badge>}</Td>
                    <Td><Badge tone={statusTone(j.status)}>{j.status === "Delivered" ? "POD missing" : j.status}</Badge></Td>
                    <Td>{vehicleText(j.vehicle) || <span className="text-slate-300">–</span>}{j.route && <div className="text-xs text-slate-500">{j.route}</div>}</Td>
                    <Td className="whitespace-nowrap">{day(j.docDate)}</Td>
                    <Td>{j.podFile ? <span className="text-emerald-700">✔ {j.podFile}</span> : <span className="text-slate-300">–</span>}</Td>
                    <Td right className="font-medium text-slate-900">{money(j.amount)}</Td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 0 && <tfoot className="border-t-2 border-slate-200"><tr><Td first /><Td className="font-semibold">{plural(rows.length, "invoice", "invoices")}</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td right className="font-semibold">RM {money(total)}</Td></tr></tfoot>}
            </table>
          </div>
        </Card>
      </div>

      {loading && <LoadModal count={selected.length} sample={sample} onClose={() => setLoading(false)} onLoad={async (v, route) => { const r = await run(() => markLoaded(sample, selected, v, route, me), true); if (r.ok) setLoading(false); return r; }} />}
      {current && <JobModal job={current} sample={sample} me={me} onClose={() => setOpen(null)} run={run} />}

      <PrintSheet title="Deliveries" rows={rows} cols={printCols} rowKey={(j) => j.docNo} totalLabel={`Total · ${plural(rows.length, "invoice", "invoices")}`} size="8.5pt"
        lines={[`Printed ${day(new Date().toISOString())}`, [tab !== "All" ? tab : "", q.trim() ? `search “${q.trim()}”` : "", grid.describe()].filter(Boolean).join(" · ")]} />
    </>
  );
}

/** Choose the lorry (own) or the 3rd-party transporter and the route for the selected invoices. */
function LoadModal({ count, sample, onClose, onLoad }: { count: number; sample: boolean; onClose: () => void; onLoad: (v: Vehicle, route: string) => Promise<Result> }) {
  const { lorries } = useFleet(sample);
  const [kind, setKind] = useState<"own" | "third">("own");
  const [v, setV] = useState<Vehicle>({ kind: "own" });
  const [route, setRoute] = useState("");
  const [err, setErr] = useState("");
  return (
    <Modal title={`Load ${plural(count, "invoice", "invoices")}`} onClose={onClose}>
      <div className="flex gap-2" role="radiogroup" aria-label="Who delivers">
        {(["own", "third"] as const).map((k) => <button key={k} role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setV({ kind: k }); }} className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium ${kind === k ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-300 text-slate-600"}`}>{k === "own" ? "Our own lorry" : "3rd-party transporter"}</button>)}
      </div>
      {kind === "own" ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {lorries.length ? (
            <label className="text-sm font-medium text-slate-700">Lorry
              <select className={inputCls} value={v.lorryNo ?? ""} onChange={(e) => { const l = lorries.find((x) => x.no === e.target.value); setV({ ...v, lorryNo: e.target.value, driver: v.driver || l?.driver || "" }); }}>
                <option value="">Pick a lorry…</option>
                {[...lorries].sort((a, b) => Number(canLoad(b.condition)) - Number(canLoad(a.condition)) || a.no.localeCompare(b.no)).map((l) => <option key={l.no} value={l.no} disabled={!canLoad(l.condition)}>{l.no} · {l.size}{l.pallets != null ? `, ${l.pallets} pallets` : ""}{l.condition !== "Good" ? ` · ${l.condition.toLowerCase()}` : ""}</option>)}
              </select>
              {lorries.find((x) => x.no === v.lorryNo)?.condition === "Needs service" && <span className="mt-1 block text-xs text-amber-700">This lorry is due a service: {lorries.find((x) => x.no === v.lorryNo)?.notes || "check it before the trip"}.</span>}
              {(() => { const l = lorries.find((x) => x.no === v.lorryNo); const w = l ? warnings(l).filter((x) => x.state === "expired") : []; return w.length ? <span className="mt-1 block text-xs text-rose-700">{w.map((x) => `${x.label} expired`).join(", ")}: it should not be on the road.</span> : null; })()}
            </label>
          ) : <label className="text-sm font-medium text-slate-700">Lorry number<input className={inputCls} value={v.lorryNo ?? ""} onChange={(e) => setV({ ...v, lorryNo: e.target.value })} /></label>}
          <label className="text-sm font-medium text-slate-700">Driver<input className={inputCls} value={v.driver ?? ""} onChange={(e) => setV({ ...v, driver: e.target.value })} /></label>
        </div>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium text-slate-700">Transporter<input className={inputCls} value={v.transporter ?? ""} onChange={(e) => setV({ ...v, transporter: e.target.value })} /></label>
          <label className="text-sm font-medium text-slate-700">Vehicle number (optional)<input className={inputCls} value={v.vehicleNo ?? ""} onChange={(e) => setV({ ...v, vehicleNo: e.target.value })} /></label>
        </div>
      )}
      <label className="mt-3 block text-sm font-medium text-slate-700">Route<input className={inputCls} value={route} onChange={(e) => setRoute(e.target.value)} placeholder="For example Route 1" /></label>
      <p className="mt-2 text-xs text-slate-500">The driver signs the manifest first (SOP step 3.5). Only picked invoices are loaded; others are skipped.</p>
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={onClose} className={btnGhost}>Cancel</button><button onClick={async () => { const r = await onLoad({ ...v, kind }, route); if (!r.ok) setErr(r.text); }} className={btnPrimary}>Mark loaded</button></div>
    </Modal>
  );
}

/** One invoice: its history and the next step. */
function JobModal({ job, sample, me, onClose, run }: { job: DeliveryJob; sample: boolean; me: string; onClose: () => void; run: (fn: () => Promise<Result>) => Promise<Result> }) {
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const act = async (fn: () => Promise<Result>) => { const r = await run(fn); setErr(r.ok ? "" : r.text); };
  return (
    <Modal title={`${job.docNo} · ${job.customerName}`} onClose={onClose} wide>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={statusTone(job.status)}>{job.status === "Delivered" ? "POD missing" : job.status}</Badge>
        <span className="text-slate-600">{STATUS_HELP[job.status]}</span>
        <span className="ml-auto font-medium text-slate-900">RM {money(job.amount)}</span>
      </div>
      <dl className="mt-3 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <div><dt className="inline text-slate-500">Customer: </dt><dd className="inline">{job.customer}</dd></div>
        <div><dt className="inline text-slate-500">Invoice date: </dt><dd className="inline">{day(job.docDate)}</dd></div>
        <div><dt className="inline text-slate-500">Document: </dt><dd className="inline">{job.docCase === "DO" ? "With DO (customer signs DO and invoice)" : "No DO (customer signs the invoice)"}</dd></div>
        <div><dt className="inline text-slate-500">Delivered by: </dt><dd className="inline">{vehicleText(job.vehicle) || "–"}{job.route ? `, ${job.route}` : ""}</dd></div>
        {job.podFile && <div className="sm:col-span-2"><dt className="inline text-slate-500">POD: </dt><dd className="inline text-emerald-700">✔ {job.podFile}</dd>{!sample && job.podPath && <button onClick={async () => { const u = await podLink(job.podPath!); if (u) window.open(u, "_blank", "noopener"); else setErr("The scan could not be opened."); }} className="ml-2 text-indigo-700 hover:underline">Open scan</button>}</div>}
        {job.failReason && <div className="sm:col-span-2"><dt className="inline text-slate-500">Why it failed: </dt><dd className="inline text-rose-700">{job.failReason}</dd></div>}
      </dl>

      <h3 className="mt-4 text-sm font-semibold text-slate-900">History</h3>
      <ol className="mt-1 space-y-1 border-l-2 border-slate-200 pl-3 text-sm">
        {job.events.map((e, i) => <li key={i}><span className="font-medium text-slate-900">{e.status}</span> <span className="text-slate-500">· {e.at} · {e.by}{e.note ? ` · ${e.note}` : ""}</span></li>)}
      </ol>

      {err && <p role="alert" className="mt-3 text-sm text-rose-700">{err}</p>}
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        {job.status === "Invoiced" && <>
          <button onClick={() => void act(() => markPicked(sample, [job.docNo], me))} className={btnPrimary}>Mark picked</button>
          <button onClick={() => void act(() => setDocCase(sample, job.docNo, job.docCase === "DO" ? "NO_DO" : "DO"))} className={btnGhost}>Change to {job.docCase === "DO" ? "No DO" : "With DO"}</button>
        </>}
        {job.status === "Picked" && <span className="text-sm text-slate-600">Select this invoice in the list and choose <b>Load…</b> to set the lorry and route.</span>}
        {job.status === "Loaded" && <>
          <button onClick={() => void act(() => markDelivered(sample, [job.docNo], me))} className={btnPrimary}>Mark delivered</button>
          <input className={`${inputCls} !mt-0 min-w-0 flex-1 !py-1.5 text-sm`} placeholder="Reason, if the delivery failed" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason the delivery failed" />
          <button onClick={() => void act(() => markFailed(sample, job.docNo, reason, me))} className={`${btnGhost} !text-rose-700`}>Delivery failed</button>
        </>}
        {job.status === "Delivered" && <span className="text-sm text-slate-600">Scan the signed document, name it <b>POD_{job.docNo.replace(" ", "")}_yyyymmdd</b> and use <b>Upload PODs</b> on the list.</span>}
        {job.status === "Failed" && <button onClick={() => void act(() => replan(sample, job.docNo, me))} className={btnPrimary}>Plan again</button>}
        {job.status === "Completed" && <span className="text-sm text-emerald-700">Complete. Nothing more to do.</span>}
        <button onClick={onClose} className={`${btnGhost} ml-auto`}>Close</button>
      </div>
    </Modal>
  );
}
