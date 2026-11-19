"use client";
import { BellRing } from "lucide-react";
import { Card } from "@/components/ui";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { overdueText } from "@/lib/credit";
import { seenReminder, useCreditSample, useCreditStore } from "@/lib/creditStore";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Reminders for the sales rep: a supermarket with overdue payments was invoiced, so chase the payment. */
export function CreditReminders() {
  const { filterSalesman } = useRole();
  const { salesmen } = useData();
  const isSample = useCreditSample();
  const { reminders: list } = useCreditStore(isSample);
  // a salesman sees their own; management and supervisors see everyone's
  const mine = list.filter((r) => !filterSalesman || r.salesRep === filterSalesman);
  const open = mine.filter((r) => !r.seen);
  if (!mine.length) return null;
  const name = (code: string) => salesmen.find((s) => s.code === code)?.name ?? code;
  return (
    <Card className="mb-4" title="Payment reminders from Finance" right={isSample ? <span className="text-sm text-slate-500">Sample data</span> : undefined}>
      <ul className="divide-y divide-slate-100">
        {mine.map((r) => (
          <li key={r.id} className={`flex flex-wrap items-start justify-between gap-3 py-2.5 ${r.seen ? "opacity-60" : ""}`}>
            <span className="flex min-w-0 items-start gap-2">
              <BellRing size={18} className={`mt-0.5 shrink-0 ${r.seen ? "text-slate-400" : "text-blue-500"}`} />
              <span className="min-w-0">
                <b className="font-medium text-slate-900">{r.customerName}</b> was invoiced RM {money(r.amount)} ({r.docNo}) while it has <span className="font-medium text-rose-700">{overdueText(r)}</span>. Please follow up the payment.
                <span className="block text-xs text-slate-500">{r.customer}{!filterSalesman ? ` · ${name(r.salesRep)}` : ""} · {r.at}</span>
              </span>
            </span>
            {!r.seen && <button onClick={() => void seenReminder(isSample, r.id)} className="shrink-0 rounded-md border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50">Got it</button>}
          </li>
        ))}
      </ul>
      {open.length === 0 && <p className="mt-1 text-xs text-slate-500">All reminders seen.</p>}
    </Card>
  );
}
