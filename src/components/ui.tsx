"use client";
import type { ReactNode } from "react";
import { useT } from "@/lib/i18n";

/** Text that is a plain string follows the chosen language; anything else is shown as it is. */
function Tr({ v }: { v: ReactNode }) { const { t } = useT(); return <>{typeof v === "string" ? t(v) : v}</>; }

/** A white panel with a hairline border, a soft shadow and a rule under the title. */
export function Card({ title, right, children, className = "" }: { title?: string; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || right) && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-slate-200 px-4 py-3 sm:px-5">
          <h2 className="text-[15px] font-semibold text-slate-900"><Tr v={title} /></h2>
          {right}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

const barTone = { good: "bg-emerald-600", warn: "bg-amber-500", bad: "bg-rose-600", neutral: "bg-slate-400" };
const textTone = { good: "text-emerald-700", warn: "text-amber-700", bad: "text-rose-700", neutral: "text-slate-500" };

/** One figure inside a KpiStrip: label, big number, one line of context. */
export function Kpi({ label, value, sub, tone = "neutral", pct }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" | "neutral"; pct?: number }) {
  return (
    <div className="px-4 py-4 sm:px-5">
      <div className="text-sm font-medium text-slate-500"><Tr v={label} /></div>
      <div className="mt-1 font-display text-[26px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[30px]">{value}</div>
      {sub && <div className={`mt-0.5 text-sm ${textTone[tone]}`}><Tr v={sub} /></div>}
      {pct !== undefined && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-sm bg-slate-100">
          <div className={`h-full ${barTone[tone]}`} style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
      )}
    </div>
  );
}

/** Figures in a single bordered row split by hairlines, instead of separate cards. */
export function KpiStrip({ children, cols = "lg:grid-cols-4" }: { children: ReactNode; cols?: string }) {
  return (
    <div className={`grid grid-cols-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm [&>*]:border-slate-200 max-lg:[&>*:nth-child(n+3)]:border-t max-lg:[&>*:nth-child(even)]:border-l lg:divide-x lg:divide-slate-200 ${cols}`}>
      {children}
    </div>
  );
}

/** Road-marking progress bar. `pct` may exceed 100: the white tick marks the target. */
export function RoadBar({ pct, className = "" }: { pct: number; className?: string }) {
  const tick = pct > 100 ? 100 / (pct / 100) / 1 : 100;
  const fill = Math.min(100, (pct > 100 ? 100 : pct));
  return (
    <div className={`road ${className}`} role="img" aria-label={`${pct}% of target`}>
      <i style={{ width: `${fill}%` }} />
      {pct > 100 && <b style={{ left: `calc(${Math.min(tick, 99)}% - 1px)` }} />}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  green: "bg-emerald-50 text-emerald-800 ring-emerald-700/20",
  amber: "bg-amber-50 text-amber-800 ring-amber-700/25",
  red: "bg-rose-50 text-rose-800 ring-rose-700/20",
  blue: "bg-indigo-50 text-indigo-800 ring-indigo-700/20",
  grey: "bg-slate-100 text-slate-600 ring-slate-500/20",
};
export function Badge({ tone = "grey", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}><Tr v={children} /></span>;
}

export function PageHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-4">
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight text-slate-900"><Tr v={title} /></h1>
        {sub && <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-slate-500"><Tr v={sub} /></p>}
      </div>
      {right}
    </div>
  );
}

export function Plate({ children, small = false }: { children: ReactNode; small?: boolean }) {
  return <span className={`plate ${small ? "text-base" : "text-xl"}`}>{children}</span>;
}

export function Th({ children, right, first }: { children?: ReactNode; right?: boolean; first?: boolean }) {
  return <th className={`${first ? "sticky left-0 z-[1] bg-slate-50 " : ""}whitespace-nowrap px-3 py-2.5 text-[13px] font-semibold text-slate-500 ${right ? "text-right" : "text-left"}`}><Tr v={children} /></th>;
}
export function Td({ children, right, first, className = "" }: { children?: ReactNode; right?: boolean; first?: boolean; className?: string }) {
  return <td className={`${first ? "sticky left-0 z-[1] bg-white " : ""}whitespace-nowrap px-3 py-2.5 text-[15px] text-slate-700 ${right ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}
