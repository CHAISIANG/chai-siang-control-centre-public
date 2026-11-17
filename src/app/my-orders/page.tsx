"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, Minus, Plus, Printer, X } from "lucide-react";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { btnGhost, btnPrimary } from "@/components/finui";
import { NewPoModal } from "@/components/PoForms";
import { usePo } from "@/components/po";
import { useRole } from "@/components/role";
import { creditDue, lineMatch, orderState, rmFmt, summary, type Match, type Po } from "@/lib/po";

const Mark = ({ k }: { k: Match["icon"] }) => (k === "ok" ? <Check size={16} className="shrink-0 text-emerald-600" /> : k === "bad" ? <X size={16} className="shrink-0 text-rose-600" /> : k === "warn" ? <AlertTriangle size={16} className="shrink-0 text-amber-600" /> : <Minus size={16} className="shrink-0 text-slate-400" />);
const pct = (n: number) => `${n.toFixed(0)}%`;

export default function MyOrders() {
  const { pos, addCopy, fileUrl, raiseCredit, canManage } = usePo();
  const { can } = useRole();
  const [open, setOpen] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Po | null>(null);
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = { ok: pos.filter((o) => orderState(o) === "ok").length, check: pos.filter((o) => orderState(o) === "check").length, wait: pos.filter((o) => orderState(o) === "wait").length };
  const t = summary(pos);
  const owed = pos.filter((o) => creditDue(o) > 0);
  const view = async (path: string) => { const u = await fileUrl(path); if (u) window.open(u, "_blank", "noopener"); else setErr("The file could not be opened."); };

  return (
    <>
      <div className="no-print">
        <PageHeader title="My PO orders" sub="Check each customer PO against its invoice and what was delivered." right={<button onClick={() => setAdding(true)} className={`${btnPrimary} inline-flex items-center gap-1`}><Plus size={18} /> Key in PO</button>} />
        {err && <p role="alert" className="mb-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
        <div className="mb-3 grid grid-cols-3 gap-3">
          {([["Matched", n.ok, "text-emerald-700"], ["Needs checking", n.check, "text-rose-700"], ["Waiting for delivery", n.wait, "text-slate-700"]] as const).map(([l, v, c]) => (
            <div key={l} className="rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3"><div className="text-[15px] text-slate-500">{l}</div><div className={`font-display text-[32px] font-semibold leading-tight ${c}`}>{v}</div></div>
          ))}
        </div>
        <div className="mb-4 rounded-xl border border-slate-200 bg-white shadow-sm px-4 py-3 text-[15px] text-slate-700">
          <b>Service level</b> over {t.delivered} delivered order{t.delivered === 1 ? "" : "s"}: on time {pct(t.onTime)} · in full {pct(t.inFull)} · accurate {pct(t.accurate)} · perfect {pct(t.perfect)}
        </div>
        {owed.length > 0 && (
          <Card title="Credit notes due" className="mb-4" right={<span className="text-sm text-slate-500">Cancelled, dropped or short items still on the invoice</span>}>
            <ul className="divide-y divide-slate-100">
              {owed.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <span>{o.invoiceNo} · {o.poNo} · {o.customer}</span>
                  <span className="flex items-center gap-3"><b>{rmFmt(creditDue(o))}</b>{canManage ? <button onClick={async () => setErr(await raiseCredit(o.id))} className={`${btnGhost} !py-1 !text-sm`}>Credit note raised</button> : <span className="text-sm text-slate-500">Finance will raise it</span>}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="My orders">
          {pos.length === 0 && <p className="p-4 text-slate-500">No orders yet. Use Key in PO when a customer sends one.</p>}
          <ul className="divide-y divide-slate-100">
            {pos.map((o) => {
              const st = orderState(o), isOpen = open === o.id;
              return (
                <li key={o.id}>
                  <button onClick={() => setOpen(isOpen ? null : o.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-slate-50">
                    {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span className="font-medium text-indigo-700">{o.poNo}</span><span className="text-slate-700">{o.customer}</span><span className="text-slate-500">{o.invoiceNo ?? "Not invoiced"}</span>
                    <span className="ml-auto flex gap-1.5">
                      {!o.copyPath && <Badge tone="red">No PO copy</Badge>}
                      {st === "ok" ? <Badge tone="green">All matched</Badge> : st === "check" ? <Badge tone="red">Needs checking</Badge> : <Badge tone="grey">{o.invoiceNo ? "Waiting for delivery" : "Waiting for invoice"}</Badge>}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4">
                      <div className="overflow-x-auto rounded-lg border border-slate-200">
                        <table className="w-full">
                          <thead className="border-b border-slate-200"><tr><Th first>Item</Th><Th right>PO</Th><Th right>Invoiced</Th><Th right>Delivered</Th><Th>Result</Th></tr></thead>
                          <tbody>
                            {o.lines.map((l, k) => (
                              <tr key={l.sku + k} className="border-b border-slate-100 align-top">
                                <Td first><div className="font-medium text-slate-900">{l.sku}</div><div className="text-sm text-slate-500">{l.desc}</div></Td>
                                <Td right>{l.poQty}</Td><Td right>{o.invoiceNo ? l.invQty ?? "–" : "–"}</Td><Td right>{o.deliveredDate ? l.delQty ?? "–" : "–"}</Td>
                                <Td className="!whitespace-normal"><ul className="space-y-0.5 text-[15px]">{lineMatch(o, l).map((m, i) => <li key={i} className="flex items-center gap-1.5"><Mark k={m.icon} />{m.text}</li>)}{l.reason && <li className="pl-6 text-sm text-slate-500">{l.reason}</li>}</ul></Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {!o.copyPath && <label className={`${btnGhost} cursor-pointer`}>Attach PO copy<input type="file" accept="image/*,application/pdf" capture="environment" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setErr(await addCopy(o.id, f)); e.target.value = ""; }} /></label>}
                        <button onClick={() => { setSheet(o); setTimeout(() => window.print(), 50); }} className={`${btnGhost} inline-flex items-center gap-1.5`}><Printer size={18} /> Print matching sheet</button>
                        {o.copyPath && <button onClick={() => view(o.copyPath!)} className={btnGhost}>View PO copy</button>}
                        {o.proofPath && <button onClick={() => view(o.proofPath!)} className={btnGhost}>View signed copy</button>}
                        {o.invoiceId && can("page_finance") && <Link href={`/finance/invoices/${o.invoiceId}`} className={btnGhost}>Open invoice</Link>}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      {adding && <NewPoModal onClose={() => setAdding(false)} />}
      {sheet && (
        <div id="po-sheet" className="hidden bg-white p-8 text-black print:block">
          <h1 className="text-2xl font-bold">Delivery matching sheet</h1>
          <p className="mt-1">{sheet.customer} · PO {sheet.poNo} · Invoice {sheet.invoiceNo ?? "not yet invoiced"} · Requested {sheet.reqDate}{sheet.deliveredDate ? ` · Delivered ${sheet.deliveredDate}` : ""}</p>
          <table className="mt-4 w-full border-collapse text-sm">
            <thead><tr>{["Item", "PO qty", "Invoiced", "Delivered", "Result"].map((h) => <th key={h} className="border border-black px-2 py-1 text-left">{h}</th>)}</tr></thead>
            <tbody>{sheet.lines.map((l, k) => <tr key={l.sku + k}><td className="border border-black px-2 py-1">{l.sku} {l.desc}</td><td className="border border-black px-2 py-1">{l.poQty}</td><td className="border border-black px-2 py-1">{sheet.invoiceNo ? l.invQty ?? "–" : "–"}</td><td className="border border-black px-2 py-1">{sheet.deliveredDate ? l.delQty ?? "–" : "–"}</td><td className="border border-black px-2 py-1">{lineMatch(sheet, l).map((m) => m.text).join("; ")}{l.reason ? ` (${l.reason})` : ""}</td></tr>)}</tbody>
          </table>
          <div className="mt-10 grid grid-cols-2 gap-10"><div className="border-t border-black pt-1">Customer name and signature</div><div className="border-t border-black pt-1">Salesman</div></div>
        </div>
      )}
    </>
  );
}
