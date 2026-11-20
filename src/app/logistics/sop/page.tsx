"use client";
import { useState, type ReactNode } from "react";
import { Printer } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { btnGhost } from "@/components/finui";
import { DAILY, DAMAGED, EXCEPTIONS, FLOW, FLOW_EXTRA, LANES, NOTES, PHASES, SIGNOFF, TO_CONFIRM, ZONES, ZONE_TIPS, type Bi } from "@/lib/sop";

/** Text with [[things still to confirm]] highlighted. */
function Mark({ text }: { text: string }) {
  return <>{text.split(/(\[\[.*?\]\])/g).map((t, i) => (t.startsWith("[[") ? <mark key={i} className="rounded bg-amber-100 px-1 text-amber-900">{t.slice(2, -2)}</mark> : <span key={i}>{t}</span>))}</>;
}
/** Bahasa Melayu first, the English line under it. */
function BiText({ b, strong = false }: { b: Bi; strong?: boolean }) {
  return (
    <span className="block">
      <span className={`block ${strong ? "font-semibold text-slate-900" : "text-slate-900"}`}><Mark text={b.ms} /></span>
      <span className="block text-sm italic text-slate-500"><Mark text={b.en} /></span>
    </span>
  );
}
const Who = ({ b }: { b: Bi }) => <span className="inline-block rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-800">{b.ms}{b.ms !== b.en ? ` · ${b.en}` : ""}</span>;

const SECTIONS = [
  { id: "fasa", label: "Fasa 1–5 · Phases" }, { id: "rosak", label: "Stok rosak · Damaged stock" }, { id: "zon", label: "Zon gudang · Zones" },
  { id: "kecuali", label: "Pengecualian · Exceptions" }, { id: "nota", label: "NK / ND / GRN" }, { id: "carta", label: "Carta alir · Flowchart" },
  { id: "tandatangan", label: "Senarai semak lawatan · Trip sign-off" }, { id: "harian", label: "Serah terima harian · Daily handover" }, { id: "sahkan", label: "Untuk disahkan · To confirm" },
];

// ---------- flowchart: one column per person, steps run from top to bottom ----------
const BOX_W = 136, BOX_H = 60, LANE_W = 150, ROW_H = 80, HEAD_H = 46;
function Flowchart() {
  const idx = (l: string) => LANES.findIndex((x) => x.id === l);
  const pos = (id: string) => { const f = FLOW.find((x) => x.id === id)!; return { x: idx(f.lane) * LANE_W + (LANE_W - BOX_W) / 2, y: HEAD_H + f.col * ROW_H + (ROW_H - BOX_H) / 2 }; };
  const W = LANES.length * LANE_W, H = HEAD_H + (Math.max(...FLOW.map((f) => f.col)) + 1) * ROW_H;
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: 700 }} className="mx-auto w-full max-w-4xl" role="img" aria-label="Carta alir proses penghantaran">
        <defs><marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 L8 4 L0 8 z" fill="#475569" /></marker></defs>
        {LANES.map((l, i) => (
          <g key={l.id}>
            <rect x={i * LANE_W} y={0} width={LANE_W} height={H} fill={i % 2 ? "#f8fafc" : "#f1f5f9"} />
            <foreignObject x={i * LANE_W + 4} y={4} width={LANE_W - 8} height={HEAD_H - 6}><div style={{ fontSize: 12, lineHeight: 1.2, textAlign: "center", color: "#0f172a" }}><b>{l.label.ms}</b><div style={{ color: "#64748b", fontStyle: "italic", fontSize: 10.5 }}>{l.label.en}</div></div></foreignObject>
          </g>
        ))}
        {FLOW.slice(1).map((f, i) => {
          const a = pos(FLOW[i].id), b = pos(f.id);
          const same = a.x === b.x;
          const x1 = a.x + BOX_W / 2, y1 = a.y + BOX_H, x2 = b.x + BOX_W / 2, y2 = b.y, my = (y1 + y2) / 2;
          return <polyline key={f.id} points={same ? `${x1},${y1} ${x2},${y2}` : `${x1},${y1} ${x1},${my} ${x2},${my} ${x2},${y2}`} fill="none" stroke="#475569" strokeWidth={1.6} markerEnd="url(#arr)" />;
        })}
        {FLOW.map((f) => {
          const p = pos(f.id);
          const fill = f.kind === "decision" ? "#fef3c7" : f.kind === "end" ? "#d1fae5" : "#ffffff";
          const stroke = f.kind === "decision" ? "#d97706" : f.kind === "end" ? "#059669" : "#1f5c8a";
          return (
            <g key={f.id}>
              <rect x={p.x} y={p.y} width={BOX_W} height={BOX_H} rx={f.kind === "decision" ? 24 : 8} fill={fill} stroke={stroke} strokeWidth={1.6} />
              <foreignObject x={p.x + 3} y={p.y + 2} width={BOX_W - 6} height={BOX_H - 4}>
                <div style={{ fontSize: 12, lineHeight: 1.2, textAlign: "center", color: "#0f172a", display: "flex", flexDirection: "column", justifyContent: "center", height: "100%" }}>
                  <b>{f.text.ms}</b><span style={{ color: "#64748b", fontStyle: "italic", fontSize: 10.5 }}>{f.text.en}</span>
                </div>
              </foreignObject>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function Sop() {
  const [only, setOnly] = useState<null | "tandatangan" | "harian">(null);
  const show = (id: string) => !only || only === id;
  const print = (what: null | "tandatangan" | "harian") => { setOnly(what); setTimeout(() => { window.print(); setOnly(null); }, 120); };
  const sec = (id: string, children: ReactNode) => <section id={id} className={`mt-6 scroll-mt-16 ${show(id) ? "" : "no-print"}`}>{children}</section>;

  return (
    <>
      <div className={only ? "no-print" : ""}>
        <PageHeader title="SOP Gudang & Logistik" sub="Warehouse & Logistics SOP: dari invois hingga POD bertandatangan. Setiap langkah dalam Bahasa Melayu, dengan baris Inggeris di bawahnya."
          right={
            <div className="no-print flex flex-wrap gap-2">
              <button onClick={() => print(null)} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-2 !text-sm`}><Printer size={16} /> Cetak semua A4 · Print all</button>
              <button onClick={() => print("harian")} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-2 !text-sm`}><Printer size={16} /> Senarai harian · Daily checklist</button>
              <button onClick={() => print("tandatangan")} className={`${btnGhost} inline-flex items-center gap-2 !px-3 !py-2 !text-sm`}><Printer size={16} /> Senarai lawatan · Trip sign-off</button>
            </div>
          } />
        <nav className="no-print mb-2 flex flex-wrap gap-1.5 text-sm" aria-label="Bahagian">
          {SECTIONS.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-slate-700 hover:bg-slate-100">{s.label}</a>)}
        </nav>
        <p className="no-print mt-2 text-sm text-slate-600">Teks yang <mark className="rounded bg-amber-100 px-1 text-amber-900">ditanda kuning</mark> masih perlu disahkan oleh syarikat. · Text <mark className="rounded bg-amber-100 px-1 text-amber-900">highlighted in yellow</mark> still needs the company to confirm it.</p>
      </div>

      <div id="fin-inv-print">
        {only && <h1 className="mb-3 text-xl font-bold">{only === "harian" ? "Senarai semak serah terima harian · Daily handover checklist" : "Senarai semak lawatan · Trip sign-off checklist"}</h1>}

        {sec("fasa", <>
          {PHASES.map((p) => (
            <Card key={p.id} className="mb-4" title={p.title.ms} right={<span className="hidden text-sm italic text-slate-500 sm:inline">{p.title.en}</span>}>
              <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><BiText b={p.goal} /></div>
              <ol className="space-y-3">
                {p.steps.map((s) => (
                  <li key={s.n} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2"><span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-semibold text-white">{s.n}</span><Who b={s.who} /></div>
                    <div className="mb-1 text-xs font-semibold uppercase text-slate-400">Buat · Do</div>
                    <BiText b={s.action} />
                    <div className="mb-1 mt-2 text-xs font-semibold uppercase text-emerald-700">Semak · Check</div>
                    <BiText b={s.check} />
                    {s.screen && <div className="no-print mt-2 text-sm text-indigo-700">Skrin · Screen: {s.screen.ms} <span className="italic text-slate-500">({s.screen.en})</span></div>}
                  </li>
                ))}
              </ol>
            </Card>
          ))}
        </>)}

        {sec("rosak", <Card title="Stok rosak atau bocor dalam gudang" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Damaged or leaking stock in the warehouse</span>}>
          <ol className="space-y-3">
            {DAMAGED.map((d) => (
              <li key={d.n} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-2"><span className="rounded-md bg-rose-700 px-2 py-0.5 text-xs font-semibold text-white">{d.n}</span><Who b={d.who} /></div>
                <BiText b={d.action} />
              </li>
            ))}
          </ol>
        </Card>)}

        {sec("zon", <Card title="Zon gudang (belum ada pelan lantai)" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Warehouse zones (no floor plan yet)</span>}>
          <div className="grid gap-2 sm:grid-cols-2">
            {ZONES.map((z) => (
              <div key={z.code} className="break-inside-avoid flex gap-3 rounded-lg border border-slate-200 p-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-lg font-bold text-white">{z.code}</span>
                <div className="min-w-0"><BiText b={z.name} strong /><div className="mt-1"><BiText b={z.rule} /></div></div>
              </div>
            ))}
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">Cara mula tanpa pelan lantai <span className="font-normal italic text-slate-500">· How to start without a floor plan</span></h3>
          <ul className="mt-2 space-y-2">{ZONE_TIPS.map((t, i) => <li key={i} className="break-inside-avoid"><BiText b={t} /></li>)}</ul>
        </Card>)}

        {sec("kecuali", <Card title="Pengecualian" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Exception handling</span>}>
          <div className="space-y-3">
            {EXCEPTIONS.map((e, i) => (
              <div key={i} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                <div className="mb-1"><BiText b={e.when} strong /></div>
                <ol className="list-decimal space-y-1.5 pl-5">{e.what.map((w, k) => <li key={k}><BiText b={w} /></li>)}</ol>
              </div>
            ))}
          </div>
        </Card>)}

        {sec("nota", <Card title="Nota kredit, nota debit dan GRN" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Credit note, debit note and GRN</span>}>
          <div className="space-y-3">
            {NOTES.map((n, i) => (
              <div key={i} className="break-inside-avoid rounded-lg border border-slate-200 p-3">
                <div className="mb-1"><BiText b={n.name} strong /></div>
                <ol className="list-decimal space-y-1.5 pl-5">{n.steps.map((s, k) => <li key={k}><BiText b={s} /></li>)}</ol>
              </div>
            ))}
          </div>
        </Card>)}

        {sec("carta", <Card title="Carta alir" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Flowchart: who hands over to whom</span>}>
          <Flowchart />
          <ul className="mt-3 space-y-1.5 text-sm">{FLOW_EXTRA.map((f, i) => <li key={i} className="break-inside-avoid"><BiText b={f} /></li>)}</ul>
        </Card>)}

        {sec("tandatangan", <Card title="Senarai semak setiap lawatan (pemandu dan kerani tandatangan)" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Per-trip sign-off (driver and clerk sign)</span>}>
          <div className="mb-3 grid gap-2 text-sm sm:grid-cols-4">
            {["Tarikh · Date", "Lori / Pengangkut · Lorry / Transporter", "Laluan · Route", "Pemandu · Driver"].map((f) => <div key={f} className="border-b border-slate-400 pb-4 text-slate-500">{f}</div>)}
          </div>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-300 text-left"><th className="w-8 py-1.5">✔</th><th className="py-1.5">Perkara · Item</th><th className="w-40 py-1.5">Pemandu · Driver</th><th className="w-40 py-1.5">Kerani · Clerk</th></tr></thead>
            <tbody>
              {SIGNOFF.map((s, i) => (
                <tr key={i} className="break-inside-avoid border-b border-slate-200 align-top">
                  <td className="py-2"><span className="inline-block h-4 w-4 rounded border border-slate-500" /></td>
                  <td className="py-2 pr-3"><BiText b={s.item} /></td>
                  <td className="py-2">{s.by === "Clerk" ? <span className="text-slate-300">–</span> : <span className="inline-block h-6 w-32 border-b border-slate-400" />}</td>
                  <td className="py-2">{s.by === "Driver" ? <span className="text-slate-300">–</span> : <span className="inline-block h-6 w-32 border-b border-slate-400" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>)}

        {sec("harian", <Card title="Senarai semak serah terima harian" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Daily handover checklist</span>}>
          <div className="mb-3 grid gap-2 text-sm sm:grid-cols-3">
            {["Tarikh · Date", "Disediakan oleh · Prepared by", "Diterima oleh · Received by"].map((f) => <div key={f} className="border-b border-slate-400 pb-4 text-slate-500">{f}</div>)}
          </div>
          <div className="space-y-4">
            {DAILY.map((d, i) => (
              <div key={i} className="break-inside-avoid">
                <h3 className="mb-1 font-semibold text-slate-900">{d.time.ms} <span className="font-normal italic text-slate-500">· {d.time.en}</span></h3>
                <ul className="space-y-1.5">
                  {d.items.map((it, k) => <li key={k} className="flex items-start gap-2"><span className="mt-1 inline-block h-4 w-4 shrink-0 rounded border border-slate-500" /><BiText b={it} /></li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {["Catatan / Isu · Notes / Issues", "Tandatangan penyelia · Supervisor signature"].map((f) => <div key={f} className="border-b border-slate-400 pb-8 text-slate-500">{f}</div>)}
          </div>
        </Card>)}

        {sec("sahkan", <Card title="Perkara yang syarikat perlu sahkan" right={<span className="hidden text-sm italic text-slate-500 sm:inline">Items the company must confirm</span>}>
          <ul className="list-disc space-y-1.5 pl-5">{TO_CONFIRM.map((t, i) => <li key={i}><BiText b={t} /></li>)}</ul>
        </Card>)}
      </div>
    </>
  );
}
