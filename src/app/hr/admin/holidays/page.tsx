"use client";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { Modal, btnBlue, btnLine, field } from "@/components/hr/ui";
import { fmtDate, weekday, type Holiday } from "@/lib/hr/rules";
import { YEAR } from "@/lib/hr/sample";
import { useHr } from "@/lib/hr/store";

const SCOPES = ["Federal", "Selangor", "Kuala Lumpur", "Putrajaya", "Johor", "Kedah", "Kelantan", "Melaka", "Negeri Sembilan", "Pahang", "Perak", "Perlis", "Pulau Pinang", "Sabah", "Sarawak", "Terengganu", "Labuan"];

export default function Holidays() {
  const { data, role, saveHoliday, removeHoliday } = useHr();
  const list = data.holidays;
  const [err, setErr] = useState("");
  const [year, setYear] = useState(YEAR);
  const [scope, setScope] = useState<"all" | string>("all");
  const [editing, setEditing] = useState<{ was: Holiday | null; h: Holiday } | null>(null);
  const years = [...new Set([YEAR, YEAR + 1, ...list.map((h) => Number(h.date.slice(0, 4)))])].sort();
  const shown = list.filter((h) => h.date.startsWith(String(year)) && (scope === "all" || h.scope === scope)).sort((a, b) => a.date.localeCompare(b.date));
  const months = [...new Set(shown.map((h) => h.date.slice(0, 7)))];
  const onWeekday = shown.filter((h) => weekday(h.date) % 6 !== 0).length;
  const sel = "rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm";

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">Public holidays</h1><p className="text-slate-500">Federal holidays apply to everyone; state holidays only to staff in that state. Leave never counts these days. Check Islamic and lunar dates against the gazette each year.</p></div>
        {role === "hr" && <button onClick={() => { setErr(""); setEditing({ was: null, h: { date: `${year}-01-01`, name: "", scope: "Federal" } }); }} className={`${btnBlue} !py-2 text-sm`}><Plus size={16} /> Add holiday</button>}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">{years.map((y) => <button key={y} onClick={() => setYear(y)} className={`rounded-md px-3 py-1.5 ${y === year ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{y}</button>)}</div>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className={sel} aria-label="Federal or state"><option value="all">Federal and all states</option>{SCOPES.map((s) => <option key={s}>{s}</option>)}</select>
        <span className="text-sm text-slate-500">{shown.length} holidays, {onWeekday} on weekdays</span>
      </div>

      <div className="mt-4 space-y-4">
        {shown.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">No holidays for {year} yet. Add them from the gazette.</p>}
        {months.map((m) => (
          <section key={m}>
            <h2 className="mb-1 text-sm font-semibold text-slate-500">{new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-MY", { month: "long", timeZone: "UTC" })}</h2>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
              {shown.filter((h) => h.date.startsWith(m)).map((h) => (
                <li key={h.date + h.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-24 shrink-0 text-sm text-slate-600">{fmtDate(h.date, { weekday: "short", day: "numeric", month: "short" })}</span>
                    <span className="truncate font-medium text-slate-900">{h.name}</span>
                    {weekday(h.date) % 6 === 0 && <span className="text-xs text-slate-400">weekend</span>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone={h.scope === "Federal" ? "blue" : "grey"}>{h.scope}</Badge>
                    {role === "hr" && <><button onClick={() => setEditing({ was: h, h })} className="rounded p-1.5 text-slate-500 hover:bg-blue-50 hover:text-blue-600" aria-label={`Edit ${h.name}`}><Pencil size={16} /></button>
                    <button onClick={() => { if (confirm(`Remove ${h.name} on ${fmtDate(h.date)}? Leave already taken that day will start counting it as a working day.`)) void removeHoliday(h); }} className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${h.name}`}><Trash2 size={16} /></button></>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {editing && (
        <Modal title={editing.was ? "Edit holiday" : "Add holiday"} onClose={() => setEditing(null)}>
          <div className="grid grid-cols-2 gap-3 text-sm font-medium text-slate-700">
            <label className="col-span-2">Name<input value={editing.h.name} onChange={(e) => setEditing({ ...editing, h: { ...editing.h, name: e.target.value } })} className={field} placeholder="For example: Hari Raya Aidilfitri" /></label>
            <label>Date<input type="date" value={editing.h.date} onChange={(e) => setEditing({ ...editing, h: { ...editing.h, date: e.target.value } })} className={field} /></label>
            <label>Applies to<select value={editing.h.scope} onChange={(e) => setEditing({ ...editing, h: { ...editing.h, scope: e.target.value } })} className={field}>{SCOPES.map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <p className="mt-3 text-sm text-slate-500">When a holiday falls on a Sunday, add the replacement day as its own holiday.</p>
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={() => setEditing(null)} className={btnLine}>Cancel</button>
            <button disabled={!editing.h.name.trim() || !editing.h.date} onClick={async () => { const r = await saveHoliday(editing.was, { ...editing.h, name: editing.h.name.trim() }); if (!r.ok) { setErr(r.text); return; } setErr(""); setYear(Number(editing.h.date.slice(0, 4))); setEditing(null); }} className={btnBlue}>Save</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
