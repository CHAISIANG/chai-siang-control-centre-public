"use client";
import { useState } from "react";
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Management charts. One brand blue for the figures, grey for targets, one axis per chart, a hover tooltip on every mark,
// and the numbers written next to the bars so nobody has to guess from colour or length.

export const BLUE = "#1f5c8a";
const BLUE_SOFT = "#a9c8dc";
const INK_MUTED = "#66737b";
const GRID = "#e3e8ea";
const rmShort = (v: number) => (Math.abs(v) >= 1_000_000 ? `RM ${(v / 1_000_000).toFixed(2)}M` : Math.abs(v) >= 1000 ? `RM ${Math.round(v / 1000)}K` : `RM ${Math.round(v)}`);
const rmFull = (v: number) => `RM ${Math.round(v).toLocaleString("en-MY")}`;
const axis = { fontSize: 12, fill: INK_MUTED };
// Axis ticks without the "RM" so they never wrap; the tooltip and the title carry the unit.
const axisRm = (v: number) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`);

function TipBox({ title, rows }: { title: string; rows: [string, string, string?][] }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-md">
      <div className="mb-1 font-medium text-slate-900">{title}</div>
      {rows.map(([k, v, c]) => (
        <div key={k} className="flex items-center gap-2 text-slate-600">
          {c && <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: c }} />}
          <span>{k}</span><span className="ml-auto pl-4 font-medium tabular-nums text-slate-900">{v}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: [string, string, boolean?][] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-600">
      {items.map(([label, color, dashed]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          {dashed ? <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} /> : <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
          {label}
        </span>
      ))}
    </div>
  );
}

/** Month to date: sales added up day by day, against the straight line the target needs. */
export function CumulativeSales({ data }: { data: { day: string; sales: number; target: number }[] }) {
  const rows = data.reduce<{ day: string; sales: number; target: number }[]>((acc, d) => {
    const prev = acc[acc.length - 1];
    acc.push({ day: d.day, sales: (prev?.sales ?? 0) + d.sales, target: (prev?.target ?? 0) + d.target });
    return acc;
  }, []);
  const last = rows[rows.length - 1];
  return (
    <div>
      <Legend items={[["Sales so far", BLUE], ["Target pace", INK_MUTED, true]]} />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BLUE} stopOpacity={0.18} /><stop offset="100%" stopColor={BLUE} stopOpacity={0.02} /></linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" />
            <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={axisRm} width={48} />
            <Tooltip cursor={{ stroke: INK_MUTED, strokeDasharray: "3 3" }} content={({ active, payload, label }) => active && payload?.length ? (
              <TipBox title={String(label)} rows={[["Sales so far", rmFull(Number(payload[0].payload.sales)), BLUE], ["Target pace", rmFull(Number(payload[0].payload.target)), INK_MUTED], ["Gap", rmFull(Number(payload[0].payload.sales) - Number(payload[0].payload.target))]]} />
            ) : null} />
            <Area type="monotone" dataKey="sales" stroke={BLUE} strokeWidth={2} fill="url(#cumFill)" activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }} />
            <Line type="linear" dataKey="target" stroke={INK_MUTED} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {last && <p className="mt-2 text-sm text-slate-600">So far <b className="text-slate-900">{rmFull(last.sales)}</b> against a pace of {rmFull(last.target)}: <span className={last.sales >= last.target ? "text-emerald-700" : "text-rose-700"}>{last.sales >= last.target ? "ahead" : "behind"} by {rmFull(Math.abs(last.sales - last.target))}</span>.</p>}
    </div>
  );
}

/** Each salesman's % of target as a bar, with the 100% line drawn across. */
export function Achievement({ data }: { data: { name: string; sales: number; target: number }[] }) {
  const rows = data.filter((d) => d.target > 0).map((d) => ({ ...d, pct: Math.round((d.sales / d.target) * 100) })).sort((a, b) => b.pct - a.pct);
  const max = Math.ceil(Math.max(110, ...rows.map((r) => r.pct)) / 25) * 25;
  const ticks = Array.from({ length: max / 25 + 1 }, (_, i) => i * 25);
  return (
    <div style={{ height: Math.max(190, rows.length * 34 + 46) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 18, right: 44, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" domain={[0, max]} ticks={ticks} tick={axis} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="name" tick={{ ...axis, fill: "#36424b" }} tickLine={false} axisLine={false} width={120} />
          <ReferenceLine x={100} stroke="#36424b" strokeDasharray="4 3" label={{ value: "Target", position: "top", fontSize: 11, fill: INK_MUTED }} />
          <Tooltip cursor={{ fill: "rgba(31,92,138,0.06)" }} content={({ active, payload }) => active && payload?.length ? (
            <TipBox title={String(payload[0].payload.name)} rows={[["Sales", rmFull(payload[0].payload.sales)], ["Target", rmFull(payload[0].payload.target)], ["Achieved", `${payload[0].payload.pct}%`]]} />
          ) : null} />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]} maxBarSize={20}>
            {rows.map((r) => <Cell key={r.name} fill={r.pct >= 100 ? BLUE : BLUE_SOFT} />)}
            <LabelList dataKey="pct" position="right" formatter={(v) => `${v}%`} style={{ fontSize: 12, fill: "#36424b" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Share of sales by channel: ranked bars with the share written beside each (clearer than a pie with eight slices). */
export function ChannelMix({ data, top = 6 }: { data: { channel: string; sales: number }[]; top?: number }) {
  const sorted = [...data].filter((d) => d.sales > 0).sort((a, b) => b.sales - a.sales);
  const rows = sorted.length > top ? [...sorted.slice(0, top - 1), { channel: "Other", sales: sorted.slice(top - 1).reduce((s, d) => s + d.sales, 0) }] : sorted;
  const total = rows.reduce((s, d) => s + d.sales, 0) || 1;
  const max = Math.max(...rows.map((r) => r.sales), 1);
  const [hover, setHover] = useState<string | null>(null);
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.channel} onMouseEnter={() => setHover(r.channel)} onMouseLeave={() => setHover(null)} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate text-slate-700">{r.channel || "No channel"}</span>
            <span className="shrink-0 tabular-nums text-slate-900"><b className="font-semibold">{Math.round((r.sales / total) * 100)}%</b> <span className="text-slate-500">{hover === r.channel ? rmFull(r.sales) : rmShort(r.sales)}</span></span>
          </div>
          <div className="h-2.5 w-full rounded-full bg-slate-100">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${(r.sales / max) * 100}%`, background: r.channel === "Other" ? BLUE_SOFT : BLUE }} />
          </div>
        </li>
      ))}
      {!rows.length && <li className="text-sm text-slate-500">No sales by channel yet.</li>}
    </ul>
  );
}

const AGE = ["Current", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"];
const AGE_COL = ["#d2e3ee", "#7aa9c6", "#2f6f9c", "#143d5c", "#0b2233"];
/** What customers owe, split by how late it is: one bar, darker the later it is. */
export function AgingProfile({ buckets }: { buckets: number[] }) {
  const total = buckets.reduce((s, v) => s + v, 0);
  const [hover, setHover] = useState<number | null>(null);
  if (!total) return <p className="text-sm text-slate-500">No money owed in the latest aging report.</p>;
  return (
    <div>
      <div className="flex h-9 w-full gap-[2px] overflow-hidden rounded-md" role="img" aria-label={`Money owed by lateness: ${AGE.map((a, i) => `${a} ${rmFull(buckets[i])}`).join(", ")}`}>
        {buckets.map((v, i) => v > 0 && (
          <div key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={`${AGE[i]}: ${rmFull(v)} (${Math.round((v / total) * 100)}%)`}
            className={`h-full transition-opacity ${hover !== null && hover !== i ? "opacity-60" : ""}`} style={{ width: `${(v / total) * 100}%`, background: AGE_COL[i], minWidth: 3 }} />
        ))}
      </div>
      <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {buckets.map((v, i) => (
          <li key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} className={`rounded-md px-1 py-0.5 ${hover === i ? "bg-slate-50" : ""}`}>
            <div className="flex items-center gap-1.5 text-[13px] text-slate-600"><span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: AGE_COL[i] }} />{AGE[i]}</div>
            <div className="text-[15px] font-semibold tabular-nums text-slate-900">{rmShort(v)}</div>
            <div className="text-xs tabular-nums text-slate-500">{Math.round((v / total) * 100)}% of {rmShort(total)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Monthly sales against target over the year. */
export function MonthlyTrend({ data }: { data: { month: string; sales: number; target: number }[] }) {
  return (
    <div>
      <Legend items={[["Net sales", BLUE], ["Target", INK_MUTED, true]]} />
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke={GRID} />
            <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={axisRm} width={48} />
            <Tooltip cursor={{ fill: "rgba(31,92,138,0.06)" }} content={({ active, payload, label }) => active && payload?.length ? (
              <TipBox title={String(label)} rows={[["Net sales", rmFull(Number(payload[0].payload.sales)), BLUE], ["Target", rmFull(Number(payload[0].payload.target)), INK_MUTED], ["Achieved", payload[0].payload.target ? `${Math.round((payload[0].payload.sales / payload[0].payload.target) * 100)}%` : "–"]]} />
            ) : null} />
            <Bar dataKey="sales" fill={BLUE} radius={[4, 4, 0, 0]} maxBarSize={34} />
            <Line type="linear" dataKey="target" stroke={INK_MUTED} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Overdue against total owed, per salesman: the pale track is everything owed, the dark part is what is already late. */
export function OverdueVsOwed({ data }: { data: { name: string; owed: number; overdue: number }[] }) {
  const rows = data.filter((d) => d.owed > 0).sort((a, b) => b.overdue - a.overdue);
  const max = Math.max(...rows.map((r) => r.owed), 1);
  const [hover, setHover] = useState<string | null>(null);
  const totalOwed = rows.reduce((s, r) => s + r.owed, 0), totalOver = rows.reduce((s, r) => s + r.overdue, 0);
  if (!rows.length) return <p className="text-sm text-slate-500">No money owed in the latest aging report.</p>;
  return (
    <div>
      <Legend items={[["Overdue", BLUE], ["Not yet due", "#d2e3ee"]]} />
      <ul className="space-y-3">
        {rows.map((r) => {
          const share = r.owed ? Math.round((r.overdue / r.owed) * 100) : 0;
          return (
            <li key={r.name} onMouseEnter={() => setHover(r.name)} onMouseLeave={() => setHover(null)}>
              <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
                <span className="truncate text-slate-700">{r.name}</span>
                <span className="tabular-nums text-slate-900"><b className="font-semibold">{rmShort(r.overdue)}</b> <span className="text-slate-500">overdue of {rmShort(r.owed)} · </span><b className={share >= 60 ? "text-rose-700" : "text-slate-900"}>{share}%</b></span>
              </div>
              <div className="h-3 rounded-full bg-[#d2e3ee]" style={{ width: `${(r.owed / max) * 100}%`, minWidth: 6 }} title={`${r.name}: ${rmFull(r.overdue)} overdue of ${rmFull(r.owed)} owed (${share}%)`}>
                <div className={`h-full rounded-full transition-opacity ${hover && hover !== r.name ? "opacity-50" : ""}`} style={{ width: `${share}%`, background: BLUE }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-slate-600">All together: <b className="text-slate-900">{rmFull(totalOver)}</b> overdue versus <b className="text-slate-900">{rmFull(totalOwed)}</b> owed ({totalOwed ? Math.round((totalOver / totalOwed) * 100) : 0}% is late).</p>
    </div>
  );
}
