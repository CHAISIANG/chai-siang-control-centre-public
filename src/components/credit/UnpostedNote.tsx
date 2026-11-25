"use client";
import { useState } from "react";
import { Receipt } from "lucide-react";
import { realOverdue, unpostedTotal, type Unposted } from "@/lib/credit";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (s: string) => new Date(`${s}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Receipts that are in the daily payment file but not posted in the aging yet. Shown next to the overdue amount so
 * Finance can see the customer may already have paid. The aging itself is not changed and approval is still Finance's call.
 */
export function UnpostedNote({ overdue, unposted, supermarket }: { overdue: number; unposted?: Unposted[]; supermarket?: boolean }) {
  const [open, setOpen] = useState(false);
  if (supermarket) return <p className="mt-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">Supermarket: payments are settled from the collection summary twice a month, so this aging can be higher than what is really owed.</p>;
  if (!unposted?.length) return null;
  const got = unpostedTotal(unposted);
  const left = realOverdue(overdue, unposted);
  const looksPaid = left === 0;
  return (
    <div className={`mt-2 rounded-md border px-2.5 py-1.5 text-sm ${looksPaid ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-sky-200 bg-sky-50 text-sky-900"}`}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Receipt size={15} className="shrink-0" />
        <span><b className="font-semibold">RM {money(got)} received, not posted yet.</b> {looksPaid ? "Looks fully paid: check it is posted before you approve." : `About RM ${money(left)} is still overdue after that.`}</span>
        <button onClick={() => setOpen(!open)} className="ml-auto text-xs font-medium underline" aria-expanded={open}>{open ? "Hide receipts" : "Show receipts"}</button>
      </div>
      {open && (
        <table className="mt-1.5 w-full text-xs">
          <thead className="text-left opacity-70"><tr><th className="py-0.5 pr-2 font-medium">Invoice</th><th className="py-0.5 pr-2 font-medium">Receipt</th><th className="py-0.5 pr-2 font-medium">Date</th><th className="py-0.5 text-right font-medium">Received (RM)</th></tr></thead>
          <tbody>{unposted.map((u) => <tr key={`${u.docNo}-${u.receipt}`} className="border-t border-black/5"><td className="py-0.5 pr-2">{u.docNo}</td><td className="py-0.5 pr-2">{u.receipt}</td><td className="py-0.5 pr-2">{day(u.date)}</td><td className="py-0.5 text-right tabular-nums">{money(u.paid)}</td></tr>)}</tbody>
        </table>
      )}
      <p className="mt-1 text-xs opacity-75">From the daily payment file. The aging is not changed until Finance posts the receipt.</p>
    </div>
  );
}
