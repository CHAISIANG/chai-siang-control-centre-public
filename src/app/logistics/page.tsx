"use client";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, UploadCloud } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Plate, Td, Th } from "@/components/ui";
import { useData } from "@/components/data";
import { useRole } from "@/components/role";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { LORRY_STATUSES, pct, type Lorry, type LorryStatus } from "@/lib/mock";
import { STATUSES, statusTone, vehicleText, type Status } from "@/lib/delivery/rules";
import { useDelivery, useDeliverySample } from "@/lib/delivery/store";

const TEMPLATE_HEADERS = ["Lorry No", "Driver", "Route", "Remark", "Invoices Loaded", "Load %"];
const TEMPLATE_URL = "/templates/Lorry%20Status%20Template.xlsx";

const statusStyle: Record<LorryStatus, { badge: "green" | "amber" | "blue"; bar: string; ring: string; label: string }> = {
  "On duty": { badge: "green", bar: "bg-emerald-500", ring: "border-l-emerald-600", label: "Out delivering" },
  Loading: { badge: "amber", bar: "bg-amber-500", ring: "border-l-amber-500", label: "Being loaded" },
  Empty: { badge: "blue", bar: "bg-sky-500", ring: "border-l-sky-600", label: "Back & empty" },
};

type ImportResult = { fileName: string; ok: Lorry[]; errors: string[]; headerError?: string };

async function parseLorryFile(file: File): Promise<ImportResult> {
  const result: ImportResult = { fileName: file.name, ok: [], errors: [] };
  let rows: unknown[][];
  try {
    rows = (await readSheet(file)) as unknown[][];
  } catch {
    result.headerError = "This file could not be read as an Excel (.xlsx) file.";
    return result;
  }
  const header = (rows[0] ?? []).map((h) => String(h ?? "").trim());
  const missing = TEMPLATE_HEADERS.filter((h, i) => header[i]?.toLowerCase() !== h.toLowerCase());
  if (missing.length) {
    result.headerError = `Header row does not match the template. Expected: ${TEMPLATE_HEADERS.join(" | ")}. Found: ${header.filter(Boolean).join(" | ") || "(empty)"}.`;
    return result;
  }
  const seen = new Set<string>();
  rows.slice(1).forEach((r, idx) => {
    const line = idx + 2;
    if (r.every((c) => c === null || c === undefined || String(c).trim() === "")) return;
    const lorryNo = String(r[0] ?? "").trim().toUpperCase();
    const status = LORRY_STATUSES.find((s) => s.toLowerCase() === String(r[3] ?? "").trim().toLowerCase());
    const invoices = Number(r[4] ?? 0);
    const loadPct = Number(r[5] ?? 0);
    const problems: string[] = [];
    if (!lorryNo) problems.push("Lorry No is empty");
    else if (seen.has(lorryNo)) problems.push(`duplicate lorry ${lorryNo}`);
    if (!status) problems.push(`Remark "${String(r[3] ?? "")}" must be one of ${LORRY_STATUSES.join(" / ")}`);
    if (!Number.isFinite(invoices) || invoices < 0) problems.push("Invoices Loaded must be a number ≥ 0");
    if (!Number.isFinite(loadPct) || loadPct < 0 || loadPct > 100) problems.push("Load % must be 0–100");
    if (problems.length) {
      result.errors.push(`Row ${line}: ${problems.join("; ")}`);
      return;
    }
    seen.add(lorryNo);
    result.ok.push({ lorryNo, driver: String(r[1] ?? "").trim() || "—", route: String(r[2] ?? "").trim() || "—", status: status!, invoices, loadPct });
  });
  return result;
}

export default function Logistics() {
  const { lorries, reloadLorries } = useData();
  const { can } = useRole();
  const sample = useDeliverySample();
  const { jobs } = useDelivery(sample, can("page_logistics"));
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<LorryStatus | "All">("All");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [applied, setApplied] = useState(false);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  // Deliveries come from the delivery tracking, not from a sample.
  const todayMYT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
  const n = (st: Status) => jobs.filter((j) => j.status === st).length;
  const stageMax = Math.max(1, ...STATUSES.filter((st) => st !== "Failed").map(n));
  const last = (j: (typeof jobs)[number]) => (j.events[j.events.length - 1]?.at ?? "").slice(0, 10);
  const trips = useMemo(() => {
    const m = new Map<string, { who: string; routes: Set<string>; total: number; done: number; failed: number }>();
    for (const j of jobs) {
      if (!j.vehicle) continue;
      if (j.status === "Completed" && dayDiff(todayMYT, last(j)) > 1) continue;
      const k = vehicleText(j.vehicle) || "-";
      const g = m.get(k) ?? { who: k, routes: new Set<string>(), total: 0, done: 0, failed: 0 };
      if (j.route) g.routes.add(j.route);
      g.total++; if (j.status === "Delivered" || j.status === "Completed") g.done++; if (j.status === "Failed") g.failed++;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);
  const NEXT: Record<Status, string> = { Invoiced: "Pick it", Picked: "Load it", Loaded: "Out for delivery", Delivered: "Scan the POD", Completed: "", Failed: "Plan again" };
  const pending = jobs.filter((j) => j.status !== "Completed").map((j) => ({ ...j, age: Math.max(0, dayDiff(todayMYT, j.docDate || todayMYT)) })).sort((a, b) => b.age - a.age).slice(0, 25);
  const count = (s: LorryStatus) => lorries.filter((l) => l.status === s).length;
  const shown = lorries.filter((l) => filter === "All" || l.status === filter);

  async function applyImport(rows: Lorry[]) {
    setSaving(true); setSaveError(null);
    const { error } = await supabase.from("lorries").upsert(rows.map((r) => ({ lorry_no: r.lorryNo, driver: r.driver, route: r.route, status: r.status, invoices: r.invoices, load_pct: r.loadPct, updated_at: new Date().toISOString() })));
    if (!error) {
      const gone = lorries.map((x) => x.lorryNo).filter((n) => !rows.some((r) => r.lorryNo === n));
      if (gone.length) { const del = await supabase.from("lorries").delete().in("lorry_no", gone); if (del.error) { setSaveError(del.error.message); setSaving(false); return; } }
      await reloadLorries();
      setFilter("All"); setApplied(true);
    } else setSaveError(error.message);
    setSaving(false);
  }

  async function onFile(f?: File | null) {
    if (!f) return;
    setBusy(true);
    setApplied(false);
    setResult(await parseLorryFile(f));
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <>
      <PageHeader title="Logistics · Daily Delivery Status" sub="Lorries, drivers and every invoice from picking to a scanned proof of delivery." right={<div className="flex flex-wrap gap-3 text-sm"><Link href="/logistics/deliveries" className="text-indigo-600 hover:underline">Deliveries</Link><Link href="/logistics/exceptions" className="text-indigo-600 hover:underline">Exceptions</Link><Link href="/logistics/damaged" className="text-indigo-600 hover:underline">Damaged stock</Link><Link href="/logistics/sop" className="text-indigo-600 hover:underline">Warehouse SOP</Link></div>} />

      {/* Lorry status */}
      <Card title="Lorry status" right={<span className="text-xs text-slate-500">{lorries.length} lorries in fleet</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(["All", ...LORRY_STATUSES] as const).map((s) => {
            const n = s === "All" ? lorries.length : count(s);
            const active = filter === s;
            return (
              <button key={s} onClick={() => setFilter(s)} className={`rounded-lg border p-3 text-left ${active ? "border-slate-900 bg-signal-soft" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="text-sm text-slate-500">{s === "All" ? "All lorries" : s}</div>
                <div className="font-display text-[34px] font-semibold leading-tight text-slate-900">{n}</div>
                <div className="text-sm text-slate-500">{s === "All" ? "in the fleet" : statusStyle[s].label}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((l) => {
            const st = statusStyle[l.status];
            return (
              <div key={l.lorryNo} className={`rounded-lg border border-slate-200 border-l-4 bg-white p-3 ${st.ring}`}>
                <div className="flex items-center justify-between">
                  <Plate>{l.lorryNo}</Plate>
                  <Badge tone={st.badge}>{l.status}</Badge>
                </div>
                <div className="mt-1 text-sm text-slate-700">{l.driver}</div>
                <div className="text-xs text-slate-400">{l.route}</div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{l.invoices} invoices</span><span>{l.loadPct}% load</span></div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${st.bar}`} style={{ width: `${l.loadPct}%` }} /></div>
              </div>
            );
          })}
          {!shown.length && <p className="col-span-full py-6 text-center text-sm text-slate-400">No lorries with this status.</p>}
        </div>
      </Card>

      {can("lorries_manage") && (
      <>
      {/* Template + upload */}
      <Card title="Update lorry status from Excel" className="mt-5" right={
        <a href={TEMPLATE_URL} download className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Download size={14} /> Download template</a>
      }>
        <p className="mb-3 text-sm text-slate-600">
          1) Download the template. 2) Fill one row per lorry (Remark is a drop-down, only {LORRY_STATUSES.join(" / ")}). 3) Upload it here. The columns must match exactly: <span className="font-mono text-xs">{TEMPLATE_HEADERS.join(" | ")}</span>.
        </p>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
          className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-6 text-center"
        >
          <UploadCloud className="text-slate-400" size={28} />
          <p className="text-sm text-slate-700">Drop the filled template here, or</p>
          <button onClick={() => input.current?.click()} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">{busy ? "Reading…" : "Choose .xlsx file"}</button>
          <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
        </div>

        {result && (
          <div className="mt-4 space-y-3 text-sm">
            <div className="text-xs text-slate-500">File: <b>{result.fileName}</b></div>
            {result.headerError ? (
              <div className="flex gap-2 rounded-md bg-rose-50 p-3 text-rose-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{result.headerError}</div>
            ) : (
              <>
                <div className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-emerald-800"><CheckCircle2 size={16} />{result.ok.length} lorries ready to import{result.errors.length ? `, ${result.errors.length} row(s) skipped` : ""}.</div>
                {result.errors.length > 0 && (
                  <ul className="list-disc space-y-1 rounded-md bg-amber-50 p-3 pl-7 text-amber-900">{result.errors.map((e) => <li key={e}>{e}</li>)}</ul>
                )}
                {result.ok.length > 0 && !applied && (
                  <button disabled={saving} onClick={() => void applyImport(result.ok)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    {saving ? "Saving…" : `Save to lorry board (replaces current ${lorries.length})`}
                  </button>
                )}
                {saveError && <p role="alert" className="rounded-md bg-rose-50 p-3 text-rose-800">Could not save: {saveError}</p>}
                {applied && <div className="font-medium text-emerald-700">Lorry board saved.</div>}
              </>
            )}
          </div>
        )}
      </Card>

      </>
      )}

      {/* Delivery summary */}
      {sample && <p className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample deliveries, not real.</p>}
      <div className="mt-5">
        <KpiStrip cols="lg:grid-cols-5">
          <Kpi label="To pick" value={`${n("Invoiced")}`} sub="Invoiced, not picked" tone={n("Invoiced") ? "warn" : "good"} />
          <Kpi label="To load" value={`${n("Picked")}`} sub="Picked and checked" />
          <Kpi label="Out for delivery" value={`${n("Loaded")}`} sub="Loaded" />
          <Kpi label="POD missing" value={`${n("Delivered")}`} sub="Delivered, not scanned" tone={n("Delivered") ? "bad" : "good"} />
          <Kpi label="Failed, to reschedule" value={`${n("Failed")}`} tone={n("Failed") ? "bad" : "good"} />
        </KpiStrip>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Status by step" className="lg:col-span-1">
          <ul className="space-y-3">
            {STATUSES.filter((st) => st !== "Failed").map((st) => (
              <li key={st}>
                <div className="mb-1 flex justify-between text-xs text-slate-600"><span>{st === "Delivered" ? "Delivered, POD missing" : st}</span><b>{n(st)}</b></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${pct(n(st), stageMax)}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Driver / route progress" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th>Driver / lorry or transporter</Th><Th>Route</Th><Th right>Total</Th><Th right>Done</Th><Th right>Failed</Th><Th>Progress</Th></tr></thead>
              <tbody>
                {trips.length === 0 && <tr><Td first className="text-slate-500">No loaded invoices yet.</Td></tr>}
                {trips.map((d) => (
                  <tr key={d.who} className="border-b border-slate-100 last:border-0">
                    <Td><b>{d.who}</b></Td><Td>{[...d.routes].join(", ") || "-"}</Td>
                    <Td right>{d.total}</Td><Td right>{d.done}</Td><Td right className={d.failed ? "font-medium text-rose-600" : ""}>{d.failed}</Td>
                    <Td><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct(d.done, d.total)}%` }} /></div><span className="text-xs text-slate-500">{pct(d.done, d.total)}%</span></div></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Pending invoices: next action" className="mt-5" right={<Link href="/logistics/deliveries" className="text-sm text-indigo-600 hover:underline">All deliveries</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th>Invoice</Th><Th>Customer</Th><Th>Driver / lorry</Th><Th>Status</Th><Th>Next</Th><Th right>Age</Th></tr></thead>
            <tbody>
              {pending.length === 0 && <tr><Td first className="text-slate-500">Nothing pending.</Td></tr>}
              {pending.map((p) => (
                <tr key={p.docNo} className="border-b border-slate-100 last:border-0">
                  <Td><b>{p.docNo}</b></Td><Td>{p.customerName}</Td><Td>{vehicleText(p.vehicle) || "-"}</Td>
                  <Td><Badge tone={statusTone(p.status)}>{p.status === "Delivered" ? "POD missing" : p.status}</Badge></Td>
                  <Td>{NEXT[p.status]}</Td>
                  <Td right>{p.age === 0 ? "Today" : `${p.age} ${p.age === 1 ? "day" : "days"}`}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
