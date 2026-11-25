"use client";
import { useState } from "react";
import Link from "next/link";
import { Download, Landmark } from "lucide-react";
import { Card, Td, Th } from "@/components/ui";
import { Modal, Stat, btnBlue, btnLine, field } from "@/components/hr/ui";
import { ClaimBadge } from "@/components/claims/ui";
import { fmtDate } from "@/lib/hr/rules";
import { rm, total } from "@/lib/claims/rules";
import { TODAY } from "@/lib/claims/sample";
import { useClaims } from "@/lib/claims/store";
import { useT } from "@/lib/i18n";

type Tab = "Approved" | "Processing" | "Paid";
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export default function ClaimPayments() {
  const { t } = useT();
  const { data, markProcessing, markPaid, isFinance, live: isLive } = useClaims();
  const person = (id: string) => data.staff.find((e) => e.id === id)!;
  const bankOf = (id: string) => data.banks.find((b) => b.empId === id);
  const [tab, setTab] = useState<Tab>("Approved");
  const [err, setErr] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [paying, setPaying] = useState<string[] | null>(null);
  const [ref, setRef] = useState("");
  const [paidAt, setPaidAt] = useState(TODAY);
  const [msg, setMsg] = useState("");

  if (!isFinance) return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{t(isLive ? "Payments are for Finance. Ask for the Finance role in Users." : "Payments are for Finance. Switch “Viewing as” above to Finance to see them.")}</p>;
  const all = data.claims;
  const list = all.filter((c) => c.status === tab).sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
  const sum = (s: Tab) => all.filter((c) => c.status === s).reduce((acc, c) => acc + total(c), 0);
  const noBank = list.filter((c) => !bankOf(c.empId));
  const live = picked.filter((id) => list.some((c) => c.id === id));

  function exportCsv(ids: string[]) {
    const rows = all.filter((c) => ids.includes(c.id));
    const head = ["Claim no", "Employee code", "Name", "Bank", "Account name", "Account number", "Amount (RM)", "Payment reference"];
    const body = rows.map((c) => { const b = bankOf(c.empId), e = person(c.empId); return [c.no, e.code, e.name, b?.bank ?? "", b?.accountName ?? "", (b?.accountNo ?? "").replace(/\s/g, ""), total(c).toFixed(2), `CLAIM ${c.no}`]; });
    const text = "﻿" + [head, ...body].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: `Claim payments ${TODAY}.csv` }).click();
    URL.revokeObjectURL(url);
  }
  async function processing(ids: string[]) {
    const r = await markProcessing(ids);
    if (r.ok) { setPicked([]); setMsg(r.text); setErr(""); } else setErr(r.text);
  }
  async function paid() {
    if (!paying) return;
    const r = await markPaid(paying, ref, paidAt);
    if (!r.ok) { setErr(r.text); return; }
    setMsg(r.text); setErr(""); setPaying(null); setRef(""); setPicked([]);
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">{t("Claim payments")}</h1>
      <p className="text-slate-500">{t("Claims approved at all three steps, ready to pay by bank transfer.")}</p>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label={t("To pay")} value={String(all.filter((c) => c.status === "Approved").length)} sub={rm(sum("Approved"))} tone="amber" />
        <Stat label={t("Processing")} value={String(all.filter((c) => c.status === "Processing").length)} sub={rm(sum("Processing"))} tone="blue" />
        <Stat label={t("Paid this month")} value={String(all.filter((c) => c.status === "Paid" && (c.payment?.paidAt ?? "").startsWith(TODAY.slice(0, 7))).length)} sub={rm(all.filter((c) => c.status === "Paid" && (c.payment?.paidAt ?? "").startsWith(TODAY.slice(0, 7))).reduce((acc, c) => acc + total(c), 0))} tone="green" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">
          {(["Approved", "Processing", "Paid"] as Tab[]).map((tb) => <button key={tb} onClick={() => { setTab(tb); setPicked([]); }} className={`rounded-md px-3 py-1.5 ${tab === tb ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{t(tb === "Approved" ? "To pay" : tb)}</button>)}
        </div>
        <div className="flex flex-wrap gap-2">
          {tab !== "Paid" && <button disabled={!live.length} onClick={() => exportCsv(live)} className={`${btnLine} !py-2 text-sm`}><Download size={16} /> {t("Export payment CSV")}</button>}
          {tab === "Approved" && <button disabled={!live.length} onClick={() => processing(live)} className={`${btnLine} !py-2 text-sm`}>{t("Mark processing")}</button>}
          {tab !== "Paid" && <button disabled={!live.length} onClick={() => setPaying(live)} className={`${btnBlue} !py-2 text-sm`}><Landmark size={16} /> {t("Mark paid")}</button>}
        </div>
      </div>
      {msg && <p role="status" className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{t(msg)}</p>}
      {err && !paying && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{t(err)}</p>}
      {noBank.length > 0 && tab !== "Paid" && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{t("No bank details for")} {[...new Set(noBank.map((c) => person(c.empId).name))].join(", ")}. {t("Ask them to add their bank on My expense claims before paying.")}</p>}

      <Card className="mt-3">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr>{tab !== "Paid" && <Th first><input type="checkbox" aria-label={t("Select all")} checked={list.length > 0 && list.every((c) => picked.includes(c.id))} onChange={(e) => setPicked(e.target.checked ? list.map((c) => c.id) : [])} className="h-4 w-4" /></Th>}<Th first={tab === "Paid"}>Claim</Th><Th>Employee</Th><Th>Bank account</Th><Th right>Amount</Th><Th>{tab === "Paid" ? "Paid" : "Approved"}</Th><Th>Status</Th></tr></thead>
            <tbody>
              {list.length === 0 && <tr><Td first className="text-slate-500">{t("Nothing here.")}</Td></tr>}
              {list.map((c) => {
                const b = bankOf(c.empId), e = person(c.empId);
                const last = c.steps.filter((s) => s.action === "Approved").slice(-1)[0];
                return (
                  <tr key={c.id} className="border-b border-slate-100">
                    {tab !== "Paid" && <Td first><input type="checkbox" checked={picked.includes(c.id)} onChange={(x) => setPicked((p) => (x.target.checked ? [...p, c.id] : p.filter((y) => y !== c.id)))} className="h-4 w-4" aria-label={`${t("Select")} ${c.no}`} /></Td>}
                    <Td first={tab === "Paid"}><Link href={`/hr/claims/${c.id}`} className="font-medium text-blue-700 hover:underline">{c.no}</Link><div className="text-sm text-slate-500">{c.title}</div></Td>
                    <Td>{e.name}<div className="text-sm text-slate-500">{e.code} · {e.dept}</div></Td>
                    <Td>{b ? <>{b.bank}<div className="text-sm text-slate-500">{b.accountNo} · {b.accountName}</div></> : <span className="text-rose-700">{t("Missing")}</span>}</Td>
                    <Td right className="font-medium">{rm(total(c))}</Td>
                    <Td className="whitespace-nowrap">{tab === "Paid" ? <>{c.payment?.paidAt ? fmtDate(c.payment.paidAt) : "–"}<div className="text-sm text-slate-500">{c.payment?.ref}</div></> : last ? fmtDate(last.at) : "–"}</Td>
                    <Td><ClaimBadge s={c.status} /></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="mt-2 text-xs text-slate-500">{t("The CSV lists bank, account name, account number and amount for each claim, ready for your bank's bulk payment upload. It opens correctly in Excel.")}</p>

      {paying && (
        <Modal title={paying.length === 1 ? t("Mark this claim paid") : t("Mark {n} claims paid", { n: paying.length })} onClose={() => setPaying(null)}>
          <p className="text-sm text-slate-600">{t("Total")} {rm(all.filter((c) => paying.includes(c.id)).reduce((acc, c) => acc + total(c), 0))}. {t("The employees see the reference on their claim.")}</p>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm font-medium text-slate-700">
            <label className="col-span-2">{t("Transfer reference")}<input value={ref} onChange={(e) => setRef(e.target.value)} placeholder={t("For example: IBG 4482910")} className={field} autoFocus /></label>
            <label>{t("Paid on")}<input type="date" value={paidAt} max={TODAY} onChange={(e) => setPaidAt(e.target.value)} className={field} /></label>
          </div>
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{t(err)}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => { setPaying(null); setErr(""); }} className={btnLine}>{t("Cancel")}</button><button disabled={!ref.trim()} onClick={paid} className={btnBlue}>{t("Mark paid")}</button></div>
        </Modal>
      )}
    </div>
  );
}
