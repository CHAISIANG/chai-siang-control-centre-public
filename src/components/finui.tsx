"use client";
import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Badge } from "./ui";
import { alertFor, effectiveStatus, STATUS_LABEL, STATUS_TONE, type FinInvoice } from "@/lib/finance";

export function StatusBadge({ inv }: { inv: FinInvoice }) {
  const s = effectiveStatus(inv);
  return <Badge tone={STATUS_TONE[s]}>{STATUS_LABEL[s]}</Badge>;
}

/** Yellow before the due date, red once overdue, escalating at 7 / 30 / 60 days. */
export function AlertBadge({ inv }: { inv: FinInvoice }) {
  const a = alertFor(inv);
  return a ? <Badge tone={a.tone}>{a.label}</Badge> : null;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${wide ? "max-w-2xl" : "max-w-md"} rounded-xl border border-slate-200 bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export const inputCls = "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-800";
export const btnPrimary = "rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50";
export const btnGhost = "rounded-md border border-slate-300 bg-white px-4 py-2 text-base font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50";

export function Field({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) {
  return <label className={`block text-sm font-medium text-slate-600 ${className}`}>{label}{children}</label>;
}
