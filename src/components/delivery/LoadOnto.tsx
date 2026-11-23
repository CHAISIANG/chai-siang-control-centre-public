"use client";
import { useState } from "react";
import { Truck } from "lucide-react";
import { btnPrimary, inputCls } from "@/components/finui";
import type { DeliveryJob, Vehicle } from "@/lib/delivery/rules";
import type { Result } from "@/lib/delivery/store";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * With one lorry chosen: the invoices that are picked and waiting, to tick and load onto that lorry in one go.
 * The lorry, driver and route are filled in; the database checks the lorry can be loaded.
 */
export function LoadOnto({ plate, blocked, waiting, driver: driver0, assistant: assistant0 = "", route: route0, onLoad }: {
  plate: string; blocked: string | null; waiting: DeliveryJob[]; driver: string; assistant?: string; route: string;
  onLoad: (docs: string[], v: Vehicle, route: string) => Promise<Result>;
}) {
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [driver, setDriver] = useState(driver0);
  const [assistant, setAssistant] = useState(assistant0);
  const [route, setRoute] = useState(route0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const k = q.trim().toLowerCase();
  const shown = waiting.filter((j) => !k || `${j.docNo} ${j.customerName} ${j.customer}`.toLowerCase().includes(k));
  const chosen = waiting.filter((j) => ticked.has(j.docNo));
  const allOn = shown.length > 0 && shown.every((j) => ticked.has(j.docNo));
  const toggle = (d: string) => setTicked((t) => { const n = new Set(t); if (n.has(d)) n.delete(d); else n.add(d); return n; });

  if (!open) return (
    <button onClick={() => setOpen(true)} disabled={!!blocked || !waiting.length} title={blocked ?? ""}
      className={`${btnPrimary} inline-flex items-center gap-1.5 !px-3 !py-1.5 !text-sm`}>
      <Truck size={15} /> {waiting.length ? `Load invoices onto ${plate} (${waiting.length} picked, waiting)` : "No picked invoices waiting"}
    </button>
  );
  return (
    <div className="mt-2 w-full rounded-lg border border-indigo-200 bg-white p-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="font-semibold text-slate-900">Load onto {plate}</div>
        <label className="text-sm text-slate-700">Driver<input className={`${inputCls} !mt-0.5 !py-1.5 !text-sm`} value={driver} onChange={(e) => setDriver(e.target.value)} /></label>
        <label className="text-sm text-slate-700">Lorry assistant<input className={`${inputCls} !mt-0.5 !py-1.5 !text-sm`} value={assistant} onChange={(e) => setAssistant(e.target.value)} placeholder="Optional" /></label>
        <label className="text-sm text-slate-700">Route<input className={`${inputCls} !mt-0.5 !py-1.5 !text-sm`} value={route} onChange={(e) => setRoute(e.target.value)} placeholder="For example Route 1" /></label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search invoice or customer" aria-label="Search picked invoices" className="ml-auto rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="mt-3 max-h-80 overflow-auto rounded-md border border-slate-200">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50 text-left text-slate-600"><tr>
            <th className="w-8 px-2 py-2"><input type="checkbox" checked={allOn} onChange={() => setTicked((t) => { const n = new Set(t); shown.forEach((j) => (allOn ? n.delete(j.docNo) : n.add(j.docNo))); return n; })} aria-label="Tick all shown" className="h-4 w-4 accent-indigo-600" /></th>
            <th className="px-2 py-2 font-medium">Invoice</th><th className="px-2 py-2 font-medium">Customer</th><th className="px-2 py-2 font-medium">Document</th><th className="px-2 py-2 text-right font-medium">Amount (RM)</th>
          </tr></thead>
          <tbody>
            {shown.map((j) => (
              <tr key={j.docNo} onClick={() => toggle(j.docNo)} className={`cursor-pointer border-t border-slate-100 ${ticked.has(j.docNo) ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
                <td className="px-2 py-1.5"><input type="checkbox" checked={ticked.has(j.docNo)} onChange={() => toggle(j.docNo)} onClick={(e) => e.stopPropagation()} aria-label={`Load ${j.docNo}`} className="h-4 w-4 accent-indigo-600" /></td>
                <td className="px-2 py-1.5 font-medium text-slate-900">{j.docNo}</td>
                <td className="px-2 py-1.5"><div>{j.customerName}</div><div className="text-xs text-slate-500">{j.customer}</div></td>
                <td className="px-2 py-1.5">{j.docCase === "DO" ? "With DO" : "No DO"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{money(j.amount)}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={5} className="px-2 py-4 text-center text-slate-500">No picked invoice matches.</td></tr>}
          </tbody>
        </table>
      </div>
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="text-sm text-slate-700">{chosen.length} ticked · RM {money(chosen.reduce((t, j) => t + j.amount, 0))}</span>
        <span className="text-xs text-slate-500">The driver signs the manifest first (SOP step 3.5).</span>
        <div className="ml-auto flex gap-2">
          <button onClick={() => { setOpen(false); setTicked(new Set()); setErr(""); }} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100">Close</button>
          <button disabled={busy || !chosen.length} onClick={async () => {
            setBusy(true);
            const r = await onLoad(chosen.map((j) => j.docNo), { kind: "own", lorryNo: plate, driver: driver.trim(), ...(assistant.trim() ? { assistant: assistant.trim() } : {}) }, route);
            setBusy(false);
            if (r.ok) { setTicked(new Set()); setErr(""); } else setErr(r.text);
          }} className={`${btnPrimary} !px-3 !py-1.5 !text-sm`}>{busy ? "Loading…" : `Load ${chosen.length || ""} onto ${plate}`}</button>
        </div>
      </div>
    </div>
  );
}
