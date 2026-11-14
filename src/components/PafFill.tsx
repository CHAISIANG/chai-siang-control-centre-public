"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { checkboxCells, lastNum, signatureCells, type FormDef, type Values } from "@/lib/paf";
import { toDisplayDate, toIso } from "./PafSheet";

// A plain fill-in form for a PAF. Every field writes to the same cell of the sheet that the preview shows,
// so what you type here appears in the preview straight away.

const GROUPS: { title: string; rows: number[] }[] = [
  { title: "RE type", rows: [11] },
  { title: "Category", rows: [15, 17] },
  { title: "Type of promotion", rows: [19] },
  { title: "Customer investment: absolute amount", rows: [21] },
  { title: "Customer investment: T&C related", rows: [23, 25, 27] },
  { title: "Customer investment: others", rows: [29, 32] },
];
const SPECIFY: Record<number, string> = { 27: "M27", 32: "M32" };
const cls = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 disabled:bg-slate-50";

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-3 py-2"><h3 className="text-sm font-semibold text-slate-800">{title}</h3>{hint && <p className="text-xs text-slate-500">{hint}</p>}</div>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  );
}
const Field = ({ label, children, className = "" }: { label: string; children: ReactNode; className?: string }) => <label className={`block text-xs font-medium text-slate-600 ${className}`}>{label}{children}</label>;

type Props = { def: FormDef; values: Values; onChange: (a: string, v: string) => void };

export default function PafFill({ def, values, onChange }: Props) {
  const boxes = useMemo(() => checkboxCells(def.layout).map((b) => ({ ...b, row: Number(/\d+$/.exec(b.box)![0]) })), [def]);
  const sig = useMemo(() => signatureCells(def.layout), [def]);
  const { rows, cols } = def.lines;
  const max = rows[1] - rows[0] + 1;
  const lineRows = Array.from({ length: max }, (_, i) => rows[0] + i);
  const filled = (r: number) => Object.values(cols).some((L) => L !== cols.rm && L !== cols.num && !(L === cols.pct && def.pct) && (values[`${L}${r}`] ?? "") !== "");
  const lastFilled = lineRows.reduce((m, r, i) => (filled(r) ? i + 1 : m), 0);
  const [shown, setShown] = useState(Math.max(2, lastFilled + 1));
  const visible = Math.max(shown, lastFilled + 1 > max ? max : lastFilled + 1);
  const dateBad = values.I7 && values.O7 && toIso(values.I7) && toIso(values.O7) && toIso(values.O7) < toIso(values.I7);
  const sellIsSum = def.invoice === "sumSell", costIsSum = def.cost === "sumCost";
  const isPkg = def.key.startsWith("pkg");

  return (
    <div className="space-y-4">
      <Section title="1. Promotion" hint="The outlet comes from the customer you chose above.">
        <Field label="Outlet name on the form"><input className={cls} value={values.G9 ?? ""} onChange={(e) => onChange("G9", e.target.value)} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date"><input type="date" className={cls} value={toIso(values.I7 ?? "")} onChange={(e) => onChange("I7", toDisplayDate(e.target.value))} /></Field>
          <Field label="End date"><input type="date" className={cls} value={toIso(values.O7 ?? "")} min={toIso(values.I7 ?? "")} onChange={(e) => onChange("O7", toDisplayDate(e.target.value))} /></Field>
        </div>
        {dateBad && <p role="alert" className="rounded bg-rose-50 px-2 py-1 text-xs text-rose-800">The end date is before the start date.</p>}
      </Section>

      <Section title="2. Tick what applies" hint="Tick the boxes as on the printed form.">
        {GROUPS.map((g) => {
          const list = boxes.filter((b) => g.rows.includes(b.row));
          if (!list.length) return null;
          const spec = g.rows.map((r) => ({ r, cell: SPECIFY[r] })).filter((s) => s.cell);
          return (
            <fieldset key={g.title}>
              <legend className="mb-1 text-xs font-semibold text-slate-600">{g.title}</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {list.map((b) => (
                  <label key={b.box} className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                    <input type="checkbox" className="h-4 w-4" checked={values[b.box] === "X"} onChange={() => onChange(b.box, values[b.box] === "X" ? "" : "X")} /> {b.label}
                  </label>
                ))}
              </div>
              {spec.map((s) => {
                const ticked = boxes.some((b) => b.row === s.r && /others/i.test(b.label) && values[b.box] === "X");
                return ticked || values[s.cell] ? <Field key={s.cell} label="Others: please specify" className="mt-2"><input className={cls} value={values[s.cell] ?? ""} onChange={(e) => onChange(s.cell, e.target.value)} /></Field> : null;
              })}
            </fieldset>
          );
        })}
      </Section>

      <Section title="3. Amounts" hint="Totals fill in by themselves from the lines below where the form allows it.">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Total invoice value (RM)"><input className={cls} inputMode="decimal" value={values.H35 ?? ""} disabled={sellIsSum} onChange={(e) => onChange("H35", e.target.value)} placeholder={sellIsSum ? "Adds up from the lines" : ""} /></Field>
          <Field label="Cost of investment (RM)"><input className={cls} inputMode="decimal" value={values.H37 ?? ""} disabled={costIsSum} onChange={(e) => onChange("H37", e.target.value)} placeholder={costIsSum ? "Adds up from the lines" : ""} /></Field>
        </div>
      </Section>

      <Section title="4. Lines" hint={`${lastFilled} of ${max} lines used`}>
        {lineRows.slice(0, Math.min(max, visible)).map((r, i) => (
          <div key={r} className="rounded-md border border-slate-200 bg-slate-50/60 p-2.5">
            <div className="mb-1.5 text-xs font-semibold text-slate-500">Line {i + 1}</div>
            <div className="grid grid-cols-2 gap-2">
              {cols.desc && <Field label="Description" className="col-span-2"><input className={cls} value={values[`${cols.desc}${r}`] ?? ""} onChange={(e) => onChange(`${cols.desc}${r}`, e.target.value)} /></Field>}
              {cols.sell && <Field label={isPkg ? "Sell-out (RM)" : "Sell-out assumption"}><input className={cls} value={values[`${cols.sell}${r}`] ?? ""} onChange={(e) => onChange(`${cols.sell}${r}`, e.target.value)} /></Field>}
              {cols.pct && <Field label="Cost %"><input className={cls} value={values[`${cols.pct}${r}`] ?? ""} disabled={!!def.pct} placeholder={def.pct ? "Worked out" : ""} onChange={(e) => onChange(`${cols.pct}${r}`, e.target.value)} /></Field>}
              {cols.cost && <Field label="Cost of investment (RM)"><input className={cls} inputMode="decimal" value={values[`${cols.cost}${r}`] ?? ""} onChange={(e) => onChange(`${cols.cost}${r}`, e.target.value)} /></Field>}
              {cols.note && <Field label="Note" className="col-span-2"><input className={cls} value={values[`${cols.note}${r}`] ?? ""} onChange={(e) => onChange(`${cols.note}${r}`, e.target.value)} /></Field>}
            </div>
          </div>
        ))}
        {visible < max && <button type="button" onClick={() => setShown(visible + 1)} className="inline-flex items-center gap-1 text-sm font-medium text-indigo-700 hover:underline"><Plus size={15} /> Add another line</button>}
        {(def.invoice === "sumSell" || def.cost === "sumCost") && <p className="text-xs text-slate-500">Total of the lines: cost RM {lineRows.reduce((s, r) => s + (cols.cost ? lastNum(values[`${cols.cost}${r}`]) : 0), 0).toLocaleString("en-MY", { minimumFractionDigits: 2 })}</p>}
      </Section>

      <Section title="5. Names and dates" hint="Sign-off block at the bottom of the form.">
        {([["Customer representative", 0], ["Salesman", 1], ["Distributor representative", 2], ["CD representative", 3]] as const).map(([label, i]) => (
          <div key={label} className="grid grid-cols-2 gap-3">
            <Field label={`${label}: name`}><input className={cls} value={values[sig.name[i]] ?? ""} onChange={(e) => onChange(sig.name[i], e.target.value)} /></Field>
            <Field label="Date"><input type="date" className={cls} value={toIso(values[sig.date[i]] ?? "")} onChange={(e) => onChange(sig.date[i], toDisplayDate(e.target.value))} /></Field>
          </div>
        ))}
      </Section>
    </div>
  );
}
