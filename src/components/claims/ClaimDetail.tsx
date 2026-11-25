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
import { useT } from "@/lib/i18n";

/** One claim: items, receipts, approval timeline and payment. */
export function ClaimDetail({ id }: { id: string }) {
  const { t } = useT();
  const { data, meId, receiptLink, live } = useClaims();
  const [note, setNote] = useState("");
  const person = (eid: string) => data.staff.find((e) => e.id === eid)!;
  const catName = (code: string) => t(data.categories.find((x) => x.code === code)?.name ?? code);
  const bankOf = (eid: string) => data.banks.find((b) => b.empId === eid);
  const c = data.claims.find((x) => x.id === id);
  if (!c) return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{t("That claim was not found.")} <Link href="/hr/claims" className="font-medium text-blue-600 hover:underline">{t("Back to my claims")}</Link></p>;
  const who = person(c.empId);
  // the steps this claim really went through: the ones already taken, plus what its route still needs
  const levels = (c.route?.length ? c.route : [...new Set([...c.steps.filter((x) => x.level).map((x) => x.level!), ...routeFor(data, c.empId).map((r) => r.level)])].sort()) as (1 | 2 | 3)[];
  const mine = c.empId === meId;
  const bank = bankOf(c.empId);
  const warnings = c.status === "Draft" ? [] : checkClaim(c, data.claims, data.categories, data.settings);
  const rejected = c.steps.find((s) => s.action === "Rejected");

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/hr/claims" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"><ArrowLeft size={16} /> {t("My claims")}</Link>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-slate-900">{c.title}</h1>
          <p className="text-slate-500">{c.no} · {who.name} · {who.dept}</p>
        </div>
        <div className="text-right"><div className="font-display text-3xl font-semibold text-slate-900">{rm(total(c))}</div><ClaimBadge s={c.status} /></div>
      </div>

      {rejected && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <p className="font-medium">{t("Rejected by {name} on {date}", { name: rejected.byName, date: fmtDate(rejected.at) })}</p>
          {rejected.note && <p className="mt-1">“{rejected.note}”</p>}
          {mine && <><p className="mt-2 text-sm">{t("A sent claim cannot be changed. You can copy it into a new claim, fix it and send that instead.")}</p>
          <Link href={`/hr/claims/new?copy=${c.id}`} className={`${btnBlue} mt-3 !py-2 text-sm`}>{t("Copy into a new claim")}</Link></>}
        </div>
      )}

      {note && <p role="status" className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">{note}</p>}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_300px]">
        <Card title={t("Items")}>
          <ul className="divide-y divide-slate-100">
            {c.items.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{i.desc || catName(i.cat)}</div>
                  <div className="text-sm text-slate-500">{fmtDate(i.date)} · {catName(i.cat)}{i.km ? ` · ${i.km} km` : ""}{i.tax !== "none" ? ` · ${t(TAXES.find((x) => x.code === i.tax)!.label)}` : ""}</div>
                  {i.receipt ? <button onClick={async () => { const u = await receiptLink(i.receipt!); if (u) window.open(u, "_blank", "noopener"); else setNote(t(live ? "The receipt could not be opened." : "Sample receipt: in the live system this opens the photo.")); }} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"><Paperclip size={14} /> {t("Receipt")}</button> : i.cat !== "MIL" && <span className="mt-1 block text-sm text-amber-700">{t("No receipt")}</span>}
                </div>
                <div className="text-right">
                  <div className="font-medium text-slate-900">{rm(i.amount)}</div>
                  {i.tax !== "none" && <div className="text-xs text-slate-500">SST {taxPortion(i.amount, i.tax).toFixed(2)}</div>}
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 text-sm"><span className="text-slate-600">{t("SST included")}</span><span>{rm(claimTax(c))}</span></div>
          <div className="flex justify-between text-base font-semibold"><span>{t("Total")}</span><span>{rm(total(c))}</span></div>
          {warnings.length > 0 && (
            <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-medium">{t("Flags for the approvers")}</p>
              <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w.text}>{t(w.text)}</li>)}</ul>
            </div>
          )}
        </Card>

        <div className="space-y-4">
          <Card title={t("Approval")}>
            <Timeline c={c} levels={levels} />
          </Card>
          <Card title={t("Payment")}>
            {c.payment?.ref ? (
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">{t("Paid on")}</dt><dd>{c.payment.paidAt ? fmtDate(c.payment.paidAt) : "–"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">{t("Method")}</dt><dd>{c.payment.method}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">{t("Reference")}</dt><dd className="font-medium">{c.payment.ref}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">{t("To")}</dt><dd>{bank ? `${bank.bank} ····${bank.accountNo.replace(/\s/g, "").slice(-4)}` : "–"}</dd></div>
              </dl>
            ) : c.status === "Processing" ? <p className="text-sm text-slate-600">{t("In this month's payment run")}{bank ? `, ${t("to")} ${bank.bank} ····${bank.accountNo.replace(/\s/g, "").slice(-4)}` : ""}.</p>
              : <p className="text-sm text-slate-500">{t("Paid by bank transfer once all approvals are done.")}{!bank && ` ${t("Add your bank details on My claims first.")}`}</p>}
          </Card>
          <Link href="/hr/claims" className={`${btnLine} w-full`}>{t("Back to my claims")}</Link>
        </div>
      </div>
    </div>
  );
}
