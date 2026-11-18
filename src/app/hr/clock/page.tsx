"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { MapPin } from "lucide-react";
import { Card } from "@/components/ui";
import { addDays, fmtDate, fmtHM, hm, isLate, isRestDay, metres, overtime, workedMin } from "@/lib/hr/rules";
import { TODAY } from "@/lib/hr/sample";
import { holidaySetFor } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";

const subscribe = (cb: () => void) => { const t = setInterval(cb, 1000); return () => clearInterval(t); };
const timeNow = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
type Gps = { state: "idle" | "checking" | "ok" | "far" | "denied"; lat?: number; lng?: number; dist?: number };

export default function ClockPage() {
  const { data, me, clock } = useHr();
  const s = data.settings;
  const hol = holidaySetFor(data, me.state);
  const time = useSyncExternalStore(subscribe, timeNow, () => "--:--:--");
  const rec = data.attendance.find((a) => a.empId === me.id && a.date === TODAY);
  const [gps, setGps] = useState<Gps>({ state: "idle" });
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 5000); return () => clearTimeout(t); } }, [flash]);

  const state = rec?.inMin == null ? "in" : rec.outMin == null ? "out" : "done";
  const blocked = s.gpsRequired && gps.state !== "ok";

  function locate(then?: (g: Gps) => void) {
    if (!navigator.geolocation) { const g: Gps = { state: "denied" }; setGps(g); then?.(g); return; }
    setGps({ state: "checking" });
    navigator.geolocation.getCurrentPosition((p) => {
      const dist = metres(p.coords.latitude, p.coords.longitude, s.officeLat, s.officeLng);
      const g: Gps = { state: dist <= s.gpsRadiusM ? "ok" : "far", lat: p.coords.latitude, lng: p.coords.longitude, dist };
      setGps(g); then?.(g);
    }, () => { const g: Gps = { state: "denied" }; setGps(g); then?.(g); }, { enableHighAccuracy: true, timeout: 10000 });
  }
  const [busy, setBusy] = useState(false);
  async function press() {
    if (blocked) { locate(); return; }
    setBusy(true);
    const r = await clock(gps.lat, gps.lng);
    setBusy(false);
    if (!r.ok) { setFlash(r); return; }
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const late = r.text === "in" && isLate(hm(now), s);
    setFlash({ ok: true, text: r.text === "in" ? `Clocked in at ${now}${late ? `. That is after ${fmtHM(hm(s.workStart) + s.lateAfterMin)}, so it counts as late.` : "."}` : `Clocked out at ${now}. Have a good evening.` });
  }
  // when the location check is on, look it up as soon as the page opens
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- one lookup when the page opens
  useEffect(() => { if (s.gpsRequired && state !== "done") locate(); }, []);

  const week = Array.from({ length: 7 }, (_, i) => addDays(TODAY, -(i + 1)));
  const ring = state === "done" ? "bg-slate-300 ring-slate-100" : blocked ? "bg-slate-400 ring-slate-200" : state === "in" ? "bg-blue-500 hover:bg-blue-600 ring-blue-200" : "bg-amber-500 hover:bg-amber-600 ring-amber-200";
  const gpsText = !s.gpsRequired && gps.state === "idle" ? "Location check is off" : gps.state === "checking" ? "Checking your location…" : gps.state === "ok" ? `At the office (${Math.round(gps.dist!)} m away)` : gps.state === "far" ? `${(gps.dist! / 1000).toFixed(1)} km from the office: too far to clock in` : gps.state === "denied" ? "Location not shared. Allow location for this site in your browser." : "Location not checked yet";

  return (
    <div className="mx-auto max-w-md">
      <div className="text-center">
        <h1 className="sr-only">Clock in or out</h1>
        <p className="text-slate-500">{fmtDate(TODAY, { weekday: "long", day: "numeric", month: "long" })}</p>
        <p className="font-display text-5xl font-semibold tabular-nums tracking-tight text-slate-900">{time}</p>
        <p className="mt-1 text-sm text-slate-500">Working hours {s.workStart} – {s.workEnd} · lunch {s.lunchStart} – {s.lunchEnd}</p>
      </div>

      <div className="my-8 flex justify-center">
        <button onClick={press} disabled={state === "done" || gps.state === "checking" || busy}
          className={`flex h-56 w-56 flex-col items-center justify-center rounded-full text-white shadow-lg ring-8 transition-transform active:scale-95 disabled:cursor-default ${ring}`}>
          <span className="text-3xl font-semibold">{state === "done" ? "Done" : blocked ? "Check location" : state === "in" ? "Clock in" : "Clock out"}</span>
          <span className="mt-1 px-6 text-sm text-white/85">{state === "in" ? (blocked ? "You must be at the office" : "Tap to start your day") : state === "out" ? `In since ${fmtHM(rec!.inMin!)}` : "See you tomorrow"}</span>
        </button>
      </div>
      {flash && <p role="status" className={`mb-4 rounded-lg px-3 py-2 text-center text-sm ${flash.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{flash.text}</p>}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className={`inline-flex items-center gap-2 ${gps.state === "far" || gps.state === "denied" ? "text-rose-700" : "text-slate-700"}`}><MapPin size={18} className="shrink-0 text-blue-500" />{gpsText}</span>
        {gps.state !== "checking" && <button onClick={() => locate()} className="shrink-0 font-medium text-blue-600 hover:underline">{gps.state === "idle" ? "Check" : "Check again"}</button>}
      </div>

      <Card className="mt-4" title="Today">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div><dt className="text-xs text-slate-500">In</dt><dd className={`text-lg font-semibold ${rec?.inMin != null && isLate(rec.inMin, s) ? "text-amber-700" : "text-slate-900"}`}>{rec?.inMin != null ? fmtHM(rec.inMin) : "–"}</dd></div>
          <div><dt className="text-xs text-slate-500">Out</dt><dd className="text-lg font-semibold text-slate-900">{rec?.outMin != null ? fmtHM(rec.outMin) : "–"}</dd></div>
          <div><dt className="text-xs text-slate-500">Worked</dt><dd className="text-lg font-semibold text-slate-900">{rec?.inMin != null && rec.outMin != null ? fmtHM(workedMin(rec.inMin, rec.outMin, s)) : "–"}</dd></div>
        </dl>
        {rec?.inMin != null && rec.outMin != null && overtime(TODAY, rec.inMin, rec.outMin, hol, s).hours > 0 && <p className="mt-2 text-center text-sm text-blue-600">Overtime today: {overtime(TODAY, rec.inMin, rec.outMin, hol, s).hours} h at {overtime(TODAY, rec.inMin, rec.outMin, hol, s).rate}×</p>}
      </Card>

      <Card className="mt-4" title="Last 7 days">
        <ul className="divide-y divide-slate-100 text-sm">
          {week.map((d) => {
            const a = data.attendance.find((x) => x.empId === me.id && x.date === d);
            const ot = a?.inMin != null && a.outMin != null ? overtime(d, a.inMin, a.outMin, hol, s) : null;
            const off = hol.has(d) ? "Public holiday" : isRestDay(d, s) ? "Rest day" : null;
            const onLeave = data.requests.some((r) => r.empId === me.id && r.status === "Approved" && d >= r.from && d <= r.to);
            return (
              <li key={d} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-700">{fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}</span>
                {a?.inMin != null
                  ? <span className="text-right"><span className={isLate(a.inMin, s) ? "font-medium text-amber-700" : "text-slate-900"}>{fmtHM(a.inMin)}</span> – {a.outMin != null ? fmtHM(a.outMin) : <span className="text-rose-700">no clock-out</span>}{ot?.hours ? <span className="ml-2 text-blue-600">+{ot.hours} h OT</span> : null}{a.source === "hr" && <span className="ml-2 text-xs text-slate-400">by HR</span>}</span>
                  : <span className={off || onLeave ? "text-slate-400" : "text-rose-700"}>{off ?? (onLeave ? "On leave" : "No record")}</span>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
