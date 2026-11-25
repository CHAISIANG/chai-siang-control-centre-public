"use client";
import { useState } from "react";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { Card } from "@/components/ui";
import { btnBlue, btnLine, dayTxt, field } from "@/components/hr/ui";
import { addDays, calendarDays, eachDay, fmtDate, isRestDay, LEAVE_TYPES, leaveDays, leaveName, type LeaveType } from "@/lib/hr/rules";
import { TODAY } from "@/lib/hr/sample";
import { approverOf, balance, findEmp, holidaySetFor } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";
import { useT } from "@/lib/i18n";

const MAX_MC = 5 * 1024 * 1024;

export default function ApplyLeave() {
  const { t } = useT();
  const { data, me, applyLeave } = useHr();
  const s = data.settings;
  const hol = holidaySetFor(data, me.state);
  const types = LEAVE_TYPES.filter((x) => x.code !== "ML" || me.gender === "F");
  const approver = findEmp(data, approverOf(data, me));
  const [type, setType] = useState<LeaveType>("AL");
  const [from, setFrom] = useState(addDays(TODAY, 7));
  const [to, setTo] = useState(addDays(TODAY, 7));
  const [half, setHalf] = useState<"" | "AM" | "PM">("");
  const [reason, setReason] = useState("");
  const [mc, setMc] = useState<File | null>(null);
  const [mcErr, setMcErr] = useState("");
  const [sent, setSent] = useState<{ days: number; text: string } | null>(null);
  const [err, setErr] = useState("");

  const single = from === to;
  const days = type === "ML" ? calendarDays(from, to) : leaveDays(from, to, single ? half : "", hol, s, me.schedule);
  const b = balance(data, me, type);
  const after = b.available === null ? null : b.available - days;
  const off = to >= from && from ? eachDay(from, to).filter((d) => isRestDay(d, s, me.schedule) || hol.has(d)) : [];
  const offHolidays = data.holidays.filter((h) => off.includes(h.date) && hol.has(h.date));
  const needMc = (type === "SL" && days > 2) || type === "HL";
  const short = t(LEAVE_TYPES.find((x) => x.code === type)!.short).toLowerCase();

  const problems: string[] = [];
  if (!from || !to) problems.push(t("Pick the dates."));
  else if (to < from) problems.push(t("The end date is before the start date."));
  else if (days === 0) problems.push(t("These dates are all rest days or public holidays, so no leave is needed."));
  if (type === "EL" && from && from < addDays(TODAY, -2)) problems.push(t("Emergency leave can be backdated by 48 hours at most."));
  if ((type === "AL" || type === "UL" || type === "ML") && from && from < TODAY) problems.push(t("{type} must start today or later.", { type: t(leaveName(type)) }));
  if (after !== null && after < 0) problems.push(t("Not enough {type} leave: {left} left.", { type: short, left: dayTxt(b.available ?? 0, t) }));
  if (needMc && !mc) problems.push(t("Attach the medical certificate (MC)."));
  if (!reason.trim()) problems.push(t("Write a short reason."));

  function pickMc(f: File | undefined) {
    setMcErr("");
    if (!f) return;
    if (!/\.(pdf|jpe?g|png)$/i.test(f.name)) { setMcErr(t("Use a PDF, JPG or PNG file.")); return; }
    if (f.size > MAX_MC) { setMcErr(t("The file is bigger than 5 MB. Take a smaller photo or scan.")); return; }
    setMc(f);
  }
  const [busy, setBusy] = useState(false);
  async function send() {
    setErr(""); setBusy(true);
    const r = await applyLeave({ type, from, to, half, reason, mc });
    setBusy(false);
    if (!r.ok) { setErr(r.text); return; }
    setSent({ days, text: r.text });
  }

  if (sent) return (
    <div className="mx-auto max-w-md text-center">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <p className="text-lg font-semibold text-emerald-900">{t("Request sent")}</p>
        <p className="mt-1 text-emerald-800">{dayTxt(sent.days, t)} {t("of")} {t(leaveName(type)).toLowerCase()}, {fmtDate(from)}{!single ? ` – ${fmtDate(to)}` : ""}. {t(sent.text)}</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2"><Link href="/hr/leave" className={btnLine}>{t("My leave")}</Link><button onClick={() => { setSent(null); setReason(""); setMc(null); }} className={btnBlue}>{t("Apply again")}</button></div>
    </div>
  );

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">{t("Apply leave")}</h1>
      <p className="text-slate-500">{t("Weekends and public holidays are left out of the count.")}</p>

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700">{t("Type of leave")}</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {types.map((x) => {
            const bt = balance(data, me, x.code);
            const on = x.code === type;
            return (
              <button key={x.code} type="button" onClick={() => { setType(x.code); if (x.code === "ML") setHalf(""); }} aria-pressed={on}
                className={`rounded-xl border p-3 text-left ${on ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200 bg-white hover:border-slate-300"}`}>
                <span className="flex items-center gap-1.5 text-sm font-medium text-slate-900"><span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: x.color }} />{t(x.short)}</span>
                <span className="text-xs text-slate-500">{bt.available === null ? t("No limit") : t("{n} left", { n: dayTxt(bt.available, t) })}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="text-sm font-medium text-slate-700">{t("From")}<input type="date" value={from} onChange={(e) => { setFrom(e.target.value); if (e.target.value > to) setTo(e.target.value); }} className={field} /></label>
        <label className="text-sm font-medium text-slate-700">{t("To")}<input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={field} /></label>
      </div>
      {single && type !== "ML" && (
        <div className="mt-3 inline-flex rounded-lg border border-slate-300 p-0.5 text-sm" role="radiogroup" aria-label={t("Full or half day")}>
          {([["", "Full day"], ["AM", "Morning only"], ["PM", "Afternoon only"]] as const).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={half === k} onClick={() => setHalf(k)} className={`rounded-md px-3 py-1.5 ${half === k ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{t(l)}</button>
          ))}
        </div>
      )}

      <Card className="mt-4">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xs text-slate-500">{t("This request")}</div><div className="font-display text-2xl font-semibold text-slate-900">{days}</div><div className="text-xs text-slate-500">{t(type === "ML" ? "calendar days" : "working days")}</div></div>
          <div><div className="text-xs text-slate-500">{t("Left now")}</div><div className="font-display text-2xl font-semibold text-slate-900">{b.available === null ? "∞" : b.available}</div><div className="text-xs text-slate-500">{t("after pending")}</div></div>
          <div><div className="text-xs text-slate-500">{t("Left after")}</div><div className={`font-display text-2xl font-semibold ${after !== null && after < 0 ? "text-rose-700" : "text-blue-600"}`}>{after === null ? "∞" : after}</div><div className="text-xs text-slate-500">{t("if approved")}</div></div>
        </div>
        {off.length > 0 && type !== "ML" && <p className="mt-3 text-sm text-slate-600">{t("Not counted")}: {off.length} {t(off.length === 1 ? "day" : "days")} {t("off")}{offHolidays.length ? `, ${t("including")} ${offHolidays.map((h) => `${h.name} (${fmtDate(h.date, { day: "numeric", month: "short" })})`).join(", ")}` : ""}.</p>}
        {type === "EL" && <p className="mt-3 text-sm text-slate-600">{t("Emergency leave can be applied up to 48 hours after the day.")}</p>}
        {type === "ML" && <p className="mt-3 text-sm text-slate-600">{t("Maternity leave counts calendar days, weekends included.")}</p>}
      </Card>

      <label className="mt-4 block text-sm font-medium text-slate-700">{t("Reason")}<textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("A few words for your manager")} className={field} /></label>

      {needMc && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-sm font-medium text-slate-800">{t("Medical certificate (MC)")}</p>
          <p className="text-xs text-slate-500">{t("Needed for sick leave over 2 days and for hospitalisation. PDF, JPG or PNG, up to 5 MB.")}</p>
          <label className={`${btnLine} mt-2 w-full cursor-pointer !py-2 text-sm`}><Paperclip size={16} /> {mc ? mc.name : t("Attach MC")}<input type="file" accept=".pdf,.jpg,.jpeg,.png" className="sr-only" onChange={(e) => pickMc(e.target.files?.[0])} /></label>
          {mcErr && <p className="mt-1 text-sm text-rose-700">{mcErr}</p>}
        </div>
      )}

      {problems.length > 0 && <ul className="mt-4 list-disc space-y-0.5 pl-5 text-sm text-amber-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      {err && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{t(err)}</p>}
      <button onClick={send} disabled={problems.length > 0 || busy} className={`${btnBlue} mt-4 w-full`}>{busy ? t("Sending…") : t("Send to {name} for approval", { name: approver ? approver.name.split(" ")[0] : "HR" })}</button>
    </div>
  );
}
