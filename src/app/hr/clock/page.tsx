"use client";
/* eslint-disable @next/next/no-img-element -- selfies are small in-page photos, not site images */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Camera, Check, MapPin, QrCode, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui";
import { addDays, clockCheck, codeValid, SAMPLE_OFFICE_SECRET, fmtDate, fmtHM, hm, isLate, isRestDay, overtime, WORK_TYPES, workedMin, type Fix } from "@/lib/hr/rules";
import { TODAY } from "@/lib/hr/sample";
import { holidaySetFor } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";
import { useT } from "@/lib/i18n";

const subscribe = (cb: () => void) => { const t = setInterval(cb, 1000); return () => clearInterval(t); };
const timeNow = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(new Date());
type Gps = { state: "idle" | "checking" | "ok" | "denied"; fix?: Fix };
const away = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);

/** A selfie made small enough to keep: about 240 px, JPEG. */
async function smallPhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
    const k = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.75);
  } finally { URL.revokeObjectURL(url); }
}

/** One line of the "before you clock in" list. */
function Need({ done, warn, icon, title, detail, action }: { done: boolean; warn?: boolean; icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${done ? "bg-emerald-100 text-emerald-700" : warn ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-500"}`}>{done ? <Check size={16} /> : icon}</span>
      <span className="min-w-0 flex-1"><span className="block font-medium text-slate-900">{title}</span><span className={`block text-sm ${warn ? "text-rose-700" : "text-slate-500"}`}>{detail}</span></span>
      {action}
    </li>
  );
}

export default function ClockPage() {
  const { t } = useT();
  const { data, me, clock, live } = useHr();
  const s = data.settings;
  const type = me.workType ?? "office";
  const hol = holidaySetFor(data, me.state);
  const time = useSyncExternalStore(subscribe, timeNow, () => "--:--:--");
  const rec = data.attendance.find((a) => a.empId === me.id && a.date === TODAY);
  const [gps, setGps] = useState<Gps>({ state: "idle" });
  const [code, setCode] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("k") ?? ""));
  const [typing, setTyping] = useState(false);
  const [selfie, setSelfie] = useState<string | undefined>();
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const photo = useRef<HTMLInputElement>(null);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 6000); return () => clearTimeout(t); } }, [flash]);

  const phase = rec?.inMin == null ? "in" : rec.outMin == null ? "out" : "done";
  // in the app the database checks the code; this screen only checks it in the sample
  const qrOk = !!code && (live ? /^\d{6}$/.test(code) : codeValid(code, s.qrSeconds, SAMPLE_OFFICE_SECRET));
  const check = phase === "done" ? null : clockCheck({ type, phase, s, fix: gps.fix ?? null, qrOk, selfie: !!selfie });
  const needQr = type === "office" && phase === "in" && s.qrRequired;
  const needSelfie = type === "field" && phase === "in" && s.fieldSelfie;

  function locate(then?: (g: Gps) => void) {
    if (!navigator.geolocation) { const g: Gps = { state: "denied" }; setGps(g); then?.(g); return; }
    setGps({ state: "checking" });
    navigator.geolocation.getCurrentPosition((p) => {
      const g: Gps = { state: "ok", fix: { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy } };
      setGps(g); then?.(g);
    }, () => { const g: Gps = { state: "denied" }; setGps(g); then?.(g); }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }
  async function send(g: Gps) {
    setBusy(true);
    const r = await clock({ fix: g.fix ?? null, qrOk, code: needQr && qrOk ? code : undefined, selfie: phase === "in" && type === "field" ? selfie : undefined });
    setBusy(false);
    if (!r.ok) { setFlash(r); return; }
    const now = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
    const late = r.text === "in" && isLate(hm(now), s);
    setFlash({ ok: true, text: r.text === "in" ? `${t("Clocked in at {time}", { time: now })}${late ? `. ${t("That is after {time}, so it counts as late.", { time: fmtHM(hm(s.workStart) + s.lateAfterMin) })}` : "."}` : t("Clocked out at {time}. Have a good evening.", { time: now }) });
    setSelfie(undefined); setCode("");
  }
  // the location is read fresh at the moment of pressing, so an old reading is never used
  function press() { if (gps.state === "checking" || busy) return; locate((g) => void send(g)); }
  // look up the location as soon as the page opens, to show where you are
  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- one lookup when the page opens
  useEffect(() => { if (phase !== "done") locate(); }, []);

  const dist = check?.dist ?? null;
  const tooFar = type === "office" && dist !== null && dist > s.gpsRadiusM;
  const locTitle = t(type === "field" ? "Your location is recorded" : s.gpsRequired && phase === "in" ? "Be at the office" : "Your location is recorded");
  const locDetail = gps.state === "checking" ? t("Checking where you are…")
    : gps.state === "denied" ? t(type === "office" && s.gpsRequired && phase === "in" ? "Location not shared. Allow location for this site in your browser." : "Location not shared. You can still clock in, but HR will see it.")
    : !gps.fix ? t("Not checked yet")
    : type === "field" ? `${t("Found, accurate to {d}", { d: away(gps.fix.acc) })}${gps.fix.acc > 300 ? `. ${t("Weak signal: HR will see it.")}` : ""}`
    : tooFar ? `${t("{d} from the office", { d: away(dist!) })}${s.gpsRequired && phase === "in" ? `: ${t("too far to clock in")}` : `. ${t("HR will see it.")}`}` : t("At the office ({d} away)", { d: away(dist!) });
  // the reason a clock-in is blocked comes from the rules in English
  const blockText = (b: string) => { const m = /^You are (.+) from the office\./.exec(b); return m ? t("You are {d} from the office. Clock in when you are there.", { d: m[1] }) : t(b); };
  const blocked = !!check?.block && !(check.block.startsWith("Share") || check.block.startsWith("You are")); // location gets read when pressing
  const ring = phase === "done" ? "bg-slate-300 ring-slate-100" : blocked ? "bg-slate-400 ring-slate-200" : phase === "in" ? "bg-blue-500 hover:bg-blue-600 ring-blue-200" : "bg-amber-500 hover:bg-amber-600 ring-amber-200";
  const week = Array.from({ length: 7 }, (_, i) => addDays(TODAY, -(i + 1)));

  return (
    <div className="mx-auto max-w-md">
      <div className="text-center">
        <h1 className="sr-only">{t("Clock in or out")}</h1>
        <p className="text-slate-500">{fmtDate(TODAY, { weekday: "long", day: "numeric", month: "long" })}</p>
        <p className="font-display text-5xl font-semibold tabular-nums tracking-tight text-slate-900">{time}</p>
        <p className="mt-1 text-sm text-slate-500">{t("Working hours")} {s.workStart} – {s.workEnd} · {t(WORK_TYPES.find((w) => w.code === type)!.name)}</p>
      </div>

      <div className="my-7 flex justify-center">
        <button onClick={press} disabled={phase === "done" || gps.state === "checking" || busy || blocked}
          className={`flex h-56 w-56 flex-col items-center justify-center rounded-full text-white shadow-lg ring-8 transition-transform active:scale-95 disabled:cursor-default ${ring}`}>
          <span className="text-3xl font-semibold">{t(phase === "done" ? "Done" : busy ? "Saving…" : phase === "in" ? "Clock in" : "Clock out")}</span>
          <span className="mt-1 px-6 text-sm text-white/85">{phase === "in" ? (blocked ? blockText(check!.block!) : t("Tap to start your day")) : phase === "out" ? t("In since {time}", { time: fmtHM(rec!.inMin!) }) : t("See you tomorrow")}</span>
        </button>
      </div>
      {flash && <p role="status" className={`mb-4 rounded-lg px-3 py-2 text-center text-sm ${flash.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{t(flash.text)}</p>}

      {phase !== "done" && (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-4">
          <Need done={!!gps.fix && !(tooFar && s.gpsRequired && phase === "in")} warn={gps.state === "denied" || (tooFar && s.gpsRequired && phase === "in")} icon={<MapPin size={16} />} title={locTitle} detail={locDetail}
            action={gps.state !== "checking" && <button onClick={() => locate()} className="shrink-0 text-sm font-medium text-blue-600 hover:underline">{t("Check again")}</button>} />
          {needQr && (
            <Need done={qrOk} warn={!!code && !qrOk} icon={<QrCode size={16} />} title={t("Scan the office screen")}
              detail={t(qrOk ? "Office code accepted" : code ? "That code has expired or is wrong. Scan the screen again." : "Point your phone camera at the code on the office screen, or type the 6 digits under it.")}
              action={!qrOk && <button onClick={() => setTyping(!typing)} className="shrink-0 text-sm font-medium text-blue-600 hover:underline">{t("Type it")}</button>} />
          )}
          {needQr && typing && !qrOk && (
            <li className="pb-3"><label className="text-sm text-slate-700">{t("Code on the office screen")}
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-center text-2xl tracking-[0.4em] tabular-nums" /></label></li>
          )}
          {needSelfie && (
            <Need done={!!selfie} icon={<Camera size={16} />} title={t("Take a selfie")} detail={t(selfie ? "Photo ready. It is kept with today's clock-in." : "Shows HR it is really you clocking in.")}
              action={<>
                {selfie && <img src={selfie} alt={t("Your selfie")} className="h-10 w-10 shrink-0 rounded-full object-cover" />}
                <button onClick={() => photo.current?.click()} className="shrink-0 text-sm font-medium text-blue-600 hover:underline">{t(selfie ? "Retake" : "Open camera")}</button>
                <input ref={photo} type="file" accept="image/*" capture="user" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) setSelfie(await smallPhoto(f)); }} />
              </>} />
          )}
        </ul>
      )}
      {rec?.flags?.length ? <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"><TriangleAlert size={16} className="mt-0.5 shrink-0" />{t(rec.flags.length === 1 ? "HR will look at today's record: something did not match the usual check." : "HR will look at today's record: some things did not match the usual check.")}</p> : null}

      <Card className="mt-4" title={t("Today")}>
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div><dt className="text-xs text-slate-500">{t("In")}</dt><dd className={`text-lg font-semibold ${rec?.inMin != null && isLate(rec.inMin, s) ? "text-amber-700" : "text-slate-900"}`}>{rec?.inMin != null ? fmtHM(rec.inMin) : "–"}</dd></div>
          <div><dt className="text-xs text-slate-500">{t("Out")}</dt><dd className="text-lg font-semibold text-slate-900">{rec?.outMin != null ? fmtHM(rec.outMin) : "–"}</dd></div>
          <div><dt className="text-xs text-slate-500">{t("Worked")}</dt><dd className="text-lg font-semibold text-slate-900">{rec?.inMin != null && rec.outMin != null ? fmtHM(workedMin(rec.inMin, rec.outMin, s)) : "–"}</dd></div>
        </dl>
        {rec?.inMin != null && rec.outMin != null && overtime(TODAY, rec.inMin, rec.outMin, hol, s, me.schedule).hours > 0 && <p className="mt-2 text-center text-sm text-blue-600">{t("Overtime today")}: {overtime(TODAY, rec.inMin, rec.outMin, hol, s, me.schedule).hours} h {t("at")} {overtime(TODAY, rec.inMin, rec.outMin, hol, s, me.schedule).rate}×</p>}
      </Card>

      <Card className="mt-4" title={t("Last 7 days")}>
        <ul className="divide-y divide-slate-100 text-sm">
          {week.map((d) => {
            const a = data.attendance.find((x) => x.empId === me.id && x.date === d);
            const ot = a?.inMin != null && a.outMin != null ? overtime(d, a.inMin, a.outMin, hol, s, me.schedule) : null;
            const off = hol.has(d) ? t("Public holiday") : isRestDay(d, s, me.schedule) ? t("Rest day") : null;
            const onLeave = data.requests.some((r) => r.empId === me.id && r.status === "Approved" && d >= r.from && d <= r.to);
            return (
              <li key={d} className="flex items-center justify-between gap-3 py-2">
                <span className="text-slate-700">{fmtDate(d, { weekday: "short", day: "numeric", month: "short" })}</span>
                {a?.inMin != null
                  ? <span className="text-right"><span className={isLate(a.inMin, s) ? "font-medium text-amber-700" : "text-slate-900"}>{fmtHM(a.inMin)}</span> – {a.outMin != null ? fmtHM(a.outMin) : <span className="text-rose-700">{t("no clock-out")}</span>}{ot?.hours ? <span className="ml-2 text-blue-600">+{ot.hours} h {t("OT")}</span> : null}{a.source === "hr" && <span className="ml-2 text-xs text-slate-400">{t("by HR")}</span>}{a.flags?.length && !a.review ? <span className="ml-2 text-xs text-amber-700">{t("HR checking")}</span> : null}</span>
                  : <span className={off || onLeave ? "text-slate-400" : "text-rose-700"}>{off ?? t(onLeave ? "On leave" : "No record")}</span>}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
