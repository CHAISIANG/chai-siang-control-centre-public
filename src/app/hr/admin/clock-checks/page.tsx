"use client";
/* eslint-disable @next/next/no-img-element -- selfies are small in-page photos, not site images */
import { useState } from "react";
import { MapPin, QrCode } from "lucide-react";
import { Badge, Card, Td, Th } from "@/components/ui";
import { Modal, btnBlue, btnLine, field } from "@/components/hr/ui";
import { FLAG_TEXT, fmtDate, fmtHM, metres, WORK_TYPES } from "@/lib/hr/rules";
import { findEmp } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";
import type { Attendance } from "@/lib/hr/sample";
import { useT } from "@/lib/i18n";

const away = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const mapUrl = (lat: number, lng: number) => `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

/** Clock-ins that did not match the usual check, for HR to accept or not. Nothing here blocks pay by itself. */
export default function ClockChecks() {
  const { t } = useT();
  const { data, role, reviewClock } = useHr();
  const [tab, setTab] = useState<"open" | "done">("open");
  const [reject, setReject] = useState<Attendance | null>(null);
  const [why, setWhy] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const s = data.settings;
  const flagged = data.attendance.filter((a) => a.flags?.length).sort((a, b) => b.date.localeCompare(a.date));
  const open = flagged.filter((a) => !a.review), done = flagged.filter((a) => a.review);
  const rows = tab === "open" ? open : done;
  const say = (r: { ok: boolean; text: string }) => { setMsg(r); setTimeout(() => setMsg(null), 5000); };

  if (role !== "hr") return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{t("Clock-in checks are for HR. Switch “Viewing as” to HR admin to see them.")}</p>;

  const where = (lat: number | undefined, lng: number | undefined, office: boolean) => lat == null || lng == null
    ? <span className="text-rose-700">{t("Not shared")}</span>
    : <a href={mapUrl(lat, lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline"><MapPin size={14} />{office ? t("{d} from office", { d: away(metres(lat, lng, s.officeLat, s.officeLng)) }) : t("Open map")}</a>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="font-display text-2xl font-semibold text-slate-900">{t("Clock-in checks")}</h1><p className="text-slate-500">{t("Clock-ins and clock-outs that did not match the usual check. Accept them, or mark them and fix the hours in Employees.")}</p></div>
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">{([["open", t("To check ({n})", { n: open.length })], ["done", t("Checked ({n})", { n: done.length })]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{l}</button>)}</div>
      </div>
      {msg && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{t(msg.text)}</p>}

      <Card className="mt-4">
        {rows.length === 0 ? <p className="py-6 text-center text-slate-500">{t(tab === "open" ? "Nothing to check. Every clock-in matched the usual check." : "Nothing checked yet.")}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Date</Th><Th>Employee</Th><Th>In</Th><Th>Out</Th><Th>What HR should look at</Th><Th>Selfie</Th><Th>{tab === "open" ? "Decide" : "Decision"}</Th></tr></thead>
              <tbody>
                {rows.map((a) => {
                  const e = findEmp(data, a.empId);
                  const office = (e?.workType ?? "office") === "office";
                  const by = a.review ? findEmp(data, a.review.by) : null;
                  return (
                    <tr key={`${a.empId}-${a.date}`} className="border-b border-slate-100 align-top">
                      <Td first className="whitespace-nowrap">{fmtDate(a.date, { weekday: "short", day: "numeric", month: "short" })}</Td>
                      <Td><div className="font-medium text-slate-900">{e?.name ?? a.empId}</div><div className="text-sm text-slate-500">{t(WORK_TYPES.find((w) => w.code === (e?.workType ?? "office"))!.name)}</div></Td>
                      <Td className="whitespace-nowrap"><div>{a.inMin != null ? fmtHM(a.inMin) : "–"}{a.method === "qr" && <span title={t("Scanned the office screen")} className="ml-1.5 inline-flex align-middle text-emerald-700"><QrCode size={14} /></span>}</div><div className="text-sm">{where(a.lat, a.lng, office)}</div>{a.inAcc != null && a.inAcc > 300 && <div className="text-xs text-amber-700">{t("accurate to {d} only", { d: away(a.inAcc) })}</div>}</Td>
                      <Td className="whitespace-nowrap"><div>{a.outMin != null ? fmtHM(a.outMin) : "–"}</div>{a.outMin != null && <div className="text-sm">{where(a.outLat, a.outLng, office)}</div>}</Td>
                      <Td><div className="flex flex-wrap gap-1">{a.flags!.map((f) => <Badge key={f} tone={f === "weak_gps" ? "grey" : "amber"}>{FLAG_TEXT[f]}</Badge>)}</div></Td>
                      <Td>{a.selfie ? <button onClick={() => setPhoto(a.selfie!)} aria-label={`${t("Selfie of")} ${e?.name}`}><img src={a.selfie} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-slate-200" /></button> : <span className="text-sm text-slate-400">–</span>}</Td>
                      <Td>{a.review
                        ? <div className="text-sm"><Badge tone={a.review.ok ? "green" : "red"}>{t(a.review.ok ? "Fine" : "Not accepted")}</Badge><div className="mt-1 text-slate-600">{by?.name.split(" ")[0] ?? a.review.byName ?? "HR"}, {fmtDate(a.review.at)}{a.review.note ? `: ${a.review.note}` : ""}</div></div>
                        : <div className="flex flex-wrap gap-1.5"><button onClick={async () => say(await reviewClock(a.empId, a.date, true, ""))} className="rounded-md border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-800 hover:bg-emerald-100">{t("Fine")}</button><button onClick={() => { setReject(a); setWhy(""); }} className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">{t("Not accepted")}</button></div>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-slate-500">{t("Office staff")}: {t(s.qrRequired ? "must scan the office screen" : "office screen not required")}{s.gpsRequired ? ` ${t("and be within {m} m to clock in", { m: s.gpsRadiusM })}` : ""}. {t("Field staff: location recorded")}{s.fieldSelfie ? `, ${t("selfie needed")}` : ""}. {t("Clock-out is never blocked; it is flagged here instead. Change this in HR settings.")}</p>
      </Card>

      {reject && (
        <Modal title={t("Not accepted")} onClose={() => setReject(null)}>
          <p className="text-slate-600">{findEmp(data, reject.empId)?.name}, {fmtDate(reject.date)}. {t("Say what was wrong; the employee's hours stay as they are until you fix them in Employees.")}</p>
          <label className="mt-3 block text-sm font-medium text-slate-700">{t("Reason")}<textarea rows={3} value={why} onChange={(e) => setWhy(e.target.value)} className={field} placeholder={t("For example: was not at the office, asked to explain")} /></label>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setReject(null)} className={btnLine}>{t("Cancel")}</button><button disabled={!why.trim()} onClick={async () => { const r = await reviewClock(reject.empId, reject.date, false, why); say(r); if (r.ok) setReject(null); }} className={btnBlue}>{t("Save")}</button></div>
        </Modal>
      )}
      {photo && <Modal title={t("Selfie at clock-in")} onClose={() => setPhoto(null)}><img src={photo} alt={t("Selfie at clock-in")} className="mx-auto max-h-[60vh] rounded-lg" /></Modal>}
    </div>
  );
}
