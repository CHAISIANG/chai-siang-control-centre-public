"use client";
import { useState } from "react";
import Link from "next/link";
import { BellRing, Download, ShieldAlert } from "lucide-react";
import { Badge, Card, Td, Th } from "@/components/ui";
import { BUCKETS, overdueText, type ApprovalStatus, type CreditCase } from "@/lib/credit";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tone: Record<ApprovalStatus | "Not asked", "amber" | "green" | "red" | "grey"> = { "Not asked": "grey", Waiting: "amber", Approved: "green", Rejected: "red" };

/** The credit check for one upload: overdue customers whose invoices wait for approval, and supermarkets whose sales rep is reminded. */
export function CreditCheck({ cases, status, salesmanName, onAsk, onDownloadApproved, approvedReady }: {
  cases: CreditCase[];
  status: Record<string, ApprovalStatus | undefined>;
  salesmanName: (code: string) => string;
  onAsk: (docs: string[], note: string) => void;
  onDownloadApproved: () => void;
  approvedReady: number;
}) {
  const [note, setNote] = useState("");
  if (!cases.length) return null;
  const held = cases.filter((c) => c.kind === "approval");
  const reminders = cases.filter((c) => c.kind === "reminder");
  // not asked yet, or rejected before: can be asked (again)
  const notAsked = held.filter((c) => !status[c.docNo] || status[c.docNo] === "Rejected").map((c) => c.docNo);
  const waiting = held.filter((c) => status[c.docNo] !== "Approved");
  return (
    <Card className="mt-4" title="Credit check" right={<span className="text-sm text-slate-500">Salesmen 04, 11, 17, 21, 22 · customers with anything past due</span>}>
      {held.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="flex items-start gap-2"><ShieldAlert size={18} className="mt-0.5 shrink-0" /><span><b className="font-semibold">{waiting.length} of {held.length} {held.length === 1 ? "invoice is" : "invoices are"} held</b> because the customer has overdue payments. {waiting.length ? "They are left out of the import file until Finance or Management approves them." : "All approved: they are in the file."}</span></p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {notAsked.length > 0 && <>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note for the approver (optional)" className="min-w-0 flex-1 rounded-md border border-amber-300 bg-white px-2.5 py-1.5 sm:max-w-xs" aria-label="Note for the approver" />
              <button onClick={() => { onAsk(notAsked, note); setNote(""); }} className="rounded-md bg-amber-600 px-3 py-1.5 font-medium text-white hover:bg-amber-700">Ask for approval ({notAsked.length})</button>
            </>}
            <Link href="/finance/credit" className="font-medium text-amber-900 underline">Open Credit approvals</Link>
            {approvedReady > 0 && <button onClick={onDownloadApproved} className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-amber-300 bg-white px-3 py-1.5 font-medium text-slate-800 hover:bg-amber-100"><Download size={16} /> Download approved invoices ({approvedReady})</button>}
          </div>
        </div>
      )}
      {reminders.length > 0 && (
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900"><BellRing size={18} className="mt-0.5 shrink-0" /><span><b className="font-semibold">{reminders.length} supermarket {reminders.length === 1 ? "invoice" : "invoices"}</b> with overdue payments {reminders.length === 1 ? "goes" : "go"} into the file as normal. When you make the import file, the sales rep is reminded to follow up the payment.</span></p>
      )}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Customer</Th><Th>Salesman</Th><Th right>This invoice</Th><Th>Aging</Th><Th>Status</Th></tr></thead>
          <tbody>
            {cases.map((c) => {
              const s = status[c.docNo];
              return (
                <tr key={c.docNo} className="border-b border-slate-100 align-top">
                  <Td first className="whitespace-nowrap">{c.docNo}</Td>
                  <Td>{c.customerName}<div className="text-sm text-slate-500">{c.customer}{c.aging.channel ? ` · ${c.aging.channel}` : ""}</div></Td>
                  <Td>{salesmanName(c.salesRep)}<div className="text-sm text-slate-500">{c.salesRep.slice(-2)}</div></Td>
                  <Td right>{money(c.amount)}</Td>
                  <Td>
                    <div className="text-sm font-medium text-rose-700">{overdueText(c.aging)}</div>
                    <div className="text-xs text-slate-500">owes RM {money(c.aging.owed)} · {c.aging.buckets.map((b, i) => (b ? `${BUCKETS[i]}: ${money(b)}` : "")).filter(Boolean).join(" · ")}</div>
                  </Td>
                  <Td>
                    {c.kind === "reminder" ? <Badge tone="blue">Reminder to sales rep</Badge> : <Badge tone={tone[s ?? "Not asked"]}>{s === "Waiting" ? "Waiting for approval" : s === "Rejected" ? "Rejected: stays out" : s ?? "Held, not asked yet"}</Badge>}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-500">Aging from the report of {cases[0]?.aging.asAt ?? "–"}. Upload a newer aging report on Data upload if customers have paid since.</p>
    </Card>
  );
}
