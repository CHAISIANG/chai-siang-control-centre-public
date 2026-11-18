"use client";
import { useState } from "react";
import Link from "next/link";
import { Bell, Check, Circle, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/hr/rules";
import { LEVEL_NAME, STATUS_TONE, type Claim, type ClaimStatus } from "@/lib/claims/rules";
import type { ClaimRole } from "@/lib/claims/sample";
import { useClaims } from "@/lib/claims/store";

// ---------- the store, and whose view the sample shows ----------
export { ClaimsProvider as ClaimsView } from "@/lib/claims/store";
export const useClaimsView = useClaims;
const ROLES: [ClaimRole, string][] = [["employee", "Employee"], ["manager", "Manager"], ["finance", "Finance"], ["director", "Director"]];
export function ClaimsBar() {
  const { role, setRole, meId, data, markRead, reset, live, flash, loading, linked } = useClaims();
  const [open, setOpen] = useState(false);
  const mine = data.notes.filter((n) => n.to === meId);
  const unread = mine.filter((n) => !n.read).length;
  const bell = (
    <div className="relative">
      <button onClick={() => { setOpen(!open); if (!open && unread) markRead(); }} className="relative rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50" aria-label={`Claim updates${unread ? `, ${unread} new` : ""}`}>
        <Bell size={17} />{unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-lg">
          {mine.length === 0 ? <p className="p-3 text-slate-500">No claim updates yet.</p> : mine.slice(0, 8).map((n) => (
            <Link key={n.id} href={n.href} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2 hover:bg-slate-50 ${n.read ? "" : "bg-blue-50/60"}`}><span className="block">{n.text}</span><span className="text-xs text-slate-500">{fmtDate(n.at)}</span></Link>
          ))}
        </div>
      )}
    </div>
  );
  const toast = flash && <div role="status" className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{flash}</div>;
  if (live) return (
    <>
      <div className="mb-3 flex items-center justify-end gap-2">
        {loading && <span className="mr-auto text-sm text-slate-500">Loading claims…</span>}
        {!loading && !linked && <span className="mr-auto rounded-lg bg-amber-50 px-3 py-1.5 text-sm text-amber-900">Your login is not linked to an employee record yet, so you cannot make claims. Ask HR to add you with the same email you sign in with.</span>}
        {bell}
      </div>
      {toast}
    </>
  );
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
      <span className="font-medium">Sample data</span>
      <span className="text-blue-800/80">Viewing as</span>
      <div className="inline-flex flex-wrap rounded-lg border border-blue-300 bg-white p-0.5" role="radiogroup" aria-label="Viewing as">
        {ROLES.map(([k, l]) => <button key={k} role="radio" aria-checked={role === k} onClick={() => { setRole(k); setOpen(false); }} className={`rounded-md px-2.5 py-1 ${role === k ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-blue-50"}`}>{l}</button>)}
      </div>
      <span className="text-blue-800/80">({(data.staff.find((e) => e.id === meId)?.name ?? "").split(" ").slice(0, 2).join(" ")})</span>
      <span className="flex-1" />
      {bell}
      <button onClick={() => { if (confirm("Put all the sample claims back to how they started?")) reset(); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-slate-700 hover:bg-blue-50"><RotateCcw size={15} /> Reset sample</button>
    </div>
  );
}

export const ClaimBadge = ({ s }: { s: ClaimStatus }) => <Badge tone={STATUS_TONE[s]}>{s}</Badge>;

/** The claim's road from sent to paid: done steps ticked, the current one highlighted, later ones grey. */
export function Timeline({ c, levels }: { c: Claim; levels: (1 | 2 | 3)[] }) {
  const done = (lvl: number) => c.steps.find((s) => s.level === lvl && (s.action === "Approved" || s.action === "Rejected"));
  const sent = c.steps.find((s) => s.action === "Submitted");
  const proc = c.steps.find((s) => s.action === "Processing"), paid = c.steps.find((s) => s.action === "Paid");
  const rows: { label: string; state: "done" | "now" | "todo" | "rejected"; who?: string; at?: string; note?: string }[] = [
    { label: "Sent", state: sent ? "done" : c.status === "Draft" ? "now" : "todo", who: sent?.byName, at: sent?.at },
    ...levels.map((l) => {
      const s = done(l);
      const now = (c.status === "Pending manager" && l === 1) || (c.status === "Pending finance" && l === 2) || (c.status === "Pending director" && l === 3);
      return { label: `${LEVEL_NAME[l]} approval`, state: s ? (s.action === "Rejected" ? "rejected" : "done") : now ? "now" : "todo", who: s?.byName, at: s?.at, note: s?.note } as const;
    }),
    { label: "Payment being processed", state: proc ? "done" : c.status === "Approved" ? "now" : "todo", who: proc?.byName, at: proc?.at },
    { label: "Paid", state: paid ? "done" : c.status === "Processing" ? "now" : "todo", at: paid?.at, note: c.payment?.ref ? `Transfer ref ${c.payment.ref}` : undefined },
  ];
  const stoppedAt = rows.findIndex((r) => r.state === "rejected");
  return (
    <ol className="space-y-0">
      {rows.map((r, i) => {
        const after = stoppedAt >= 0 && i > stoppedAt;
        const icon = r.state === "done" ? <Check size={14} /> : r.state === "rejected" ? <X size={14} /> : <Circle size={8} className={r.state === "now" ? "fill-current" : ""} />;
        const tone = r.state === "done" ? "bg-emerald-600 text-white" : r.state === "rejected" ? "bg-rose-600 text-white" : r.state === "now" ? "bg-blue-500 text-white ring-4 ring-blue-100" : "bg-slate-200 text-slate-400";
        return (
          <li key={r.label} className={`relative flex gap-3 pb-4 last:pb-0 ${after ? "opacity-40" : ""}`}>
            {i < rows.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 h-full w-px bg-slate-200" />}
            <span className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${tone}`}>{icon}</span>
            <div className="min-w-0 pt-0.5">
              <div className={`text-sm font-medium ${r.state === "todo" ? "text-slate-500" : "text-slate-900"}`}>{r.label}{r.state === "now" && <span className="ml-2 text-xs font-normal text-blue-600">waiting</span>}</div>
              {(r.who || r.at) && <div className="text-xs text-slate-500">{r.who}{r.who && r.at ? " · " : ""}{r.at ? fmtDate(r.at) : ""}</div>}
              {r.note && <div className={`mt-0.5 text-sm ${r.state === "rejected" ? "text-rose-700" : "text-slate-600"}`}>{r.note}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
