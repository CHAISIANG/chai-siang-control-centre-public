"use client";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Maximize } from "lucide-react";
import { useHr } from "@/lib/hr/store";

/**
 * The screen at the office door or reception: a code that changes every minute, made by the database.
 * Staff scan it with the phone camera, which opens the clock-in page with the code filled in.
 */
export default function OfficeQr() {
  const { role, live, officeCode } = useHr();
  const [code, setCode] = useState("");
  const [secs, setSecs] = useState(60);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState("");
  const [svg, setSvg] = useState("");

  const fetchCode = useCallback(async () => {
    const r = await officeCode();
    if ("error" in r) { setErr(r.error); setCode(""); return; }
    setErr(""); setCode(r.code); setSecs(r.seconds); setLeft(r.left);
  }, [officeCode]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the first code arrives after the await
  useEffect(() => { void fetchCode(); }, [fetchCode]);
  // count down each second; when the code runs out, ask for the next one
  useEffect(() => {
    if (!code) return;
    const t = setInterval(() => setLeft((x) => x - 1), 1000);
    return () => clearInterval(t);
  }, [code]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the next code when this one runs out
  useEffect(() => { if (code && left <= 0) void fetchCode(); }, [left, code, fetchCode]);
  useEffect(() => {
    if (!code) return;
    QRCode.toString(`${window.location.origin}/hr/clock?k=${code}`, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0f172a", light: "#ffffff" } }).then(setSvg).catch(() => setSvg(""));
  }, [code]);

  if (!live && role !== "hr") return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">The office screen is opened by HR on the reception tablet or PC. Switch “Viewing as” to HR admin to see it.</p>;
  if (err) return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{err}</p>;
  return (
    <div id="office-qr" className="mx-auto flex max-w-lg flex-col items-center bg-white px-4 py-6 text-center">
      <h1 className="font-display text-3xl font-semibold text-slate-900">Clock in here</h1>
      <p className="mt-1 text-lg text-slate-600">Scan with your phone camera, then tap Clock in.</p>
      <div className="mt-6 aspect-square w-full max-w-sm rounded-2xl border-4 border-slate-900 p-3 [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="Clock-in code" dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="mt-5 text-sm text-slate-500">No camera? Type this code on the clock-in page</p>
      <p className="font-display text-6xl font-semibold tabular-nums tracking-[0.25em] text-slate-900">{code || "––––––"}</p>
      <div className="mt-4 h-2 w-full max-w-sm overflow-hidden rounded-full bg-slate-100" aria-hidden><div className="h-full bg-blue-500 transition-[width] duration-1000 ease-linear" style={{ width: `${(Math.max(0, left) / secs) * 100}%` }} /></div>
      <p className="mt-1 text-sm text-slate-500">New code in {Math.max(0, left)} s. A photo of this code stops working within {Math.max(1, Math.round((secs * 2) / 60))} minutes.</p>
      <button onClick={() => document.getElementById("office-qr")?.requestFullscreen?.()} className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"><Maximize size={16} /> Full screen</button>
    </div>
  );
}
