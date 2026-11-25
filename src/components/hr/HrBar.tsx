"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, RotateCcw } from "lucide-react";
import { useHr } from "@/lib/hr/store";
import { fmtDate } from "@/lib/hr/rules";
import { useT } from "@/lib/i18n";
import type { View } from "@/lib/hr/store";

const ROLES: [View, string][] = [["employee", "Employee"], ["field", "Field staff"], ["manager", "Manager"], ["hr", "HR admin"]];
const SELF_PAGES = ["/hr", "/hr/clock", "/hr/leave", "/hr/leave/apply"];

function Updates() {
  const { t } = useT();
  const { me, data, markRead } = useHr();
  const [open, setOpen] = useState(false);
  const mine = data.notes.filter((n) => n.to === me.id);
  const unread = mine.filter((n) => !n.read).length;
  return (
    <div className="relative">
      <button onClick={() => { setOpen(!open); if (!open && unread) void markRead(); }} className="relative rounded-lg border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-50" aria-label={`${t("Updates")}${unread ? `, ${t("{n} new", { n: unread })}` : ""}`}>
        <Bell size={17} />{unread > 0 && <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 max-w-[85vw] rounded-xl border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-lg">
          {mine.length === 0 ? <p className="p-3 text-slate-500">{t("No updates yet.")}</p> : mine.slice(0, 8).map((n) => (
            <Link key={n.id} href={n.href ?? "/hr"} onClick={() => setOpen(false)} className={`block rounded-lg px-3 py-2 hover:bg-slate-50 ${n.read ? "" : "bg-blue-50/60"}`}>
              <span className="block">{t(n.text)}</span><span className="text-xs text-slate-500">{fmtDate(n.at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

/** Top of every HR screen. Sample mode: whose eyes you see it through, and a reset. Live mode: just the updates bell. */
export function HrBar() {
  const { t } = useT();
  const { live, view, setRole, me, reset, flash, error } = useHr();
  return (
    <>
      {live ? (
        <div className="mb-3 flex items-center justify-end gap-2">
          {error && <span className="mr-auto rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-800">{error}</span>}
          <Updates />
        </div>
      ) : (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          <span className="font-medium">{t("Sample data")}</span>
          <span className="text-blue-800/80">{t("Viewing as")}</span>
          <div className="inline-flex rounded-lg border border-blue-300 bg-white p-0.5" role="radiogroup" aria-label={t("Viewing as")}>
            {ROLES.map(([k, l]) => <button key={k} role="radio" aria-checked={view === k} onClick={() => setRole(k)} className={`rounded-md px-2.5 py-1 ${view === k ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-blue-50"}`}>{t(l)}</button>)}
          </div>
          <span className="text-blue-800/80">({me.name.split(" ").slice(0, 2).join(" ")})</span>
          <span className="flex-1" />
          <Updates />
          <button onClick={() => { if (confirm(t("Put all the sample data back to how it started?"))) reset(); }} className="inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white px-2 py-1.5 text-slate-700 hover:bg-blue-50"><RotateCcw size={15} /> {t("Reset sample")}</button>
        </div>
      )}
      {flash && <div role="status" className="fixed bottom-4 left-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">{flash}</div>}
    </>
  );
}

/** Personal pages need an employee record; HR pages work without one. While data loads, show a short wait. */
export function HrGate({ children }: { children: ReactNode }) {
  const { t } = useT();
  const { live, loading, linked, role } = useHr();
  const path = usePathname();
  if (live && loading) return <p className="py-10 text-center text-slate-500">{t("Loading HR…")}</p>;
  if (live && !linked && SELF_PAGES.includes(path)) return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-6 text-slate-700">
      <p className="font-medium text-slate-900">{t("Your login is not linked to an employee record yet.")}</p>
      <p className="mt-1">{t("HR links you by email: ask them to add you on the Employees page with the same email you sign in with. It links the next time you open this page.")}</p>
      {role === "hr" && <Link href="/hr/admin/employees" className="mt-3 inline-block font-medium text-blue-600 hover:underline">{t("Go to Employees")}</Link>}
    </div>
  );
  return <>{children}</>;
}
