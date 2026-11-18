"use client";
import { useState } from "react";
import { Card } from "@/components/ui";
import { btnBlue, btnLine, field } from "@/components/hr/ui";
import { DEFAULT_SETTINGS, hm, type Settings } from "@/lib/hr/rules";
import { useHr } from "@/lib/hr/store";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function HrSettings() {
  const { data, role, saveSettings } = useHr();
  const [s, setS] = useState<Settings>(data.settings);
  const [saved, setSaved] = useState(false);
  const problems = [
    hm(s.workEnd) <= hm(s.workStart) && "End time must be after start time.",
    (hm(s.lunchStart) < hm(s.workStart) || hm(s.lunchEnd) > hm(s.workEnd) || hm(s.lunchEnd) <= hm(s.lunchStart)) && "Lunch must sit inside working hours.",
    s.restDays.length === 0 && "Pick at least one rest day.",
    s.restDays.length > 3 && "That is a lot of rest days; check them.",
    [s.otWeekday, s.otRestDay, s.otPublicHoliday].some((x) => !(x >= 1)) && "Overtime rates must be 1 or more.",
    s.gpsRequired && !(s.gpsRadiusM >= 50) && "Allowed distance should be at least 50 metres.",
  ].filter(Boolean) as string[];
  if (role !== "hr") return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">HR settings are for HR. Switch “Viewing as” to HR admin to change them.</p>;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => { setS((x) => ({ ...x, [k]: v })); setSaved(false); };
  const lbl = "text-sm font-medium text-slate-700";

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">HR settings</h1>
      <p className="text-slate-500">These rules apply to everyone. Times are Malaysia time.</p>

      <Card className="mt-4" title="Working hours">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className={lbl}>Start<input type="time" value={s.workStart} onChange={(e) => set("workStart", e.target.value)} className={field} /></label>
          <label className={lbl}>End<input type="time" value={s.workEnd} onChange={(e) => set("workEnd", e.target.value)} className={field} /></label>
          <label className={lbl}>Lunch from<input type="time" value={s.lunchStart} onChange={(e) => set("lunchStart", e.target.value)} className={field} /></label>
          <label className={lbl}>Lunch to<input type="time" value={s.lunchEnd} onChange={(e) => set("lunchEnd", e.target.value)} className={field} /></label>
          <label className={`${lbl} col-span-2`}>Late after (minutes past start)<input type="number" min={0} value={s.lateAfterMin} onChange={(e) => set("lateAfterMin", Number(e.target.value))} className={field} /></label>
        </div>
        <fieldset className="mt-4"><legend className={lbl}>Rest days</legend>
          <div className="mt-2 flex flex-wrap gap-2">{DAYS.map((d, i) => { const on = s.restDays.includes(i); return <button key={d} onClick={() => set("restDays", on ? s.restDays.filter((x) => x !== i) : [...s.restDays, i])} aria-pressed={on} className={`rounded-lg border px-3 py-1.5 text-sm ${on ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-300 text-slate-700"}`}>{d.slice(0, 3)}</button>; })}</div>
        </fieldset>
      </Card>

      <Card className="mt-4" title="Clock-in location (GPS)">
        <label className="flex items-center gap-2 text-slate-800"><input type="checkbox" checked={s.gpsRequired} onChange={(e) => set("gpsRequired", e.target.checked)} className="h-4 w-4" /> Staff must be near the office to clock in</label>
        <div className={`mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3 ${s.gpsRequired ? "" : "opacity-50"}`}>
          <label className={lbl}>Allowed distance (metres)<input type="number" min={50} step={50} value={s.gpsRadiusM} disabled={!s.gpsRequired} onChange={(e) => set("gpsRadiusM", Number(e.target.value))} className={field} /></label>
          <label className={lbl}>Office latitude<input value={s.officeLat} disabled={!s.gpsRequired} onChange={(e) => set("officeLat", Number(e.target.value))} className={field} /></label>
          <label className={lbl}>Office longitude<input value={s.officeLng} disabled={!s.gpsRequired} onChange={(e) => set("officeLng", Number(e.target.value))} className={field} /></label>
        </div>
        <p className="mt-2 text-sm text-slate-500">When this is off, the location is still recorded if the phone shares it, but nobody is blocked.</p>
      </Card>

      <Card className="mt-4" title="Leave">
        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>Annual leave carried over (max days)<input type="number" min={0} value={s.carryMaxDays} onChange={(e) => set("carryMaxDays", Number(e.target.value))} className={field} /></label>
          <label className={lbl}>Carried leave must be used by<select value={s.carryExpiry} onChange={(e) => set("carryExpiry", e.target.value)} className={field}><option value="03-31">31 March (end of Q1)</option><option value="06-30">30 June</option><option value="12-31">31 December</option></select></label>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-slate-500"><th className="py-2 font-medium">Leave type</th><th className="py-2 font-medium">Under 2 years</th><th className="py-2 font-medium">2 to 5 years</th><th className="py-2 font-medium">Over 5 years</th></tr></thead>
            <tbody className="text-slate-800">
              <tr className="border-b border-slate-100"><td className="py-2">Annual</td><td>8</td><td>12</td><td>16</td></tr>
              <tr className="border-b border-slate-100"><td className="py-2">Sick</td><td>14</td><td>18</td><td>22</td></tr>
              <tr className="border-b border-slate-100"><td className="py-2">Hospitalisation</td><td colSpan={3}>Up to 60 days a year, together with sick leave</td></tr>
              <tr className="border-b border-slate-100"><td className="py-2">Emergency</td><td colSpan={3}>2 days a year · can be applied up to 48 hours after</td></tr>
              <tr className="border-b border-slate-100"><td className="py-2">Maternity</td><td colSpan={3}>98 calendar days</td></tr>
              <tr><td className="py-2">Unpaid</td><td colSpan={3}>No limit</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate-500">Follows the Employment Act 1955. New entitlements are created automatically every 1 January. Sick leave over 2 days needs an MC.</p>
      </Card>

      <Card className="mt-4" title="Overtime rates">
        <div className="grid grid-cols-3 gap-3">
          <label className={lbl}>Working day<input type="number" step="0.5" min={1} value={s.otWeekday} onChange={(e) => set("otWeekday", Number(e.target.value))} className={field} /></label>
          <label className={lbl}>Rest day<input type="number" step="0.5" min={1} value={s.otRestDay} onChange={(e) => set("otRestDay", Number(e.target.value))} className={field} /></label>
          <label className={lbl}>Public holiday<input type="number" step="0.5" min={1} value={s.otPublicHoliday} onChange={(e) => set("otPublicHoliday", Number(e.target.value))} className={field} /></label>
        </div>
        <p className="mt-2 text-sm text-slate-500">Times the hourly rate. Overtime counts hours beyond 8 on a working day, and every hour worked on a rest day or public holiday.</p>
      </Card>

      {problems.length > 0 && <ul className="mt-4 list-disc pl-5 text-sm text-amber-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><button disabled={problems.length > 0} onClick={async () => { const r = await saveSettings(s); setSaved(r.ok); if (!r.ok) alert(r.text); }} className={btnBlue}>Save settings</button><button onClick={() => { setS(DEFAULT_SETTINGS); setSaved(false); }} className={btnLine}>Back to defaults</button>{saved && <span role="status" className="text-sm text-emerald-700">Saved. Lateness, overtime and leave counts now use these settings.</span>}</div>
    </div>
  );
}
