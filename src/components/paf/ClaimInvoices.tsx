"use client";
import { useState } from "react";
import { FileCheck2, Plus, Trash2 } from "lucide-react";

/** A delivered invoice added to a claim, with its scanned proof of delivery (POD) that goes into the claim's files. */
export type InvoicePod = { docNo: string; date: string; amount: number; podFile: string; podUrl?: string; file?: File; path?: string | null; fileId?: number };
export type Lookup = { ok: true; item: InvoicePod } | { ok: false; text: string };

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");
/** S159676, 101S159676 and s159676 are the same invoice; "B 15124" keeps its space. */
export const tidyInvoice = (s: string) => { const t = s.trim().toUpperCase().replace(/\s+/g, " "); const b = /^B[\s_-]?(\d{3,6})$/.exec(t); return b ? `B ${b[1]}` : t.replace(/^101(?=S)/, ""); };

// ---------- made-up invoices for the sample screens ----------
type SampleInv = { docNo: string; customer: string; status: "Invoiced" | "Delivered" | "Completed"; date: string; amount: number; podFile?: string };
const SAMPLE: SampleInv[] = [
  { docNo: "S900301", customer: "SAMPLE-C01", status: "Completed", date: "2026-11-18", amount: 2210.6, podFile: "POD_S900301_20261119.pdf" },
  { docNo: "S900302", customer: "SAMPLE-C01", status: "Completed", date: "2026-11-20", amount: 940, podFile: "POD_S900302_20261121.pdf" },
  { docNo: "S900303", customer: "SAMPLE-C01", status: "Delivered", date: "2026-11-24", amount: 655 },
  { docNo: "S900304", customer: "SAMPLE-C01", status: "Invoiced", date: "2026-11-25", amount: 1280.4 },
  { docNo: "S900305", customer: "SAMPLE-C02", status: "Completed", date: "2026-11-19", amount: 3100.75, podFile: "POD_S900305_20261120.pdf" },
];
function sampleLookup(doc: string, customerCode: string): Lookup {
  const j = SAMPLE.find((x) => x.docNo === doc);
  if (!j) return { ok: false, text: `Invoice ${doc} is not in the delivery list.` };
  if (j.customer !== customerCode) return { ok: false, text: `Invoice ${doc} is for another customer, not the one on this claim.` };
  if (j.status === "Invoiced") return { ok: false, text: `Invoice ${doc} has not been delivered yet.` };
  if (j.status === "Delivered" || !j.podFile) return { ok: false, text: `Invoice ${doc} is delivered, but its signed POD is not scanned yet. Ask the warehouse to upload it.` };
  return { ok: true, item: { docNo: j.docNo, date: j.date, amount: j.amount, podFile: j.podFile } };
}

/**
 * Invoice numbers on a PAF claim. Typing a delivered invoice's number brings in its scanned POD automatically,
 * so the supervisor and Colgate see the proof of delivery with the claim. Nothing is typed into the form itself.
 */
export function ClaimInvoices({ sample, customerCode, items, onChange, locked = false, lookup }: {
  sample: boolean; customerCode: string | null; items: InvoicePod[]; onChange: (items: InvoicePod[]) => void; locked?: boolean;
  /** the live lookup (database); the sample screens use made-up invoices */
  lookup?: (doc: string, customerCode: string) => Promise<Lookup>;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function add() {
    const doc = tidyInvoice(q);
    setErr("");
    if (!doc) return;
    if (!customerCode) { setErr("Choose the customer from the list first."); return; }
    if (items.some((i) => i.docNo === doc)) { setErr(`Invoice ${doc} is already on this claim.`); return; }
    setBusy(true);
    const r = sample || !lookup ? sampleLookup(doc, customerCode) : await lookup(doc, customerCode);
    setBusy(false);
    if (!r.ok) { setErr(r.text); return; }
    onChange([...items, r.item]); setQ("");
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="font-semibold text-slate-900">Delivered invoices</h3>
      <p className="mt-0.5 text-sm text-slate-600">Type the invoice number. Its signed delivery proof (POD) is added to this claim automatically.</p>
      {!locked && (
        <div className="mt-2 flex gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} placeholder="For example S159676" aria-label="Invoice number" className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
          <button onClick={() => void add()} disabled={busy || !q.trim()} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"><Plus size={15} /> {busy ? "Finding…" : "Add"}</button>
        </div>
      )}
      {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
      {items.length > 0 ? (
        <ul className="mt-2 divide-y divide-slate-100">
          {items.map((i) => (
            <li key={i.docNo} className="flex items-center gap-2 py-1.5 text-sm">
              <FileCheck2 size={16} className="shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1"><b className="font-medium text-slate-900">{i.docNo}</b> <span className="text-slate-500">· {day(i.date)} · RM {money(i.amount)}</span>
                <span className="block truncate text-xs text-slate-500">POD: {i.podUrl ? <a href={i.podUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-700 underline">{i.podFile}</a> : i.podFile}</span></span>
              {!locked && <button onClick={() => onChange(items.filter((x) => x.docNo !== i.docNo))} aria-label={`Remove ${i.docNo}`} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15} /></button>}
            </li>
          ))}
        </ul>
      ) : <p className="mt-2 text-xs text-slate-500">No invoices added yet.</p>}
    </div>
  );
}
