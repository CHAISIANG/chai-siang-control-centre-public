"use client";
// The customer's chop and signature on a PAF: keep the chop per customer, place it, and let the customer sign on the salesman's phone.
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { supabase } from "@/lib/supabase";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, ImageUp, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { Modal, btnGhost, btnPrimary, inputCls } from "@/components/finui";
import { claimHash, cleanChop, clamp, DEFAULT_PLACEMENT, fixPlacement, shrinkImage, type Placement } from "@/lib/paf/stamp";

export type Sign = { signature: string; signerName: string; signedAt: string; by: string; hash: string; persisted: boolean; adopt?: boolean };
export type SignOverlayData = { signature?: string; chop?: { src: string; placement: Placement } | null };
/** What a claim already holds, when it was signed earlier (the files live in the claim-files bucket). */
export type SavedSign = { customerCode: string; signaturePath: string; chopPath: string; placement: Placement; signerName: string; signedAt: string; by: string };

const LIB = "cssb.paf.chops.v1"; // sample mode only: kept in this browser
type Lib = Record<string, { src: string; placement: Placement }>;
const readLib = (): Lib => { try { return JSON.parse(localStorage.getItem(LIB) ?? "{}") as Lib; } catch { return {}; } };
const writeLib = (l: Lib) => { try { localStorage.setItem(LIB, JSON.stringify(l)); } catch { /* storage full or blocked */ } };
const nowMYT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()).replace(",", "");
const blobToData = (b: Blob) => new Promise<string>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => bad(new Error("The picture could not be read.")); r.readAsDataURL(b); });
const dataToBlob = async (d: string) => (await fetch(d)).blob();
const dbMsg = (e: { message?: string } | null | undefined) => (e?.message ?? "Something went wrong.").replace(/^.*?ERROR:\s*/, "");
const asPlacement = (j: unknown): Placement => fixPlacement({ ...DEFAULT_PLACEMENT, ...(j as Partial<Placement>) });

/** The chop and signature of one claim. `values` are the claim's cells; the signature only counts while they stay as the customer saw it.
 *  sample: kept in this browser (the preview). live: the chop library, the claim's files and claim_sign() in the database. */
export function useCustomerSign(o: {
  sample?: boolean; customerCode: string; values: Record<string, string>; dateCell: string; onDate: (isoDay: string) => void; by: string;
  saved?: SavedSign | null; useLibrary?: boolean;
}) {
  const { sample = false, customerCode, values, dateCell, onDate, by, saved = null, useLibrary = true } = o;
  const [chop, setChop] = useState<{ src: string } | null>(null);
  const [chopVersion, setChopVersion] = useState(0);
  const [placement, setPlacementState] = useState<Placement>(DEFAULT_PLACEMENT);
  const [sign, setSign] = useState<Sign | null>(null);
  const [err, setErr] = useState("");
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // load what the claim already holds, or else the customer's chop and the last placement used
  useEffect(() => {
    let on = true;
    (async () => {
      setErr("");
      if (saved && first.current && customerCode === saved.customerCode) {
        first.current = false;
        try {
          const [sg, ch] = await Promise.all([supabase.storage.from("claim-files").download(saved.signaturePath), supabase.storage.from("claim-files").download(saved.chopPath)]);
          if (sg.error || ch.error || !sg.data || !ch.data) throw new Error("The saved signature could not be opened.");
          const [signature, src] = await Promise.all([blobToData(sg.data), blobToData(ch.data)]);
          if (!on) return;
          setChop({ src }); setPlacementState(saved.placement);
          setSign({ signature, signerName: saved.signerName, signedAt: saved.signedAt, by: saved.by, hash: "", persisted: true, adopt: true });
        } catch (e) { if (on) setErr((e as Error).message); }
        return;
      }
      first.current = false;
      setSign(null); setChop(null); setPlacementState(DEFAULT_PLACEMENT);
      if (!customerCode || !useLibrary) return;
      if (sample) {
        const hit = readLib()[customerCode];
        if (on && hit) { setChop({ src: hit.src }); setPlacementState(hit.placement); }
        return;
      }
      const row = await supabase.from("customer_chops").select("path, placement").eq("customer_code", customerCode).maybeSingle();
      if (!on || !row.data) return;
      const img = await supabase.storage.from("customer-chops").download(row.data.path as string);
      if (!on || img.error || !img.data) return;
      const src = await blobToData(img.data);
      if (on) { setChop({ src }); setPlacementState(asPlacement(row.data.placement)); }
    })().catch(() => { /* a chop that cannot be loaded just means none is shown */ });
    return () => { on = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerCode]);

  const hash = useMemo(() => claimHash(values, [dateCell], chop ? placement : null, chopVersion), [values, dateCell, placement, chop, chopVersion]);
  // a signature that was saved earlier counts as signed from the moment it is loaded, as the claim looked then
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sign?.adopt) setSign({ ...sign, hash, adopt: false });
  }, [sign, hash]);
  const signed = !!sign && !sign.adopt && !!chop && sign.hash === hash;
  const stale = !!sign && !sign.adopt && !signed;

  const keepLibrary = (src: string | null, p: Placement) => {
    if (!sample || !customerCode) return;
    const lib = readLib();
    if (src) lib[customerCode] = { src, placement: p }; else delete lib[customerCode];
    writeLib(lib);
  };
  const keepPlacement = (p: Placement) => {
    if (sample) { keepLibrary(chop?.src ?? null, p); return; }
    if (!customerCode || !chop || !useLibrary) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void supabase.rpc("chop_placement_save", { p_customer: customerCode, p_placement: p }); }, 700);
  };

  return {
    chop, placement, sign, signed, stale, err, hash,
    /** a customer picked from the list, so a chop can be kept for them */
    ready: sample || !!customerCode,
    setPlacement: (p: Placement) => { const f = fixPlacement(p); setPlacementState(f); keepPlacement(f); },
    resetPlacement: () => { setPlacementState(DEFAULT_PLACEMENT); keepPlacement(DEFAULT_PLACEMENT); },
    async addChop(file: File) {
      setErr("");
      if (!sample && !customerCode) { setErr("Choose the customer from the list first: type part of the name and pick it from the list that appears."); return; }
      if (/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name)) { setErr("This is an iPhone HEIC photo, which cannot be opened here. Take the photo with Take photo instead, or send it to yourself as a JPG."); return; }
      if (!/^image\//.test(file.type)) { setErr("Choose a photo (JPG or PNG). PDFs and other files cannot be used for the chop."); return; }
      try {
        let src: string;
        try { src = await shrinkImage(file); } catch { throw new Error("This picture could not be opened. Use a JPG or PNG photo."); }
        if (sample) { keepLibrary(src, placement); }
        else {
          const path = `${customerCode}/${Date.now()}-chop.png`;
          const up = await supabase.storage.from("customer-chops").upload(path, await dataToBlob(src), { upsert: false, contentType: "image/png" });
          if (up.error) throw new Error(/row-level security|violates|unauthori/i.test(up.error.message) ? "This chop cannot be kept: the customer is not in the customer list, or your role cannot make PAF claims." : /exceed|too large|size/i.test(up.error.message) ? "The photo is too large. Take it again, closer to the stamp." : dbMsg(up.error));
          const r = await supabase.rpc("chop_save", { p_customer: customerCode, p_path: path, p_placement: placement });
          if (r.error) throw new Error(dbMsg(r.error));
        }
        setChop({ src }); setChopVersion((v) => v + 1);
      } catch (e) { setErr((e as Error).message); }
    },
    async removeChop() {
      setErr("");
      if (!sample) { const r = await supabase.rpc("chop_remove", { p_customer: customerCode }); if (r.error) { setErr(dbMsg(r.error)); return; } }
      else keepLibrary(null, placement);
      setChop(null); setChopVersion((v) => v + 1);
    },
    saveSignature(signature: string, signerName: string) {
      const signedAt = nowMYT();
      onDate(signedAt.slice(0, 10));
      // the signing date is left out of the fingerprint, so filling it in does not void the signature
      setSign({ signature, signerName: signerName.trim(), signedAt, by, hash, persisted: false });
    },
    clearSignature: () => setSign(null),
    /** Called after the claim is saved: puts a new signature and the chop copy on the claim. Nothing happens if the signature was saved before. */
    async commit(claimId: string): Promise<string | null> {
      if (sample || !signed || !sign || sign.persisted || !chop) return null;
      try {
        const stamp = Date.now();
        const sigPath = `${claimId}/sign-${stamp}-signature.png`, chopPath = `${claimId}/sign-${stamp}-chop.png`;
        const [a, b] = await Promise.all([
          supabase.storage.from("claim-files").upload(sigPath, await dataToBlob(sign.signature), { upsert: false, contentType: "image/png" }),
          supabase.storage.from("claim-files").upload(chopPath, await dataToBlob(chop.src), { upsert: false, contentType: "image/png" }),
        ]);
        if (a.error) throw new Error(dbMsg(a.error));
        if (b.error) throw new Error(dbMsg(b.error));
        const r = await supabase.rpc("claim_sign", { p_id: claimId, p_signature_path: sigPath, p_chop_path: chopPath, p_placement: placement, p_signer: sign.signerName });
        if (r.error) throw new Error(dbMsg(r.error));
        setSign({ ...sign, persisted: true });
        return null;
      } catch (e) { return (e as Error).message; }
    },
    overlay: { signature: signed ? sign?.signature : undefined, chop: chop ? { src: chop.src, placement } : null } as SignOverlayData,
  };
}
export type CustomerSignState = ReturnType<typeof useCustomerSign>;

/** The chop, cleaned and placed inside whatever box it is put in (the box must be position: relative). */
export function ChopImg({ src, placement }: { src: string; placement: Placement }) {
  const [url, setUrl] = useState(src);
  useEffect(() => {
    let on = true;
    cleanChop(src, placement.white, placement.ink).then((u) => { if (on) setUrl(u); }).catch(() => { if (on) setUrl(src); });
    return () => { on = false; };
  }, [src, placement.white, placement.ink]);
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="Customer chop" draggable={false}
      style={{ position: "absolute", left: `${placement.x}%`, top: `${placement.y}%`, height: `${placement.size}%`, width: "auto", maxWidth: "none", transform: `translate(-50%, -50%) rotate(${placement.rot}deg)`, mixBlendMode: "multiply", pointerEvents: "none", userSelect: "none" }} />
  );
}
/** Signature and chop together, filling the box they are in. */
export function SignOverlay({ data }: { data: SignOverlayData }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {data.signature && <img src={data.signature} alt="Customer signature" draggable={false} style={{ position: "absolute", left: "4%", top: "6%", width: "56%", height: "88%", objectFit: "contain", pointerEvents: "none" }} />}
      {data.chop && <ChopImg src={data.chop.src} placement={data.chop.placement} />}
    </>
  );
}

/** A finger-drawn signature on a canvas. */
function SignaturePad({ customerName, onClose, onDone }: { customerName: string; onClose: () => void; onDone: (png: string, name: string) => void }) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [has, setHas] = useState(false);
  const [name, setName] = useState(customerName);
  const [agree, setAgree] = useState(false);
  const pt = (e: RPointerEvent<HTMLCanvasElement>) => { const r = cv.current!.getBoundingClientRect(); return { x: ((e.clientX - r.left) / r.width) * cv.current!.width, y: ((e.clientY - r.top) / r.height) * cv.current!.height }; };
  const down = (e: RPointerEvent<HTMLCanvasElement>) => { const g = cv.current!.getContext("2d")!; cv.current!.setPointerCapture(e.pointerId); const p = pt(e); g.beginPath(); g.moveTo(p.x, p.y); g.lineWidth = 4; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#0b1f4d"; setDrawing(true); };
  const move = (e: RPointerEvent<HTMLCanvasElement>) => { if (!drawing) return; const g = cv.current!.getContext("2d")!; const p = pt(e); g.lineTo(p.x, p.y); g.stroke(); setHas(true); };
  const up = () => setDrawing(false);
  const clear = () => { const c = cv.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setHas(false); };
  return (
    <Modal title="Customer signs" onClose={onClose} wide>
      <p className="text-sm text-slate-600">Hand the phone to the customer. They read the PAF, then sign with a finger in the box.</p>
      <canvas ref={cv} width={900} height={520} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
        className="mt-3 w-full touch-none rounded-lg border-2 border-dashed border-slate-300 bg-white" aria-label="Signature box" />
      <div className="mt-1 flex justify-between text-xs text-slate-500"><span>Sign above the line</span><button type="button" onClick={clear} className="inline-flex items-center gap-1 text-indigo-700 hover:underline"><RotateCcw size={12} /> Clear</button></div>
      <label className="mt-3 block text-sm font-medium text-slate-700">Customer&apos;s name<input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="mt-3 flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read this claim form and I agree to it on behalf of the customer.</label>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={!has || !agree || !name.trim()} onClick={() => onDone(cv.current!.toDataURL("image/png"), name)} className={btnPrimary}>Save signature</button>
      </div>
    </Modal>
  );
}

const slider = "mt-1 w-full";
/** The panel next to the claim: the chop, where it sits, and the customer's signature. */
export function SignCard({ s, customerName, aspect = 3.2, locked = false }: { s: CustomerSignState; customerName: string; aspect?: number; locked?: boolean }) {
  const [pad, setPad] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const p = s.placement;
  const nudge = (dx: number, dy: number) => s.setPlacement({ ...p, x: clamp(p.x + dx, 0, 100), y: clamp(p.y + dy, 0, 100) });
  const dragTo = useCallback((e: RPointerEvent<HTMLDivElement>) => {
    const r = box.current!.getBoundingClientRect();
    s.setPlacement({ ...p, x: clamp(((e.clientX - r.left) / r.width) * 100, 0, 100), y: clamp(((e.clientY - r.top) / r.height) * 100, 0, 100) });
  }, [p, s]);
  const row = (label: string, v: number, min: number, max: number, set: (n: number) => void, unit = "") => (
    <label key={label} className="block text-sm text-slate-700"><span className="flex justify-between"><span>{label}</span><span className="text-slate-500">{Math.round(v)}{unit}</span></span>
      <input type="range" className={slider} min={min} max={max} value={v} disabled={locked} onChange={(e) => set(Number(e.target.value))} /></label>
  );
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="font-semibold text-slate-900">Customer chop and signature</h3>
      <p className="mt-0.5 text-sm text-slate-600">{customerName ? `For ${customerName}.` : "Choose the customer first."} Both are needed before the claim goes to the supervisor.</p>

      <div ref={box} className="relative mt-3 w-full select-none overflow-hidden rounded-md border border-slate-300 bg-white" style={{ aspectRatio: String(aspect), touchAction: "none", cursor: s.chop && !locked ? "grab" : "default" }}
        onPointerDown={(e) => { if (!s.chop || locked) return; e.currentTarget.setPointerCapture(e.pointerId); setDrag(true); dragTo(e); }}
        onPointerMove={(e) => { if (drag) dragTo(e); }} onPointerUp={() => setDrag(false)} onPointerCancel={() => setDrag(false)} aria-label="Signing box: drag the chop to move it">
        <div className="absolute inset-x-3 bottom-4 border-t border-slate-400" aria-hidden />
        <span className="absolute bottom-0.5 left-3 text-[10px] text-slate-400">Name: {customerName || "customer"}</span>
        {s.chop || s.overlay.signature ? <SignOverlay data={{ signature: s.sign?.signature, chop: s.overlay.chop }} /> : <div className="flex h-full items-center justify-center text-sm text-slate-400">No chop yet</div>}
      </div>
      <p className="mt-1 text-xs text-slate-500">This is the signing box on the form. {s.chop ? "Drag the chop to move it." : ""}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {/* two ways in: the camera, or a photo or scan already on the phone or computer */}
        <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void s.addChop(f); e.target.value = ""; }} />
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void s.addChop(f); e.target.value = ""; }} />
        <button disabled={!customerName || locked} onClick={() => camera.current?.click()} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><Camera size={16} /> {s.chop ? "Retake chop photo" : "Take chop photo"}</button>
        <button disabled={!customerName || locked} onClick={() => file.current?.click()} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><ImageUp size={16} /> Choose photo or scan</button>
        {s.chop && !locked && <button onClick={s.removeChop} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm !text-rose-700`}><Trash2 size={16} /> Remove chop</button>}
      </div>
      {s.err && <p role="alert" className="mt-2 text-sm text-rose-700">{s.err}</p>}
      {customerName && !s.ready && !locked && <p className="mt-2 text-sm text-amber-800">Pick the customer from the list (not typed by hand) so the chop can be kept for them.</p>}
      {!s.chop && customerName && <p className="mt-2 text-xs text-slate-500">Photograph the customer&apos;s stamp on white paper, in good light. It is kept for this customer and used on their next PAF too.</p>}

      {s.chop && (
        <div className="mt-3 space-y-2.5 rounded-md bg-slate-50 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-800">Place the chop</span>
            <div className="flex items-center gap-1" role="group" aria-label="Move the chop">
              {([["Left", ArrowLeft, -2, 0], ["Up", ArrowUp, 0, -2], ["Down", ArrowDown, 0, 2], ["Right", ArrowRight, 2, 0]] as const).map(([n, Icon, dx, dy]) => (
                <button key={n} disabled={locked} onClick={() => nudge(dx, dy)} aria-label={`Move ${n.toLowerCase()}`} className="rounded border border-slate-300 bg-white p-1.5 text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Icon size={14} /></button>
              ))}
            </div>
          </div>
          {row("Size", p.size, 20, 160, (n) => s.setPlacement({ ...p, size: n }), "%")}
          {row("Turn", p.rot, -180, 180, (n) => s.setPlacement({ ...p, rot: n }), "°")}
          {row("Hide the white paper", p.white, 0, 100, (n) => s.setPlacement({ ...p, white: n }))}
          {row("Ink: lighter to darker", p.ink, 50, 150, (n) => s.setPlacement({ ...p, ink: n }))}
          <button disabled={locked} onClick={s.resetPlacement} className="inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline disabled:opacity-40"><RotateCcw size={13} /> Reset the chop</button>
        </div>
      )}

      <div className="mt-3 border-t border-slate-200 pt-3">
        {s.signed && s.sign && <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">Signed by <b>{s.sign.signerName}</b> on {s.sign.signedAt}, on {s.sign.by}&apos;s phone.</p>}
        {s.stale && <p role="alert" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">The claim or the chop changed after the customer signed, so the signature does not count. The customer must sign again.</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <button disabled={!s.chop || !customerName || locked} onClick={() => setPad(true)} className={`${btnPrimary} inline-flex items-center gap-2 !px-3 !py-1.5 !text-sm`}><PenLine size={16} /> {s.signed ? "Customer signs again" : "Customer signs"}</button>
          {s.sign && !locked && <button onClick={s.clearSignature} className={`${btnGhost} !px-3 !py-1.5 !text-sm`}>Clear signature</button>}
        </div>
        {!s.chop && customerName && <p className="mt-1 text-xs text-slate-500">Add the chop first, so the customer signs the form as it will be sent.</p>}
        {!s.signed && <p className="mt-2 text-xs font-medium text-amber-800">Not signed yet: the claim cannot be submitted.</p>}
      </div>
      {pad && <SignaturePad customerName={customerName} onClose={() => setPad(false)} onDone={(png, name) => { s.saveSignature(png, name); setPad(false); }} />}
    </div>
  );
}
