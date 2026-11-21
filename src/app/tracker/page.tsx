"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Circle, FileSearch, Search, TriangleAlert } from "lucide-react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { btnPrimary, inputCls } from "@/components/finui";
import { statusTone, vehicleText, type JobEvent, type Status } from "@/lib/delivery/rules";
import { podLink, useDeliverySample } from "@/lib/delivery/store";
import { liveSearch, sampleSearch, type Tracked } from "@/lib/tracker";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (s: Status) => (s === "Delivered" ? "Delivered, POD not scanned" : s === "Completed" ? "Delivered and scanned" : s);
const firstEvent = (ev: JobEvent[], s: Status) => ev.find((e) => e.status === s);

/** One step of the journey: done (tick) or not yet (circle). */
function Step({ done, warn, title, detail, children }: { done: boolean; warn?: boolean; title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      <span className={`z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${warn ? "bg-rose-100 text-rose-700" : done ? "bg-emerald-600 text-white" : "border-2 border-slate-300 bg-white text-slate-300"}`}>
        {warn ? <TriangleAlert size={14} /> : done ? <Check size={14} /> : <Circle size={8} />}
      </span>
      <div className="min-w-0">
        <div className={`font-medium ${done || warn ? "text-slate-900" : "text-slate-400"}`}>{title}</div>
        {detail && <div className="text-sm text-slate-600">{detail}</div>}
        {children}
      </div>
    </li>
  );
}

function Journey({ t, sample }: { t: Tracked; sample: boolean }) {
  const { job } = t;
  const ev = job.events;
  const [err, setErr] = useState("");
  const picked = firstEvent(ev, "Picked"), loaded = [...ev].reverse().find((e) => e.status === "Loaded"), delivered = firstEvent(ev, "Delivered"), done = firstEvent(ev, "Completed");
  const failed = [...ev].reverse().find((e) => e.status === "Failed");
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-xl font-semibold text-slate-900">{job.docNo}</div>
          <div className="text-sm text-slate-600">{job.customerName} · {job.customer} · invoice date {job.docDate || "–"} · {job.docCase === "DO" ? "with DO" : "no DO"}</div>
        </div>
        <div className="text-right"><Badge tone={statusTone(job.status)}>{label(job.status)}</Badge><div className="mt-1 font-semibold text-slate-900">RM {money(job.amount)}</div></div>
      </div>
      <ol className="relative mt-5 before:absolute before:bottom-2 before:left-3 before:top-2 before:w-px before:bg-slate-200">
        <Step done title="1. Imported from SAP (Finance)" detail={t.importedFrom ? `${t.importedFrom.file}, ${t.importedFrom.at}` : ev[0] ? `Recorded ${ev[0].at}` : undefined} />
        <Step done={t.credit?.status !== "Waiting"} warn={t.credit?.status === "Rejected"} title="2. Credit check"
          detail={t.credit === null ? "Only Finance sees the credit check." : !t.credit ? "Not held: the customer had nothing overdue, or the salesman is not checked." : t.credit.status === "Waiting" ? "Held: waiting for Finance, Management or a Director to approve." : `${t.credit.status}${t.credit.by ? ` by ${t.credit.by}` : ""}${t.credit.note ? `: “${t.credit.note}”` : ""}`} />
        <Step done={!!picked} title="3. Picked and checked (warehouse)" detail={picked ? `${picked.at}, ${picked.by}` : undefined} />
        <Step done={!!loaded} title="4. Loaded" detail={loaded ? `${loaded.at} · ${vehicleText(job.vehicle) || "–"}${job.route ? `, ${job.route}` : ""}` : undefined} />
        {failed && job.status !== "Completed" && <Step done={false} warn title="Delivery failed" detail={`${failed.at}: ${job.failReason ?? failed.note ?? ""}`} />}
        <Step done={!!delivered} title="5. Delivered, customer signed" detail={delivered ? `${delivered.at}, recorded by ${delivered.by}` : undefined} />
        <Step done={!!done} title="6. Signed document scanned (POD)" detail={done ? `${done.at}, ${done.by} · ${job.podFile ?? ""}` : delivered ? "Waiting for the scan." : undefined}>
          {done && job.podPath && !sample && <button onClick={async () => { const u = await podLink(job.podPath!); if (u) window.open(u, "_blank", "noopener"); else setErr("The scan could not be opened."); }} className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-indigo-700 hover:bg-slate-50"><FileSearch size={15} /> Open the scanned POD</button>}
          {done && sample && <span className="mt-1 block text-xs text-slate-500">(Opening the scan works in the app, not in this preview.)</span>}
          {err && <span role="alert" className="mt-1 block text-sm text-rose-700">{err}</span>}
        </Step>
        <Step done={t.owed === undefined} title="7. Payment" detail={t.owed === null ? "Only Finance and sales see what is owed." : t.owed === undefined ? "Not in the latest aging: paid, or not in the report yet." : `RM ${money(t.owed)} still owed in the latest aging.`} />
      </ol>
      {t.exceptions.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="font-semibold text-amber-900">Exceptions</div>
          <ul className="mt-1 space-y-1 text-amber-900">{t.exceptions.map((e) => <li key={e.id}>{e.at} · <b>{e.kind}</b>: {e.detail}{e.noteNo ? ` · note ${e.noteNo}` : ""} · {e.status === "Open" ? "open" : `settled: ${e.resolution ?? ""}`}</li>)}</ul>
        </div>
      )}
      {ev.length > 0 && (
        <details className="mt-4 text-sm"><summary className="cursor-pointer text-slate-600">Full history ({ev.length})</summary>
          <ol className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3">{ev.map((e, i) => <li key={i}><span className="font-medium text-slate-900">{e.status}</span> <span className="text-slate-500">· {e.at} · {e.by}{e.note ? ` · ${e.note}` : ""}</span></li>)}</ol>
        </details>
      )}
    </Card>
  );
}

/** Follow any invoice from the SAP import to the signed, scanned proof of delivery. */
export default function Tracker() {
  const sample = useDeliverySample();
  const [q, setQ] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("q") ?? ""));
  const [list, setList] = useState<Tracked[]>([]);
  const [pick, setPick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [searched, setSearched] = useState(false);

  async function run(text = q) {
    setBusy(true); setMsg("");
    const r = sample ? { list: sampleSearch(text), error: null } : await liveSearch(text);
    setBusy(false); setSearched(true); setList(r.list); setPick(0);
    if (r.error) setMsg(r.error);
    else if (!sample && text.trim().length < 2) setMsg("Type at least 2 letters or digits.");
  }
  // a link like /tracker?q=S159525 opens that invoice straight away
  useEffect(() => {
    if (!q.trim()) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the first search runs once, from the link
    void run(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <PageHeader title="Invoice tracker" sub="Follow any invoice from the SAP import to the signed, scanned proof of delivery. You see the invoices your role allows."
        right={<Link href="/workflow" className="text-sm text-indigo-600 hover:underline">How the workflow runs</Link>} />
      {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data, not real invoices.</p>}
      <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="flex max-w-xl gap-2">
        <label className="relative flex-1"><span className="sr-only">Invoice or customer</span>
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input autoFocus className={`${inputCls} !mt-0 !pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Invoice number or customer name" />
        </label>
        <button disabled={busy} className={btnPrimary}>{busy ? "Searching…" : "Search"}</button>
      </form>
      {msg && <p role="alert" className="mt-3 text-sm text-rose-700">{msg}</p>}
      {searched && !busy && !msg && list.length === 0 && <p className="mt-4 text-slate-600">No invoice found. Only invoices imported from SAP after the delivery tracking started (20 Nov 2026) are tracked, and you only see those your role allows.</p>}
      {list.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {list.map((t, i) => <button key={t.job.docNo} onClick={() => setPick(i)} className={`rounded-md border px-3 py-1.5 text-left text-sm ${i === pick ? "border-indigo-600 bg-indigo-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}><b className="font-medium">{t.job.docNo}</b> <span className="text-slate-500">{t.job.customerName}</span></button>)}
        </div>
      )}
      {list[pick] && <div className="mt-4 max-w-3xl"><Journey t={list[pick]} sample={sample} /></div>}
    </>
  );
}
