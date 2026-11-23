"use client";
import { useRef, useState } from "react";
import { Download, FileUp, History, Plus, TriangleAlert, Wrench } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader } from "@/components/ui";
import { Modal, btnGhost, btnPrimary, inputCls } from "@/components/finui";
import { useAuth } from "@/components/auth";
import { useDeliverySample } from "@/lib/delivery/store";
import { canLoad, CONDITIONS, conditionTone, due, DUE_FIELDS, IMPORT_HEADERS, importLorries, removeLorry, rowsToLorries, saveLorry, setCondition, SIZES, useFleet, warnings, type Condition, type Lorry } from "@/lib/fleet";

const day = (s: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
const blank = (): Lorry => ({ no: "", size: "3 tonne", pallets: null, cartons: null, driver: "", condition: "Good", roadTax: "", insurance: "", puspakom: "", lastService: "", nextService: "", notes: "", history: [] });
const dueCls = { expired: "font-medium text-rose-700", soon: "font-medium text-amber-700", ok: "text-slate-700", none: "text-slate-400" };

/** Our own lorries: size, condition and the dates that must not lapse. Only lorries in order can be loaded. */
export default function Lorries() {
  const sample = useDeliverySample();
  const { lorries } = useFleet(sample);
  const { profile } = useAuth();
  const me = profile?.full_name ?? (sample ? "Sample clerk" : "Logistics");
  const [edit, setEdit] = useState<{ was: string | null; l: Lorry } | null>(null);
  const [cond, setCond] = useState<{ l: Lorry; c: Condition; note: string } | null>(null);
  const [hist, setHist] = useState<Lorry | null>(null);
  const [imp, setImp] = useState<{ lorries: Lorry[]; problems: string[] } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [err, setErr] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const say = (r: { ok: boolean; text: string }) => { setMsg(r); setTimeout(() => setMsg(null), 5000); };

  const ready = lorries.filter((l) => l.condition === "Good").length;
  const service = lorries.filter((l) => l.condition === "Needs service").length;
  const out = lorries.filter((l) => !canLoad(l.condition)).length;
  const papers = lorries.filter((l) => warnings(l).length).length;
  const sorted = [...lorries].sort((a, b) => CONDITIONS.indexOf(b.condition) - CONDITIONS.indexOf(a.condition) || warnings(b).length - warnings(a).length || a.no.localeCompare(b.no));

  async function template() {
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const head = IMPORT_HEADERS.map((value) => ({ value, fontWeight: "bold" as const, backgroundColor: "#fff3bf" }));
    const body = lorries.map((l) => [l.no, l.size, l.pallets ?? "", l.cartons ?? "", l.driver, l.condition, l.roadTax, l.insurance, l.puspakom, l.lastService, l.nextService, l.notes].map((value) => ({ value: String(value) })));
    await writeExcelFile([{ sheet: "Lorries", columns: IMPORT_HEADERS.map(() => ({ width: 16 })), data: [head, ...body] }]).toFile("lorry-list.xlsx");
  }
  async function read(f?: File) {
    if (!f) return;
    const { readSheet } = await import("read-excel-file/browser");
    setImp(rowsToLorries((await readSheet(f)) as unknown[][]));
  }

  return (
    <>
      <PageHeader title="Lorries" sub="Our own lorries: size, condition, and the road tax, insurance, PUSPAKOM and service dates. Lorries in the workshop or off the road cannot be loaded."
        right={<div className="flex flex-wrap gap-2">
          <button onClick={template} className={`${btnGhost} inline-flex items-center gap-1.5 !py-1.5 text-sm`}><Download size={15} /> Excel list</button>
          <button onClick={() => file.current?.click()} className={`${btnGhost} inline-flex items-center gap-1.5 !py-1.5 text-sm`}><FileUp size={15} /> Import from Excel</button>
          <input ref={file} type="file" accept=".xlsx" className="hidden" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
          <button onClick={() => { setEdit({ was: null, l: blank() }); setErr(""); }} className={`${btnPrimary} inline-flex items-center gap-1.5 !py-1.5 text-sm`}><Plus size={15} /> Add lorry</button>
        </div>} />
      {sample && <p className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">Sample lorries, kept in this browser only.</p>}
      {msg && <p role="status" className={`mb-3 rounded-md px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}

      <KpiStrip>
        <Kpi label="Ready to load" value={String(ready)} tone="good" sub={`of ${lorries.length} lorries`} />
        <Kpi label="Needs service" value={String(service)} tone={service ? "warn" : "neutral"} sub="Can still be loaded" />
        <Kpi label="In workshop or off road" value={String(out)} tone={out ? "bad" : "neutral"} sub="Cannot be loaded" />
        <Kpi label="Dates to act on" value={String(papers)} tone={papers ? "warn" : "good"} sub="Expired or due in 30 days" />
      </KpiStrip>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {lorries.length === 0 && <Card><p className="py-6 text-center text-slate-500">No lorries yet. Add them one by one, or import an Excel list.</p></Card>}
        {sorted.map((l) => {
          const w = warnings(l);
          return (
            <Card key={l.no}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2"><span className="text-xl font-semibold tracking-wide text-slate-900">{l.no}</span><Badge tone={conditionTone(l.condition)}>{l.condition}</Badge></div>
                  <div className="text-sm text-slate-600">{l.size}{l.pallets != null ? ` · ${l.pallets} pallets` : ""}{l.cartons != null ? ` · ${l.cartons} cartons` : ""}{l.driver ? ` · ${l.driver}` : ""}</div>
                  {l.notes && <div className="mt-1 text-sm text-slate-700">“{l.notes}”</div>}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={() => setCond({ l, c: l.condition === "Good" ? "Needs service" : "Good", note: "" })} className={`${btnGhost} inline-flex items-center gap-1 !px-2.5 !py-1 text-sm`}><Wrench size={14} /> Condition</button>
                  <button onClick={() => { setEdit({ was: l.no, l: structuredClone(l) }); setErr(""); }} className={`${btnGhost} !px-2.5 !py-1 text-sm`}>Edit</button>
                </div>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                {DUE_FIELDS.map(([k, label]) => <div key={k}><dt className="text-xs text-slate-500">{label}</dt><dd className={dueCls[due(l[k])]}>{day(l[k])}{due(l[k]) === "expired" ? " · expired" : ""}</dd></div>)}
              </dl>
              {w.length > 0 && <p className="mt-2 flex items-start gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-sm text-amber-900"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{w.map((x) => `${x.label} ${x.state === "expired" ? "expired" : "due"} ${day(x.date)}`).join(" · ")}</p>}
              {l.history.length > 0 && <button onClick={() => setHist(l)} className="mt-2 inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"><History size={14} /> History ({l.history.length})</button>}
            </Card>
          );
        })}
      </div>

      {edit && (
        <Modal title={edit.was ? `Edit ${edit.was}` : "Add lorry"} onClose={() => setEdit(null)} wide>
          <LorryForm l={edit.l} onChange={(l) => setEdit({ ...edit, l })} />
          {err && <p role="alert" className="mt-2 text-sm text-rose-700">{err}</p>}
          <div className="mt-4 flex flex-wrap justify-between gap-2">
            {edit.was ? <button onClick={async () => { if (confirm(`Remove ${edit.was} from the list? Past deliveries keep its plate.`)) { say(await removeLorry(sample, edit.was!)); setEdit(null); } }} className="text-sm text-rose-700 hover:underline">Remove from list</button> : <span />}
            <div className="flex gap-2"><button onClick={() => setEdit(null)} className={btnGhost}>Cancel</button><button onClick={async () => { const r = await saveLorry(sample, edit.was, edit.l, me); if (r.ok) { setEdit(null); say(r); } else setErr(r.text); }} className={btnPrimary}>Save</button></div>
          </div>
        </Modal>
      )}

      {cond && (
        <Modal title={`Condition of ${cond.l.no}`} onClose={() => setCond(null)}>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Condition">
            {CONDITIONS.map((c) => <button key={c} role="radio" aria-checked={cond.c === c} onClick={() => setCond({ ...cond, c })} className={`rounded-md border px-3 py-2 text-sm font-medium ${cond.c === c ? "border-indigo-600 bg-indigo-50 text-indigo-800" : "border-slate-300 text-slate-700"}`}>{c}</button>)}
          </div>
          <label className="mt-3 block text-sm font-medium text-slate-700">{cond.c === "Good" ? "Note (optional)" : "What is wrong (required)"}<textarea rows={2} value={cond.note} onChange={(e) => setCond({ ...cond, note: e.target.value })} className={inputCls} placeholder={cond.c === "Good" ? "For example: repaired, serviced" : "For example: brakes squeaking, tyre worn"} /></label>
          <p className="mt-2 text-xs text-slate-500">{canLoad(cond.c) ? "This lorry can still be loaded." : "This lorry cannot be loaded until it is set back to Good or Needs service."}</p>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setCond(null)} className={btnGhost}>Cancel</button><button disabled={cond.c !== "Good" && !cond.note.trim()} onClick={async () => { const r = await setCondition(sample, cond.l.no, cond.c, cond.note, me); say(r); if (r.ok) setCond(null); }} className={btnPrimary}>Save</button></div>
        </Modal>
      )}

      {hist && (
        <Modal title={`History of ${hist.no}`} onClose={() => setHist(null)}>
          <ol className="space-y-2 border-l-2 border-slate-200 pl-3 text-sm">{hist.history.map((h, i) => <li key={i}><Badge tone={conditionTone(h.condition)}>{h.condition}</Badge> <span className="text-slate-500">{h.at} · {h.by}</span>{h.note && <div className="text-slate-700">{h.note}</div>}</li>)}</ol>
        </Modal>
      )}

      {imp && (
        <Modal title="Check before importing" onClose={() => setImp(null)}>
          <p className="text-sm text-slate-700">{imp.lorries.length} lorries: {imp.lorries.filter((l) => !lorries.some((x) => x.no === l.no)).length} new, {imp.lorries.filter((l) => lorries.some((x) => x.no === l.no)).length} updates.</p>
          {imp.problems.length > 0
            ? <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-rose-800">{imp.problems.map((p) => <li key={p}>{p}</li>)}</ul>
            : <ul className="mt-3 max-h-60 overflow-y-auto text-sm text-slate-600">{imp.lorries.map((l) => <li key={l.no}>{l.no} · {l.size} · {l.condition}</li>)}</ul>}
          <p className="mt-3 text-xs text-slate-500">Headings: {IMPORT_HEADERS.join(", ")}. Dates as 2026-12-31 or 31/12/2026. Use “Excel list” to get the template with the lorries already filled in.</p>
          <div className="mt-4 flex justify-end gap-2"><button onClick={() => setImp(null)} className={btnGhost}>Cancel</button><button disabled={imp.problems.length > 0 || !imp.lorries.length} onClick={async () => { say(await importLorries(sample, imp.lorries, me)); setImp(null); }} className={btnPrimary}>Import {imp.lorries.length}</button></div>
        </Modal>
      )}
    </>
  );
}

function LorryForm({ l, onChange }: { l: Lorry; onChange: (l: Lorry) => void }) {
  const set = <K extends keyof Lorry>(k: K, v: Lorry[K]) => onChange({ ...l, [k]: v });
  const lbl = "text-sm font-medium text-slate-700";
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <label className={lbl}>Lorry number<input className={inputCls} value={l.no} onChange={(e) => set("no", e.target.value.toUpperCase())} placeholder="WXY 1234" /></label>
      <label className={lbl}>Size<select className={inputCls} value={l.size} onChange={(e) => set("size", e.target.value as Lorry["size"])}>{SIZES.map((s) => <option key={s}>{s}</option>)}</select></label>
      <label className={lbl}>Condition<select className={inputCls} value={l.condition} onChange={(e) => set("condition", e.target.value as Condition)}>{CONDITIONS.map((c) => <option key={c}>{c}</option>)}</select></label>
      <label className={lbl}>Holds (pallets)<input className={inputCls} type="number" min={0} value={l.pallets ?? ""} onChange={(e) => set("pallets", num(e.target.value))} /></label>
      <label className={lbl}>Holds (loose cartons)<input className={inputCls} type="number" min={0} value={l.cartons ?? ""} onChange={(e) => set("cartons", num(e.target.value))} /></label>
      <label className={lbl}>Usual driver<input className={inputCls} value={l.driver} onChange={(e) => set("driver", e.target.value)} /></label>
      <label className={lbl}>Road tax due<input className={inputCls} type="date" value={l.roadTax} onChange={(e) => set("roadTax", e.target.value)} /></label>
      <label className={lbl}>Insurance due<input className={inputCls} type="date" value={l.insurance} onChange={(e) => set("insurance", e.target.value)} /></label>
      <label className={lbl}>PUSPAKOM due<input className={inputCls} type="date" value={l.puspakom} onChange={(e) => set("puspakom", e.target.value)} /></label>
      <label className={lbl}>Last service<input className={inputCls} type="date" value={l.lastService} onChange={(e) => set("lastService", e.target.value)} /></label>
      <label className={lbl}>Next service<input className={inputCls} type="date" value={l.nextService} onChange={(e) => set("nextService", e.target.value)} /></label>
      <label className={`${lbl} sm:col-span-3`}>Notes<input className={inputCls} value={l.notes} onChange={(e) => set("notes", e.target.value)} placeholder="For example: tail-lift, chiller" /></label>
    </div>
  );
}
