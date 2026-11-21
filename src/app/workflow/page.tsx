"use client";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { btnGhost } from "@/components/finui";
import { FLOW, WHO_SEES } from "@/lib/workflow";

/** The invoice workflow from Finance to Logistics until the signed document is scanned, with a link to each screen. */
export default function Workflow() {
  return (
    <>
      <div className="no-print">
        <PageHeader title="Invoice workflow" sub="From the SAP import to a delivered, signed and scanned invoice that everyone concerned can open."
          right={<div className="flex flex-wrap items-center gap-3"><Link href="/tracker" className="text-sm text-indigo-600 hover:underline">Invoice tracker</Link><Link href="/logistics/sop" className="text-sm text-indigo-600 hover:underline">Warehouse SOP</Link>
            <button onClick={() => window.print()} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Printer size={16} /> Print A4</button></div>} />
      </div>
      <div id="fin-inv-print">
        <h1 className="hidden text-xl font-bold print:block">Invoice workflow: Finance to scanned POD</h1>
        <ol className="space-y-3">
          {FLOW.map((s) => (
            <li key={s.n} className="break-inside-avoid">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 font-semibold text-white">{s.n}</span>
                    <div><div className="font-semibold text-slate-900">{s.title}</div><div className="text-sm text-slate-500">{s.who}</div></div>
                  </div>
                  <Link href={s.where.href} className="no-print text-sm text-indigo-600 hover:underline">{s.where.label}</Link>
                  <span className="hidden text-sm text-slate-600 print:inline">Screen: {s.where.label}</span>
                </div>
                <ul className="mt-3 list-disc space-y-1 pl-5 text-slate-800">{s.do.map((d, i) => <li key={i}>{d}</li>)}</ul>
                <p className="mt-2 rounded-md bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"><b className="font-semibold">Check: </b>{s.check}</p>
              </Card>
            </li>
          ))}
        </ol>
        <Card title="Who can open an invoice and its scan" className="mt-4 break-inside-avoid">
          <table className="w-full text-sm">
            <tbody>{WHO_SEES.map((w) => <tr key={w.who} className="border-b border-slate-100 last:border-0"><td className="w-56 py-2 pr-3 align-top font-medium text-slate-900">{w.who}</td><td className="py-2 text-slate-700">{w.sees}</td></tr>)}</tbody>
          </table>
        </Card>
      </div>
    </>
  );
}
