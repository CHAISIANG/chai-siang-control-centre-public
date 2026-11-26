"use client";
/* eslint-disable @next/next/no-img-element -- claim photos are signed links to private files, shown as they are */
import type { ComponentProps } from "react";
import { AlertTriangle, ArrowLeft, Check, Send } from "lucide-react";
import PafSheet from "@/components/PafSheet";

type SheetProps = ComponentProps<typeof PafSheet>;

/**
 * The last look before a claim goes to the supervisor: the form exactly as it prints, the photos, the attached
 * documents and delivery proofs, and the checklist. Nothing is sent until the salesman confirms.
 */
export function SubmitPreview({ title, def, values, sign, photos, docNames, invoices = [], checklist, busy, onConfirm, onBack }: {
  title: string; def: SheetProps["def"]; values: SheetProps["values"]; sign?: SheetProps["sign"];
  photos: string[]; docNames: string[]; invoices?: { docNo: string; pod?: string }[];
  checklist: { ok: boolean; text: string }[]; busy: boolean; onConfirm: () => void; onBack: () => void;
}) {
  const missing = checklist.filter((c) => !c.ok);
  return (
    <div className="no-print fixed inset-0 z-[60] flex flex-col bg-slate-900/60" role="dialog" aria-modal="true" aria-label="Check your claim before sending">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">Check your claim before sending</h2>
          <p className="text-sm text-slate-600">{title}. This is exactly what the supervisor and Colgate will see.</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={onBack} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"><ArrowLeft size={16} /> Back to edit</button>
          <button onClick={onConfirm} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"><Send size={16} /> {busy ? "Sending…" : "Confirm and send to supervisor"}</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-slate-100">
        <div className="mx-auto grid max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 rounded-lg bg-white p-3 shadow-sm">
            <PafSheet def={def} values={values} sign={sign} followCustomer photos={photos} />
          </div>
          <aside className="space-y-3">
            <section className="rounded-lg bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">Checklist</h3>
              <ul className="mt-1.5 space-y-1">
                {checklist.map((c) => <li key={c.text} className={`flex items-start gap-2 text-sm ${c.ok ? "text-emerald-700" : "text-amber-800"}`}>{c.ok ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}{c.text}</li>)}
              </ul>
              {missing.length > 0 && <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-900">{missing.length === 1 ? "One item is" : `${missing.length} items are`} not done. You can still send it, but the supervisor may return it.</p>}
            </section>
            <section className="rounded-lg bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">Photos ({photos.length})</h3>
              {photos.length ? <div className="mt-1.5 grid grid-cols-3 gap-1.5">{photos.map((u) => <img key={u} src={u} alt="" className="aspect-square w-full rounded object-cover ring-1 ring-slate-200" />)}</div> : <p className="mt-1 text-sm text-slate-500">No photos.</p>}
            </section>
            <section className="rounded-lg bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">Delivered invoices ({invoices.length})</h3>
              {invoices.length ? <ul className="mt-1 space-y-0.5 text-sm text-slate-700">{invoices.map((i) => <li key={i.docNo}>{i.docNo}{i.pod ? <span className="text-slate-500"> · POD {i.pod}</span> : null}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">None added.</p>}
            </section>
            <section className="rounded-lg bg-white p-3 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800">Supporting documents ({docNames.length})</h3>
              {docNames.length ? <ul className="mt-1 space-y-0.5 text-sm text-slate-700">{docNames.map((n) => <li key={n} className="truncate">{n}</li>)}</ul> : <p className="mt-1 text-sm text-slate-500">None.</p>}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
