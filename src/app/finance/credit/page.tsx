"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader } from "@/components/ui";
import { Modal, btnGhost, btnPrimary } from "@/components/finui";
import { useData } from "@/components/data";
import { BUCKETS, overdueText, type CreditApproval } from "@/lib/credit";
import { decideCredit, useCreditSample, useCreditStore } from "@/lib/creditStore";
import { useAuth } from "@/components/auth";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s?: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "");

/** Invoices held by the credit check: the customer has overdue payments, so Finance or Management decides whether to go ahead. */
export default function CreditApprovals() {
  const { salesmen } = useData();
  const isSample = useCreditSample();
  const { approvals: list, loading } = useCreditStore(isSample);
  const [busy, setBusy] = useState(false);
  const { profile } = useAuth();
  const [err, setErr] = useState("");
  const [tab, setTab] = useState<"Waiting" | "Decided">("Waiting");
  const [deciding, setDeciding] = useState<{ a: CreditApproval; action: "Approved" | "Rejected" } | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const name = (code: string) => salesmen.find((s) => s.code === code)?.name ?? code;
  const waiting = list.filter((a) => a.status === "Waiting");
  const shown = (tab === "Waiting" ? waiting : list.filter((a) => a.status !== "Waiting")).sort((a, b) => a.askedAt.localeCompare(b.askedAt));

  async function decide() {
    if (!deciding || busy) return;
    const { a, action } = deciding;
    setBusy(true);
    const r = await decideCredit(isSample, a.id, action, profile?.full_name ?? "Finance", note);
    setBusy(false);
    if (!r.ok) { setErr(r.text); return; }
    setErr(""); setMsg(r.text); setDeciding(null); setNote("");
  }

  return (
    <>
      <PageHeader title="Credit approvals" sub="Invoices held because the customer has overdue payments (salesmen 04, 11, 17, 21, 22). Approve to let them go into the import file, or reject to keep them out." />
      {isSample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample data, kept in this browser only.</p>}
      <KpiStrip cols="lg:grid-cols-3">
        <Kpi label="Waiting for approval" value={String(waiting.length)} tone={waiting.length ? "warn" : "good"} sub={`RM ${money(waiting.reduce((s, a) => s + a.amount, 0))} of invoices held`} />
        <Kpi label="Overdue behind them" value={`RM ${money(waiting.reduce((s, a) => s + a.overdue, 0))}`} tone={waiting.length ? "bad" : "neutral"} sub="Past due on those customers" />
        <Kpi label="Decided" value={String(list.length - waiting.length)} sub="Approved or rejected" />
      </KpiStrip>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-sm">
          {(["Waiting", "Decided"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded px-3 py-1 ${tab === t ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t === "Waiting" ? `Waiting (${waiting.length})` : "Decided"}</button>)}
        </div>
      </div>
      {msg && <p role="status" className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{msg}</p>}

      <div className="mt-3 space-y-3">
        {shown.length === 0 && <Card><p className="py-6 text-center text-slate-500">{loading ? "Loading…" : tab === "Waiting" ? "Nothing waiting. No held invoices." : "Nothing decided yet."}</p></Card>}
        {shown.map((a) => (
          <Card key={a.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><span className="text-lg font-semibold text-slate-900">{a.customerName}</span><span className="text-sm text-slate-500">{a.customer}</span>{a.status !== "Waiting" && <Badge tone={a.status === "Approved" ? "green" : "red"}>{a.status}</Badge>}</div>
                <div className="text-sm text-slate-600">Invoice <b className="font-medium text-slate-900">{a.docNo}</b> · RM {money(a.amount)} · salesman {name(a.salesRep)} ({a.salesRep.slice(-2)}) · from {a.file}</div>
                <div className="text-sm text-slate-500">Asked by {a.askedBy} on {day(a.askedAt)}{a.note ? `: “${a.note}”` : ""}</div>
              </div>
              <div className="text-right"><div className="text-sm font-semibold text-rose-700">{overdueText(a)}</div><div className="text-xs text-slate-500">aging of {day(a.asAt ?? undefined)}</div></div>
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1 text-center text-xs">
              {BUCKETS.map((b, i) => (
                <div key={b} className={`rounded px-1 py-1.5 ${a.buckets[i] ? (i === 0 ? "bg-slate-100 text-slate-700" : i >= 3 ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-900") : "bg-slate-50 text-slate-400"}`}>
                  <div>{b}</div><div className="font-semibold">{a.buckets[i] ? money(a.buckets[i]) : "–"}</div>
                </div>
              ))}
            </div>
            {a.status === "Waiting" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => { setDeciding({ a, action: "Approved" }); setNote(""); }} className={`${btnPrimary} inline-flex items-center gap-1.5`}><Check size={16} /> Approve</button>
                <button onClick={() => { setDeciding({ a, action: "Rejected" }); setNote(""); }} className={`${btnGhost} inline-flex items-center gap-1.5 !text-rose-700`}><X size={16} /> Reject</button>
              </div>
            ) : <p className="mt-3 text-sm text-slate-600">{a.status} by {a.decidedBy} on {day(a.decidedAt)}{a.decisionNote ? `: “${a.decisionNote}”` : ""}</p>}
          </Card>
        ))}
      </div>

      {deciding && (
        <Modal title={deciding.action === "Approved" ? `Approve ${deciding.a.docNo}?` : `Reject ${deciding.a.docNo}?`} onClose={() => setDeciding(null)}>
          <p className="text-sm text-slate-600">{deciding.action === "Approved" ? "The invoice can go into the import file even though the customer has overdue payments." : "The invoice stays out of the import file. The sales rep sees your reason."}</p>
          <label className="mt-3 block text-sm font-medium text-slate-700">{deciding.action === "Approved" ? "Note (optional)" : "Reason (required)"}<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" placeholder={deciding.action === "Approved" ? "For example: cheque received" : "For example: collect the 90-day amount first"} autoFocus /></label>
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setDeciding(null)} className={btnGhost}>Cancel</button><button disabled={busy || (deciding.action === "Rejected" && !note.trim())} onClick={decide} className={deciding.action === "Approved" ? btnPrimary : `${btnPrimary} !bg-rose-600 hover:!bg-rose-700`}>{deciding.action === "Approved" ? "Approve" : "Reject"}</button></div>
        </Modal>
      )}
    </>
  );
}
