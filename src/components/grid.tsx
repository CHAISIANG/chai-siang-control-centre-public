"use client";
// Reusable table tools: sort and filter on the column titles, export to Excel, and an A4 landscape printout.
import { useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ListFilter } from "lucide-react";
import { Th } from "@/components/ui";

export type GridKind = "text" | "pick" | "date" | "num";
export type GridCol<T> = {
  id: string; label: string; kind: GridKind; right?: boolean;
  /** what the column holds, for sorting and filtering (text, a date as yyyy-mm-dd, or a number) */
  value: (row: T) => string | number;
  /** choices for a "pick" column: code and the name to show */
  options?: { code: string; name: string }[];
  /** hint under the number filter */
  hint?: string;
};
export type GridFilter = { text?: string; pick?: string[]; from?: string; to?: string; min?: string; max?: string };
export type GridSort = { id: string; dir: 1 | -1 };

const filled = (s?: string) => !!s && s.trim() !== "";
export const isFilterOn = (f?: GridFilter) => !!f && (filled(f.text) || !!f.pick?.length || !!f.from || !!f.to || filled(f.min) || filled(f.max));
const dmy = (s: string) => (s ? new Date(`${s}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "");

/** Applies the column filters, then the sort. `base` is any filtering the page already does itself. */
export function useGrid<T>(rows: T[], cols: GridCol<T>[], first: GridSort, tieBreak: (a: T, b: T) => number = () => 0) {
  const [filters, setFilters] = useState<Record<string, GridFilter>>({});
  const [sort, setSort] = useState<GridSort>(first);
  const out = useMemo(() => {
    const num = (s?: string) => (filled(s) && Number.isFinite(Number(s)) ? Number(s) : null);
    const kept = rows.filter((r) => {
      for (const c of cols) {
        const f = filters[c.id];
        if (!f || !isFilterOn(f)) continue;
        const v = c.value(r);
        if (c.kind === "text" && filled(f.text) && !String(v).toLowerCase().includes(f.text!.trim().toLowerCase())) return false;
        if (c.kind === "pick" && f.pick?.length && !f.pick.includes(String(v))) return false;
        if (c.kind === "date") { if (f.from && (!v || String(v) < f.from)) return false; if (f.to && (!v || String(v) > f.to)) return false; }
        if (c.kind === "num") { const lo = num(f.min), hi = num(f.max); if (lo !== null && Number(v) < lo) return false; if (hi !== null && Number(v) > hi) return false; }
      }
      return true;
    });
    const col = cols.find((c) => c.id === sort.id) ?? cols[0];
    return kept.sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "en", { numeric: true });
      return (c || tieBreak(a, b)) * sort.dir;
    });
  }, [rows, cols, filters, sort, tieBreak]);
  const active = cols.filter((c) => isFilterOn(filters[c.id]));
  return {
    rows: out, filters, sort, active,
    clickSort: (id: string) => setSort((s) => (s.id === id ? { id, dir: (s.dir * -1) as 1 | -1 } : { id, dir: 1 })),
    setFilter: (id: string, f: GridFilter) => setFilters((cur) => ({ ...cur, [id]: f })),
    clearFilters: () => setFilters({}),
    /** the filters and sort in plain words, for the printout */
    describe: (pickName: (code: string) => string = (c) => c) => {
      const parts: string[] = [];
      for (const c of active) {
        const f = filters[c.id];
        if (filled(f.text)) parts.push(`${c.label} contains “${f.text!.trim()}”`);
        if (f.pick?.length) parts.push(`${c.label}: ${f.pick.map(pickName).join(", ")}`);
        if (f.from || f.to) parts.push(`${c.label} ${f.from ? `from ${dmy(f.from)}` : ""} ${f.to ? `to ${dmy(f.to)}` : ""}`.replace(/\s+/g, " ").trim());
        if (filled(f.min) || filled(f.max)) parts.push(`${c.label} ${filled(f.min) ? `at least ${f.min!.trim()}` : ""} ${filled(f.max) ? `at most ${f.max!.trim()}` : ""}`.replace(/\s+/g, " ").trim());
      }
      const col = cols.find((c) => c.id === sort.id);
      return `${parts.length ? parts.join(" · ") : "No column filters"} · sorted by ${(col?.label ?? "").toLowerCase()} ${sort.dir === 1 ? "(low to high)" : "(high to low)"}`;
    },
  };
}

/** One column title: click the name to sort, click the funnel to filter. */
export function GridHead<T>({ col, grid, first, children }: {
  col: GridCol<T>; grid: Pick<ReturnType<typeof useGrid<T>>, "sort" | "filters" | "clickSort" | "setFilter">; first?: boolean; children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const f = grid.filters[col.id] ?? {};
  const on = isFilterOn(f);
  const sorted = grid.sort.id === col.id;
  const numIn = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm font-normal text-slate-800";
  const set = (next: GridFilter) => grid.setFilter(col.id, next);
  return (
    <Th first={first} right={col.right}>
      <span className={`relative inline-flex items-center gap-1 ${col.right ? "flex-row-reverse" : ""}`}>
        <button onClick={() => grid.clickSort(col.id)} className="inline-flex items-center gap-1 hover:text-slate-900" aria-label={`Sort by ${col.label}`}>
          {children ?? col.label}
          {sorted ? (grid.sort.dir === 1 ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : <ArrowUpDown size={13} className="text-slate-300" />}
        </button>
        <button onClick={() => setOpen((o) => !o)} aria-label={`Filter ${col.label}`} aria-expanded={open}
          className={`rounded p-0.5 ${on ? "bg-indigo-100 text-indigo-700" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}><ListFilter size={14} /></button>
        {open && (
          <>
            <span className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden />
            <span className={`absolute top-full z-30 mt-1 block w-60 rounded-lg border border-slate-200 bg-white p-3 text-left text-sm font-normal normal-case tracking-normal text-slate-700 shadow-lg ${col.right ? "right-0" : "left-0"}`}>
              <span className="block font-medium text-slate-900">Filter {col.label.toLowerCase()}</span>
              {col.kind === "text" && <input autoFocus className={numIn} placeholder="Contains…" value={f.text ?? ""} onChange={(e) => set({ ...f, text: e.target.value })} />}
              {col.kind === "pick" && (
                <span className="mt-1 block max-h-56 overflow-y-auto">
                  {(col.options ?? []).map((o) => (
                    <label key={o.code} className="flex cursor-pointer items-center gap-2 py-1">
                      <input type="checkbox" className="h-4 w-4" checked={!!f.pick?.includes(o.code)} onChange={(e) => set({ ...f, pick: e.target.checked ? [...(f.pick ?? []), o.code] : (f.pick ?? []).filter((c) => c !== o.code) })} />
                      <span>{o.name}</span>
                    </label>
                  ))}
                </span>
              )}
              {col.kind === "date" && (
                <span className="mt-1 block space-y-1.5">
                  <label className="block">From<input type="date" className={numIn} value={f.from ?? ""} onChange={(e) => set({ ...f, from: e.target.value })} /></label>
                  <label className="block">To<input type="date" className={numIn} value={f.to ?? ""} onChange={(e) => set({ ...f, to: e.target.value })} /></label>
                </span>
              )}
              {col.kind === "num" && (
                <span className="mt-1 block space-y-1.5">
                  <label className="block">At least<input inputMode="decimal" className={numIn} value={f.min ?? ""} onChange={(e) => set({ ...f, min: e.target.value })} /></label>
                  <label className="block">At most<input inputMode="decimal" className={numIn} value={f.max ?? ""} onChange={(e) => set({ ...f, max: e.target.value })} /></label>
                  {col.hint && <span className="block text-xs text-slate-500">{col.hint}</span>}
                </span>
              )}
              <span className="mt-2 flex justify-between">
                <button onClick={() => set({})} disabled={!on} className="text-indigo-600 hover:underline disabled:text-slate-300 disabled:no-underline">Clear</button>
                <button onClick={() => setOpen(false)} className="font-medium text-slate-700 hover:underline">Done</button>
              </span>
            </span>
          </>
        )}
      </span>
    </Th>
  );
}

export type ExcelCol<T> = { label: string; width: number; right?: boolean; value: (row: T) => string | number; money?: boolean; total?: boolean };
/** Saves the rows as an .xlsx file, with an optional total row for the columns marked `total`. */
export async function exportExcel<T>(rows: T[], cols: ExcelCol<T>[], fileName: string, sheet: string, totalLabel?: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const bold = "bold" as const;
  const head = cols.map((c) => ({ value: c.label, fontWeight: bold, align: c.right ? ("right" as const) : undefined }));
  const body = rows.map((r) => cols.map((c) => { const v = c.value(r); return typeof v === "number" ? { value: v, format: c.money ? "#,##0.00" : "#,##0" } : { value: v }; }));
  const totals = totalLabel
    ? [cols.map((c, i) => (i === 0 ? { value: totalLabel, fontWeight: bold } : c.total ? { value: rows.reduce((s, r) => s + Number(c.value(r)), 0), format: c.money ? "#,##0.00" : "#,##0", fontWeight: bold } : {}))]
    : [];
  await writeExcelFile([{ sheet, columns: cols.map((c) => ({ width: c.width })), data: [head, ...body, ...totals] }]).toFile(fileName);
}

export type PrintCol<T> = { label: string; right?: boolean; cell: (row: T) => ReactNode; total?: ReactNode };
const cellBase = { padding: "2px 5px", borderBottom: "0.5px solid #bbb" } as const;
/** The A4 printout: shown only when printing (the page must add `#fin-inv-print` styles, which globals.css does). */
export function PrintSheet<T>({ title, lines, rows, cols, rowKey, totalLabel, size = "9pt" }: {
  title: string; lines: string[]; rows: T[]; cols: PrintCol<T>[]; rowKey: (row: T) => string; totalLabel?: string; size?: string;
}) {
  return (
    <div id="fin-inv-print" className="hidden print:block" style={{ fontSize: size, color: "#111" }}>
      <h1 style={{ fontSize: "14pt", fontWeight: 700, margin: 0 }}>{title}</h1>
      {lines.map((l, i) => <p key={i} style={{ margin: i === lines.length - 1 ? "2px 0 8px" : "2px 0" }}>{l}</p>)}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead style={{ display: "table-header-group" }}>
          <tr>{cols.map((c) => <th key={c.label} style={{ textAlign: c.right ? "right" : "left", borderBottom: "1.5px solid #111", padding: "3px 5px", fontWeight: 700 }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => <tr key={rowKey(r)} style={{ breakInside: "avoid" }}>{cols.map((c) => <td key={c.label} style={{ ...cellBase, textAlign: c.right ? "right" : "left" }}>{c.cell(r)}</td>)}</tr>)}
        </tbody>
        {totalLabel && (
          <tfoot><tr>{cols.map((c, i) => <td key={c.label} style={{ padding: "4px 5px", borderTop: "1.5px solid #111", fontWeight: 700, textAlign: c.right ? "right" : "left" }}>{i === 0 ? totalLabel : c.total ?? ""}</td>)}</tr></tfoot>
        )}
      </table>
    </div>
  );
}

/** Switches the page to A4 landscape for one print. */
export function usePrintA4() {
  const [printing, setPrinting] = useState(false);
  return {
    printing,
    pageStyle: printing ? <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style> : null,
    print: () => { setPrinting(true); setTimeout(() => { window.print(); setPrinting(false); }, 80); },
  };
}
