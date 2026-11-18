"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Paperclip } from "lucide-react";
import { Card } from "@/components/ui";
import { btnBlue, btnLine } from "@/components/hr/ui";
import { ClaimBadge, Timeline } from "@/components/claims/ui";
import { fmtDate } from "@/lib/hr/rules";
import { claimTax, rm, taxPortion, TAXES, total } from "@/lib/claims/rules";
import { checkClaim } from "@/lib/claims/sample";
import { routeFor, useClaims } from "@/lib/claims/store";

/** One claim: items, receipts, approval timeline and payment. */
export function ClaimDetail({ id }: { id: string }) {
  const { data, meId, receiptLink, live } = useClaims();
  const [note, setNote] = useState("");
  const person = (eid: string) => data.staff.find((e) => e.id === eid)!;
  const catName = (code: string) => data.categories.find((x) => x.code === code)?.name ?? code;
  const bankOf = (eid: string) => data.banks.find((b) => b.empId === eid);
  const c = data.claims.find((x) => x.id === id);
  if (!c) return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">That claim was not found. <Link href="/hr/claims" className="font-medium text-blue-600 hover:underline">Back to my claims</Link></p>;
  const who = person(c.empId);
  // the steps this claim really went through: the ones already taken, plus what its route still needs
  const levels = (c.route?.length ? c.route : [...new Set([...c.steps.filter((x) => x.level).map((x) => x.level!), ...routeFor(data, c.empId).map((r) => r.level)])].sort()) as (1 | 2 | 3)[];
  const mine = c.empId === meId;
  const bank = bankOf(c.empId);
  const warnings = c.status === "Draft" ? [] : checkClaim(c, data.claims, data.categories, data.settings);
  const rejected = c.steps.find((s) => s.action === "Rejected");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/hr/claims" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> My claims</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">{c.title}</h1>
          <p className="text-slate-500">{c.no} · {who.name} · {who.dept}</p>
        </div>
        <div className="text-right"><div className="font-display text-3xl font-semibold text-slate-900">{rm(total(c))}</div><ClaimBadge s={c.status} /></div>
      </div>

      {rejected && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <p className="font-medium">Rejected by {rejected.byName} on {fmtDate(rejected.at)}</p>
          {rejected.note && <p className="mt-1">“{rejected.note}”</p>}
          {mine && <><p className="mt-2 text-sm">A sent claim cannot be changed. You can copy it into a new claim, fix it and send that instead.</p>
          <Link href={`/hr/claims/new?copy=${c.id}`} className={`${btnBlue} mt-3 !py-2 text-sm`}>Copy into a new claim</Link></>}
        </div>
      )}

      {note && <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{note}</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card title="Items">
          <ul className="divide-y divide-slate-100">
            {c.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{i.desc || catName(i.cat)}</div>
                  <div className="text-sm text-slate-500">{fmtDate(i.date)} · {catName(i.cat)}{i.km ? ` · ${i.km} km` : ""}{i.tax !== "none" ? ` · ${TAXES.find((t) => t.code === i.tax)!.label}` : ""}</div>
                  {i.receipt ? <button onClick={async () => { const u = await receiptLink(i.receipt!); if (u) window.open(u, "_blank", "noopener"); else setNote(live ? "The receipt could not be opened." : "Sample receipt: in the live system this opens the photo."); }} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"><Paperclip size={14} /> Receipt</button> : i.cat !== "MIL" && <span className="mt-1 block text-sm text-amber-700">No receipt</span>}
                </div>
                <div className="text-right">
                  <div className="font-medium text-slate-900">{rm(i.amount)}</div>
                  {i.tax !== "none" && <div className="text-xs text-slate-500">SST {taxPortion(i.amount, i.tax).toFixed(2)}</div>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm"><span className="text-slate-600">SST included</span><span>{rm(claimTax(c))}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{rm(total(c))}</span></div>
          {warnings.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">Flags for the approvers</p>
              <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w.text}>{w.text}</li>)}</ul>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Approval">
            <Timeline c={c} levels={levels} />
          </Card>
          <Card title="Payment">
            {c.payment?.ref ? (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Paid on</dt><dd>{c.payment.paidAt ? fmtDate(c.payment.paidAt) : "–"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Method</dt><dd>{c.payment.method}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Reference</dt><dd className="font-medium">{c.payment.ref}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">To</dt><dd>{bank ? `${bank.bank} ····${bank.accountNo.replace(/\s/g, "").slice(-4)}` : "–"}</dd></div>
              </dl>
            ) : c.status === "Processing" ? <p className="text-sm text-slate-600">In this month&apos;s payment run{bank ? `, to ${bank.bank} ····${bank.accountNo.replace(/\s/g, "").slice(-4)}` : ""}.</p>
              : <p className="text-sm text-slate-500">Paid by bank transfer once all approvals are done.{!bank && " Add your bank details on My claims first."}</p>}
          </Card>
          <Link href="/hr/claims" className={`${btnLine} w-full`}>Back to my claims</Link>
        </div>
      </div>
    </div>
  );
}
