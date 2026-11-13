import fixed from "./fixed.json";
import addbbf from "./addbbf.json";
import offgrid from "./offgrid.json";
import pkglp from "./pkglp.json";
import pkgws from "./pkgws.json";
import tnc from "./tnc.json";

// Layout JSON files are extracted from the 2026 PAF Excel templates (cells, merges, widths, heights, fonts, borders).

export type FormKey = "fixed" | "addbbf" | "offgrid" | "pkglp" | "pkgws" | "tnc";
export type Style = { n: string; z: number; b: boolean; i: boolean; u: boolean; c: string | null; f: string | null; h: string | null; v: string | null; w: boolean; bt: string[] | null; bb: string[] | null; bl: string[] | null; br: string[] | null };
export type Layout = { key: string; sheet: string; cols: number[]; rows: number[]; merges: string[]; styles: Style[]; cells: Record<string, { v: string | null; s: number; nf: string | null }> };
export type Values = Record<string, string>;

type Lines = {
  rows: [number, number];
  cols: { num?: string; desc?: string; sell?: string; rm?: string; cost?: string; pct?: string; note?: string };
  /** last column letter each line input may stretch to (so long text is not clipped) */
  spanTo: { desc?: string; sell?: string; cost?: string; note?: string };
};

export type FormDef = {
  key: FormKey;
  label: string;
  short: string;
  layout: Layout;
  lines: Lines;
  totalCell?: string;
  /** how Total Invoice Value (H35) and Cost of Investment (H37) are produced */
  invoice: "manual" | "sumSell";
  cost: "manual" | "sumCost";
  pct?: "costOverSell";
  photoBox?: string; // e.g. "I45:M63"
};

export const FORMS: Record<FormKey, FormDef> = {
  fixed: { key: "fixed", label: "Fixed Display", short: "Fixed", layout: fixed as Layout, lines: { rows: [44, 52], cols: { num: "E", desc: "F", sell: "I", rm: "N", cost: "O" }, spanTo: { desc: "H", sell: "J", cost: "O" } }, totalCell: "L64", invoice: "manual", cost: "sumCost", photoBox: "I45:M63" },
  addbbf: { key: "addbbf", label: "Additional Display / BBF", short: "Add Display", layout: addbbf as Layout, lines: { rows: [42, 52], cols: { num: "E", desc: "F", sell: "I", rm: "N", cost: "O" }, spanTo: { desc: "H", sell: "J", cost: "O" } }, totalCell: "L64", invoice: "manual", cost: "sumCost", photoBox: "I43:M63" },
  offgrid: { key: "offgrid", label: "Off-Grid & Scan Sales", short: "Off-Grid", layout: offgrid as Layout, lines: { rows: [44, 54], cols: { num: "E", desc: "F", sell: "I", note: "L", cost: "O" }, spanTo: { desc: "H", sell: "K", cost: "R" } }, totalCell: "L56", invoice: "manual", cost: "sumCost" },
  pkglp: { key: "pkglp", label: "Package Buy (LP)", short: "Package LP", layout: pkglp as Layout, lines: { rows: [45, 56], cols: { num: "D", desc: "E", rm: "I", sell: "J", pct: "L", cost: "P" }, spanTo: { desc: "H", sell: "J", cost: "P" } }, totalCell: "L58", invoice: "sumSell", cost: "sumCost", pct: "costOverSell" },
  pkgws: { key: "pkgws", label: "Package Buy (WS)", short: "Package WS", layout: pkgws as Layout, lines: { rows: [45, 56], cols: { num: "D", desc: "E", rm: "I", sell: "J", pct: "L", cost: "P" }, spanTo: { desc: "H", sell: "J", cost: "P" } }, totalCell: "L58", invoice: "sumSell", cost: "sumCost", pct: "costOverSell" },
  tnc: { key: "tnc", label: "T&C Related", short: "T&C", layout: tnc as Layout, lines: { rows: [46, 60], cols: { num: "F", desc: "G", sell: "I", pct: "L", note: "N" }, spanTo: { desc: "H", sell: "K", note: "R" } }, invoice: "manual", cost: "manual" },
};
export const FORM_KEYS = Object.keys(FORMS) as FormKey[];

// ---------- helpers ----------
export const colNum = (L: string) => L.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0);
export const colLetter = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const parseAddr = (a: string) => { const m = /^([A-Z]+)(\d+)$/.exec(a)!; return { col: colNum(m[1]), row: Number(m[2]) }; };
export const addr = (col: number, row: number) => `${colLetter(col)}${row}`;
export const lastNum = (s: string | undefined) => { const m = (s ?? "").replace(/,/g, "").match(/-?\d+(\.\d+)?/g); return m ? Number(m[m.length - 1]) : 0; };
export const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Option labels in the form that get an X box to their right (RE type, category, promotion type). */
export function checkboxCells(layout: Layout): { label: string; box: string }[] {
  const rows = [11, 15, 17, 19, 21, 23, 25, 27, 29, 32];
  const out: { label: string; box: string }[] = [];
  for (const [a, c] of Object.entries(layout.cells)) {
    const { col, row } = parseAddr(a);
    if (!rows.includes(row) || col < 7 || !c.v) continue;
    if (c.v.startsWith("Customer Investment") || c.v === "Please specify" || c.v === "RM" || c.v === "X") continue;
    if (row === 32 && col > 10) continue;
    out.push({ label: c.v, box: addr(col + 1, row) });
  }
  return out;
}

/** The value cells in the signature block, e.g. { name: ["E75","I75","M75","Q75"], date: [...] }. */
export function signatureCells(layout: Layout) {
  const nameRow = Object.entries(layout.cells).find(([a, c]) => c.v === "Name:" && parseAddr(a).col === 3);
  const row = nameRow ? parseAddr(nameRow[0]).row : 75;
  const cols = ["E", "I", "M", "Q"];
  return { name: cols.map((c) => `${c}${row}`), date: cols.map((c) => `${c}${row + 1}`) };
}

/** Starting values for a new claim: template labels kept, sample data cleared. */
// The company line at the top of each form (name, registration and tax numbers) is not kept in the code.
// It is loaded from the database after sign-in. Until then, or if it is missing, only the company name shows.
let companyLine = "";
export const setCompanyLine = (line: string) => { companyLine = line; };

export function blankValues(def: FormDef): Values {
  const v: Values = {};
  for (const [a, c] of Object.entries(def.layout.cells)) if (c.v != null) v[a] = typeof c.v === "string" ? c.v.replace("{{COMPANY_LINE}}", companyLine || "CHAI SIANG SDN. BHD.") : c.v;
  for (const b of checkboxCells(def.layout)) v[b.box] = "";
  Object.assign(v, { G9: "", I7: "", O7: "", H35: "", H37: "", M27: "", M32: "" });
  const { rows, cols } = def.lines;
  for (let r = rows[0]; r <= rows[1]; r++) for (const L of Object.values(cols)) v[`${L}${r}`] = "";
  // Keep the template's "(i)"/"1" style numbering label on the first line only.
  if (def.key === "fixed" || def.key === "addbbf") v[`E${rows[0]}`] = "(i)";
  if (def.totalCell) v[def.totalCell] = "";
  const sig = signatureCells(def.layout);
  v[sig.name[0]] = ""; v[sig.name[1]] = "";
  // Names that appear on every form come from environment settings, not from the code.
  v[sig.name[2]] = process.env.NEXT_PUBLIC_PAF_DISTRIBUTOR_REP ?? "";
  v[sig.name[3]] = process.env.NEXT_PUBLIC_PAF_CD_REP ?? "";
  for (const d of sig.date) v[d] = "";
  return v;
}

/** Recalculate the formula cells (what Excel formulas did in the template). */
export function recompute(def: FormDef, v: Values): Values {
  const out = { ...v };
  const { rows, cols } = def.lines;
  let sell = 0, cost = 0;
  for (let r = rows[0]; r <= rows[1]; r++) {
    const s = cols.sell ? lastNum(out[`${cols.sell}${r}`]) : 0;
    const c = cols.cost ? lastNum(out[`${cols.cost}${r}`]) : 0;
    sell += def.invoice === "sumSell" ? s : 0;
    cost += c;
    if (cols.rm) out[`${cols.rm}${r}`] = (cols.cost && out[`${cols.cost}${r}`]) || (def.key.startsWith("pkg") && out[`${cols.sell}${r}`]) ? "RM" : "";
    if (def.key === "fixed" || def.key === "addbbf") out[`N${r}`] = out[`O${r}`] ? "RM" : "";
    if (def.key.startsWith("pkg")) out[`O${r}`] = out[`P${r}`] ? "RM" : "";
    if (def.pct && cols.pct) out[`${cols.pct}${r}`] = s && c ? `${((c / s) * 100).toFixed(2)}%` : "";
  }
  if (def.invoice === "sumSell") out.H35 = sell ? money(Math.round(sell)) : "";
  if (def.cost === "sumCost") out.H37 = cost ? money(cost) : "";
  if (def.totalCell) out[def.totalCell] = def.cost === "sumCost" ? (cost ? money(cost) : "") : out.H37 ?? "";
  return out;
}
