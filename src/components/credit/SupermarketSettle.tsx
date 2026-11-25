"use client";
import { useState } from "react";
import { Check, Undo2 } from "lucide-react";
import { Badge, Card } from "@/components/ui";
import { Modal, btnGhost, btnPrimary } from "@/components/finui";
import { settleSupermarket, undoSettled, useCreditStore } from "@/lib/creditStore";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s?: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");
const todayMY = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());

/**
 * Supermarkets are not in the daily payment file; they send a collection summary and Finance knocks the invoices off by hand
 * twice a month. Here Finance ticks the invoices a summary covers and records it, so everyone can see them as settled.
 */
export function SupermarketSettle({ isSample, by }: { isSample: boolean; by: string }) {
  const { supermarket, settled } = useCreditStore(isSample);
  const [view, setView] = useState<"open" | "settled">("open");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [asking, setAsking] = useState(false);
  const [date, setDate] = useState(todayMY());
  const [ref, setRef] = useState("");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const sel = supermarket.filter((x) => picked.has(x.docNo));
  const customers = new Set(supermarket.map((x) => x.customer)).size;
  const toggle = (d: string) => setPicked((p) => { const n = new Set(p); if (n.has(d)) n.delete(d); else n.add(d); return n; });
  const toggleCustomer = (code: string) => {
    const docs = supermarket.filter((x) => x.customer === code).map((x) => x.docNo);
    const every = docs.every((d) => picked.has(d));
    setPicked((p) => { const n = new Set(p); docs.forEach((d) => (every ? n.delete(d) : n.add(d))); return n; });
  };
  const byCustomer = [...new Set(supermarket.map((x) => x.customer))].map((code) => ({ code, rows: supermarket.filter((x) => x.customer === code) }));

  async function save() {
    if (busy) return;
    setBusy(true);
    const r = await settleSupermarket(isSample, sel.map((x) => x.docNo), date, ref, note, by);
    setBusy(false);
    if (!r.ok) { setErr(r.text); return; }
    setErr(""); setMsg(r.text); setPicked(new Set()); setAsking(false); setRef(""); setNote("");
  }

  return (
    <div className="mt-3">
      <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">Supermarkets are not in the daily payment file. They send a collection summary, and the aging is knocked off by hand twice a month. Tick the invoices a summary covers and mark them settled. <b className="font-medium">This only records it; the aging itself is not changed.</b></p>
      <div className="mt-3 inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
        {(["open", "settled"] as const).map((t) => <button key={t} onClick={() => { setView(t); setPicked(new Set()); }} className={`rounded px-3 py-1 ${view === t ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t === "open" ? `Open (${supermarket.length})` : `Settled (${settled.length})`}</button>)}
      </div>
      {msg && <p role="status" className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

      {view === "open" ? (
        <>
          {sel.length > 0 && (
            <div className="sticky top-0 z-10 mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
              <span className="text-sm text-slate-700">{sel.length} of {supermarket.length} selected · RM {money(sel.reduce((t, x) => t + x.amount, 0))}</span>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setPicked(new Set())} className="text-sm text-slate-600 hover:underline">Clear</button>
                <button onClick={() => { setAsking(true); setErr(""); }} className={`${btnPrimary} inline-flex items-center gap-1.5`}><Check size={16} /> Mark settled ({sel.length})</button>
              </div>
            </div>
          )}
          <div className="mt-3 space-y-3">
            {supermarket.length === 0 && <Card><p className="py-6 text-center text-slate-500">No open supermarket invoices.</p></Card>}
            {byCustomer.map(({ code, rows }) => (
              <Card key={code}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2"><input type="checkbox" checked={rows.every((r) => picked.has(r.docNo))} onChange={() => toggleCustomer(code)} className="h-4 w-4 accent-indigo-600" aria-label={`Tick all of ${rows[0].customerName}`} /><span className="font-semibold text-slate-900">{rows[0].customerName}</span><span className="text-sm text-slate-500">{code}</span></label>
                  <span className="text-sm text-slate-600">{rows.length} {rows.length === 1 ? "invoice" : "invoices"} · RM {money(rows.reduce((t, r) => t + r.amount, 0))}</span>
                </div>
                <ul className="mt-2 divide-y divide-slate-100">
                  {rows.map((r) => (
                    <li key={r.docNo} className="flex items-center gap-3 py-1.5 text-sm">
                      <input type="checkbox" checked={picked.has(r.docNo)} onChange={() => toggle(r.docNo)} className="h-4 w-4 accent-indigo-600" aria-label={`Tick invoice ${r.docNo}`} />
                      <span className="w-28 font-medium text-slate-900">{r.docNo}</span>
                      <span className="text-slate-500">due {day(r.dueDate)}</span>
                      <span className="ml-auto tabular-nums">RM {money(r.amount)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
            {customers > 0 && <p className="text-xs text-slate-500">{customers} {customers === 1 ? "supermarket" : "supermarkets"} with open invoices.</p>}
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-2">
          {settled.length === 0 && <Card><p className="py-6 text-center text-slate-500">Nothing marked settled yet.</p></Card>}
          {settled.map((x) => (
            <Card key={x.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2"><b className="font-semibold text-slate-900">{x.customerName}</b><span className="text-slate-500">{x.docNo}</span><Badge tone="green">Settled {day(x.settledOn)}</Badge></div>
                  <div className="text-slate-600">RM {money(x.amount)}{x.summaryRef ? ` · ${x.summaryRef}` : ""}{x.note ? ` · “${x.note}”` : ""}</div>
                  <div className="text-xs text-slate-500">Marked by {x.by} on {day(x.at)}</div>
                </div>
                <button onClick={async () => { const r = await undoSettled(isSample, x.id); setMsg(r.text); }} className={`${btnGhost} inline-flex items-center gap-1.5 !px-2.5 !py-1 text-sm`}><Undo2 size={14} /> Open again</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {asking && (
        <Modal title={`Mark ${sel.length} ${sel.length === 1 ? "invoice" : "invoices"} settled?`} onClose={() => setAsking(false)}>
          <p className="text-sm text-slate-600">RM {money(sel.reduce((t, x) => t + x.amount, 0))} from the collection summary. The aging is not changed; you still knock these off in the accounting system.</p>
          <label className="mt-3 block text-sm font-medium text-slate-700">Date settled<input type="date" value={date} max={todayMY()} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          <label className="mt-3 block text-sm font-medium text-slate-700">Collection summary (optional)<input value={ref} onChange={(e) => setRef(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" placeholder="For example: Collection summary 16-30 Nov" /></label>
          <label className="mt-3 block text-sm font-medium text-slate-700">Note (optional)<textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" /></label>
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setAsking(false)} className={btnGhost}>Cancel</button><button disabled={busy || !date} onClick={save} className={btnPrimary}>{busy ? "Saving…" : "Mark settled"}</button></div>
        </Modal>
      )}
    </div>
  );
}
