// Turns what a reader found on a PO or invoice (raw text as printed) into a draft form with a status on every field.
// The reader only reports what it saw. These rules decide what to trust, what to flag and what to cross-check.
import type { ItemMap, Unit } from "./pounits";

export type Status = "read" | "check" | "missing";
export type Cell = { value: string; status: Status; note?: string };

/** What the reader returns for a PO. Everything is optional because a page can be poor. `unsure` lists fields it was not confident about. */
export type ExtractedPo = {
  poNo?: string; customerName?: string; poDate?: string; deliveryWindow?: string; windowFrom?: string; windowTo?: string; total?: number;
  lines: { code?: string; barcode?: string; description?: string; qty?: number; unit?: string; unitPrice?: number }[];
  unsure?: string[];
};
export type ExtractedInvoice = {
  invoiceNo?: string; invoiceDate?: string; poNo?: string; total?: number;
  lines: { code?: string; description?: string; qty?: number; unit?: string; unitPrice?: number }[];
  unsure?: string[];
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const valid = (y: number, m: number, d: number) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d; };

/** "Sep 15, 2026", "15 Sep 2026", "28/09/2026" (day first, as printed in Malaysia) and "2026-09-15" all become 2026-09-15 style. */
export function parseDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().replace(/\s+/g, " ");
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return valid(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : undefined;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) return valid(+m[3], +m[2], +m[1]) ? `${m[3]}-${pad(+m[2])}-${pad(+m[1])}` : undefined;
  m = /^([A-Za-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})$/.exec(s);
  if (m) { const mo = MONTHS.indexOf(m[1].toLowerCase()) + 1; return mo && valid(+m[3], mo, +m[2]) ? `${m[3]}-${pad(mo)}-${pad(+m[2])}` : undefined; }
  m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]*\.?,? (\d{4})$/.exec(s);
  if (m) { const mo = MONTHS.indexOf(m[2].toLowerCase()) + 1; return mo && valid(+m[3], mo, +m[1]) ? `${m[3]}-${pad(mo)}-${pad(+m[1])}` : undefined; }
  return undefined;
}

/** "Sep 16, 2026 ~ Sep 22, 2026" becomes two dates. */
export function parseWindow(raw?: string): { from?: string; to?: string } {
  if (!raw) return {};
  const parts = raw.split(/\s*(?:~|–|—|\bto\b)\s*/i).map((p) => parseDate(p)).filter(Boolean) as string[];
  if (parts.length === 1) return { from: parts[0], to: parts[0] };
  return { from: parts[0], to: parts[1] };
}

export function parseUnit(raw?: string): Unit | undefined {
  const u = (raw ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (["ea", "each", "unit", "units", "pc", "pcs", "piece", "pieces", "bottle", "tube", "tubes"].includes(u)) return "units";
  if (["ctn", "ctns", "carton", "cartons", "cs", "case", "cases", "box", "boxes"].includes(u)) return "cartons";
  return undefined;
}

const STOP = new Set(["sdn", "bhd", "berhad", "co", "ltd", "the", "and", "of", "pte", "plt", "enterprise", "trading"]);
const tokens = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((t) => t && !STOP.has(t));
/** 0 to 1: how much of the shorter name's words appear in the other. */
export function similarity(a: string, b: string): number {
  const x = tokens(a), y = tokens(b);
  if (!x.length || !y.length) return 0;
  const sy = new Set(y);
  const hit = x.filter((t) => sy.has(t)).length;
  return hit / Math.min(x.length, y.length);
}

/** The one candidate whose description is clearly the closest (at least 0.9, and ahead of the runner-up). */
export function bestByDescription<T>(desc: string, items: T[], getDesc: (t: T) => string): T | undefined {
  const scored = items.map((t) => ({ t, s: similarity(desc, getDesc(t)) })).sort((a, b) => b.s - a.s);
  if (!scored.length || scored[0].s < 0.9) return undefined;
  if (scored[1] && scored[1].s >= scored[0].s) return undefined;
  return scored[0].t;
}

export function matchCustomer(name: string | undefined, customers: { id: string; name: string }[]): { id?: string; label?: string; exact: boolean } {
  if (!name?.trim()) return { exact: false };
  let best: { id: string; name: string; s: number } | undefined;
  for (const c of customers) { const s = similarity(name, c.name); if (!best || s > best.s) best = { ...c, s }; }
  if (!best || best.s < 0.5) return { exact: false };
  return { id: best.id, label: best.name, exact: tokens(name).join(" ") === tokens(best.name).join(" ") };
}

const r2 = (n: number) => Math.round(n * 100) / 100;
export type TotalCheck = { ok: boolean; text: string };
export function totalCheck(what: string, docTotal: number | undefined, sum: number, linesFound: number): TotalCheck {
  const rm = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (docTotal === undefined) return { ok: false, text: `No total was found on the ${what}, so the lines cannot be checked. The lines add up to ${rm(sum)}.` };
  if (Math.abs(sum - docTotal) < 0.01) return { ok: true, text: `Total check: the ${linesFound} lines add up to ${rm(sum)}, the same as the total printed on the ${what}.` };
  return { ok: false, text: `Total check: the ${what} says ${rm(docTotal)} but the lines read add up to ${rm(sum)}. A line may be missing or misread.` };
}

// ---------- PO ----------
export type PoLineDraft = { code: string; qty: number; unit: Unit; price: number; status: Status; note?: string };
export type PoDraft = { poNo: Cell; customer: Cell & { id?: string }; poDate: Cell; winFrom: Cell; winTo: Cell; lines: PoLineDraft[]; docTotal?: number };

export function buildPoDraft(x: ExtractedPo, customers: { id: string; name: string }[], map: ItemMap[]): PoDraft {
  const unsure = new Set(x.unsure ?? []);
  const cell = (key: string, value: string | undefined, missing: string, ok?: string): Cell =>
    !value ? { value: "", status: "missing", note: missing } : unsure.has(key) ? { value, status: "check", note: "The reader was not sure of this. Check it against the file." } : { value, status: "read", note: ok };

  const cm = matchCustomer(x.customerName, customers);
  const customer: Cell & { id?: string } = !x.customerName ? { value: "", status: "missing", note: "No customer name could be found." }
    : !cm.id ? { value: x.customerName, status: "check", note: "No customer in your list matches this name. Choose the customer by hand." }
    : cm.exact && !unsure.has("customerName") ? { value: cm.label!, status: "read", id: cm.id }
    : { value: cm.label!, status: "check", id: cm.id, note: `The document says "${x.customerName}". Matched to ${cm.label} in your customer list. Confirm it is the same company.` };

  const win = x.windowFrom || x.windowTo ? { from: parseDate(x.windowFrom), to: parseDate(x.windowTo) } : parseWindow(x.deliveryWindow);
  const dateCell = (key: string, raw: string | undefined, iso: string | undefined, missing: string): Cell =>
    !raw ? { value: "", status: "missing", note: missing } : !iso ? { value: "", status: "check", note: `Could not understand the date "${raw}". Type it in.` } : cell(key, iso, missing, `Document says ${raw}.`);
  const poDate = dateCell("poDate", x.poDate, parseDate(x.poDate), "No PO date could be found.");
  const rawFrom = x.windowFrom ?? x.deliveryWindow, rawTo = x.windowTo ?? x.deliveryWindow;
  const winFrom = dateCell("windowFrom", rawFrom, win.from, "No delivery dates could be found on the page.");
  const winTo = dateCell("windowTo", rawTo, win.to, "No delivery dates could be found on the page.");
  if (winFrom.value && winTo.value && winTo.value < winFrom.value) { winTo.status = "check"; winTo.note = "The window ends before it starts. Check both dates."; }
  if (winTo.value && poDate.value && winTo.value < poDate.value) { winTo.status = "check"; winTo.note = "The window ends before the PO date. Check the dates."; }

  const lines = x.lines.map((l, i): PoLineDraft => {
    const n = i + 1;
    const byCode = l.code ? map.find((m) => m.custCode.toLowerCase() === l.code!.trim().toLowerCase()) : undefined;
    const byBarcode = !byCode && l.barcode ? map.find((m) => m.barcode && m.barcode === l.barcode!.trim()) : undefined;
    const byName = !byCode && !byBarcode && l.description ? bestByDescription(l.description, map, (m) => m.desc) : undefined;
    const hit = byCode ?? byBarcode ?? byName;
    const unit = parseUnit(l.unit);
    const notes: string[] = [];
    let status: Status = "read";
    if (!hit) { status = "check"; notes.push(l.code ? `Code ${l.code} is not in the item list.` : "No item code was found on this line."); }
    else if (!byCode) { status = "check"; notes.push(`Matched to ${hit.ourCode} by ${byBarcode ? "barcode" : "description"}. Confirm it.`); }
    if (unsure.has(`line:${n}:code`) || unsure.has(`line:${n}`)) { status = "check"; notes.push("The reader was not sure of this line. Check it against the file."); }
    if (!unit) { status = "check"; notes.push(l.unit ? `Unit "${l.unit}" is not recognised, so units were assumed.` : "No unit was found, so units were assumed."); }
    if (!(l.qty! > 0)) { status = "check"; notes.push("No quantity was found."); }
    if (l.unitPrice === undefined) { status = "check"; notes.push("No price was found."); }
    return { code: hit?.custCode ?? l.code ?? "", qty: l.qty ?? 0, unit: unit ?? "units", price: l.unitPrice ?? 0, status, note: notes.join(" ") || undefined };
  });
  return { poNo: cell("poNo", x.poNo?.trim(), "No PO number could be found."), customer, poDate, winFrom, winTo, lines, docTotal: x.total };
}
export const poSum = (lines: { qty: number; price: number }[]) => r2(lines.reduce((s, l) => s + l.qty * l.price, 0));

// ---------- invoice ----------
export type InvLineDraft = { sku: string; cartons: number; ctnPrice: number; status: Status; note?: string };
export type InvDraft = { invoiceNo: Cell; invoiceDate: Cell; poRef: Cell & { matches: boolean | null }; lines: InvLineDraft[]; extras: string[]; docTotal?: number };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** poLines are the saved PO's lines (our code, description, cartons, price per carton). */
export function buildInvoiceDraft(x: ExtractedInvoice, po: { poNo: string; lines: { sku: string; desc: string; cartons: number; ctnPrice: number }[] }, map: ItemMap[]): InvDraft {
  const unsure = new Set(x.unsure ?? []);
  const date = parseDate(x.invoiceDate);
  const invoiceNo: Cell = !x.invoiceNo?.trim() ? { value: "", status: "missing", note: "No invoice number could be read." } : unsure.has("invoiceNo") ? { value: x.invoiceNo.trim(), status: "check", note: "Hard to read. Check it against the scan." } : { value: x.invoiceNo.trim(), status: "read" };
  const invoiceDate: Cell = !x.invoiceDate ? { value: "", status: "missing", note: "No invoice date could be read." } : !date ? { value: "", status: "check", note: `Could not understand the date "${x.invoiceDate}". Type it in.` } : unsure.has("invoiceDate") ? { value: date, status: "check", note: "Hard to read. Check it." } : { value: date, status: "read", note: `Document says ${x.invoiceDate}.` };
  const refRaw = x.poNo?.trim();
  const matches = !refRaw ? null : norm(refRaw) === norm(po.poNo);
  const poRef: Cell & { matches: boolean | null } = !refRaw ? { value: "", status: "missing", matches, note: "Could not read a PO number, so it cannot be checked against this PO." }
    : matches ? { value: refRaw, status: unsure.has("poNo") ? "check" : "read", matches, note: "Matches the PO you are linking." }
    : { value: refRaw, status: "check", matches, note: `The invoice names PO ${refRaw}, but you are linking PO ${po.poNo}. Make sure this is the right PO.` };

  const used = new Set<number>();
  const lines = po.lines.map((pl, i): InvLineDraft => {
    const pack = map.find((m) => m.ourCode === pl.sku)?.pack;
    let idx = x.lines.findIndex((l, k) => !used.has(k) && !!l.code && norm(l.code) === norm(pl.sku));
    let how = "";
    if (idx < 0) {
      const cand = x.lines.map((l, k) => ({ l, k })).filter(({ l, k }) => !used.has(k) && !!l.description);
      const best = bestByDescription(pl.desc, cand, (c) => c.l.description!);
      idx = best ? best.k : -1; how = "description";
    }
    if (idx < 0) return { sku: pl.sku, cartons: 0, ctnPrice: pl.ctnPrice, status: "missing", note: "This item was not found on the invoice. If it was not invoiced, leave 0." };
    used.add(idx);
    const l = x.lines[idx];
    const unit = parseUnit(l.unit);
    const notes: string[] = []; let status: Status = "read";
    if (how) { status = "check"; notes.push("Matched by description. Confirm it."); }
    let cartons = l.qty ?? 0;
    if (unit === "units") { if (pack) cartons = l.qty! / pack; else { status = "check"; notes.push("The invoice is in units and the carton size is unknown."); } }
    if (!Number.isInteger(r2(cartons))) { status = "check"; notes.push("Not a whole number of cartons."); }
    if (l.qty === undefined) { status = "check"; notes.push("No quantity was found."); }
    if (l.unitPrice === undefined) { status = "check"; notes.push("No price was found."); }
    if (unsure.has(`line:${i + 1}`) || unsure.has(`line:${idx + 1}`)) { status = "check"; notes.push("The reader was not sure of this line. Check it against the scan."); }
    const ctnPrice = l.unitPrice === undefined ? pl.ctnPrice : unit === "units" && pack ? r2(l.unitPrice * pack) : l.unitPrice;
    return { sku: pl.sku, cartons: r2(cartons), ctnPrice, status, note: notes.join(" ") || undefined };
  });
  const extras = x.lines.filter((_, k) => !used.has(k)).map((l) => l.description || l.code || "an unnamed line");
  return { invoiceNo, invoiceDate, poRef, lines, extras, docTotal: x.total };
}
export const invSum = (lines: { cartons: number; ctnPrice: number }[]) => r2(lines.reduce((s, l) => s + l.cartons * l.ctnPrice, 0));
