"use client";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui";
import { useT } from "@/lib/i18n";
import { leaveColor, LEAVE_TYPES, type LeaveType } from "@/lib/hr/rules";
import type { LeaveStatus } from "@/lib/hr/sample";

export const HR_BLUE = "#3B82F6";
export const btnBlue = "inline-flex items-center justify-center gap-2 rounded-lg bg-blue-500 px-4 py-2.5 text-base font-medium text-white hover:bg-blue-600 disabled:opacity-50";
export const btnLine = "inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50";
export const field = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-800";

const statusTone: Record<LeaveStatus, "amber" | "green" | "red" | "grey"> = { Pending: "amber", Approved: "green", Rejected: "red", Cancelled: "grey" };
export function StatusBadge({ s }: { s: LeaveStatus }) { const { t } = useT(); return <Badge tone={statusTone[s]}>{t(s)}</Badge>; }

export function TypeTag({ t: type }: { t: LeaveType }) {
  const { t } = useT();
  const x = LEAVE_TYPES.find((y) => y.code === type)!;
  return <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm text-slate-700"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />{t(x.name)}</span>;
}

const days = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** "2 days" / "2 hari". Pass the t from useT() to get Malay. */
export const dayTxt = (n: number, t: (en: string) => string = (x) => x) => `${days(n)} ${t(n === 1 ? "day" : "days")}`;

/** A ring showing how much of a leave type is left this year. */
export function BalanceRing({ type, left, total, used, pending }: { type: LeaveType; left: number | null; total: number | null; used: number; pending: number }) {
  const { t } = useT();
  const x = LEAVE_TYPES.find((y) => y.code === type)!;
  const r = 30, c = 2 * Math.PI * r;
  const share = total ? Math.max(0, Math.min(1, (left ?? 0) / total)) : 1;
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 text-center sm:flex-row sm:text-left">
      <svg width="72" height="72" viewBox="0 0 72 72" role="img" aria-label={`${t(x.name)}: ${left === null ? t("No limit") : t("{left} of {total} left", { left: days(left), total: days(total ?? 0) })}`} className="shrink-0">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#E2E8F0" strokeWidth="8" />
        {total !== null && <circle cx="36" cy="36" r={r} fill="none" stroke={leaveColor(type)} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${share * c} ${c}`} transform="rotate(-90 36 36)" />}
        <text x="36" y="40" textAnchor="middle" className="fill-slate-900" style={{ font: "600 16px var(--nf-display, sans-serif)" }}>{left === null ? "∞" : days(left)}</text>
      </svg>
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">{t(x.short)}</div>
        <div className="text-xs text-slate-500">{total === null ? t("No limit") : t("of {total} left", { total: days(total) })}</div>
        <div className="text-xs text-slate-500">{t("{n} used", { n: days(used) })}{pending ? ` · ${t("{n} pending", { n: days(pending) })}` : ""}</div>
      </div>
    </div>
  );
}

/** A small figure for the employee dashboard. */
export function Stat({ label, value, sub, tone = "slate" }: { label: string; value: string; sub?: string; tone?: "slate" | "amber" | "blue" | "green" }) {
  const t = { slate: "text-slate-900", amber: "text-amber-700", blue: "text-blue-600", green: "text-emerald-700" }[tone];
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`mt-0.5 font-display text-2xl font-semibold ${t}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-xl sm:max-w-lg sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button onClick={onClose} className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100" aria-label={t("Close")}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
