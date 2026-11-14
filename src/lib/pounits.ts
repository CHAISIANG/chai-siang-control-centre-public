// Customer item codes, cartons versus units, printed invoice numbers and delivery windows.
// The database applies the same rules; these run first so people see the problem before saving.
export type ItemMap = { id?: string; clientId?: string; custCode: string; barcode: string; ourCode: string; desc: string; pack: number; ctnPrice: number };
export type Unit = "units" | "cartons";
export type DraftLine = { code: string; qty: number; unit: Unit; unitPrice: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Resolved = { map?: ItemMap; cartons: number; wholeCartons: boolean; priceOk: boolean; amount: number };
/** The customer's code becomes our item; units become cartons; the price is checked against the agreed carton price. */
export function resolveLine(map: ItemMap[], l: DraftLine): Resolved {
  const m = map.find((x) => x.custCode.trim().toLowerCase() === l.code.trim().toLowerCase());
  const amount = r2(l.qty * l.unitPrice);
  if (!m) return { cartons: 0, wholeCartons: true, priceOk: true, amount };
  const cartons = l.unit === "cartons" ? l.qty : l.qty / m.pack;
  const perUnit = l.unit === "cartons" ? l.unitPrice / m.pack : l.unitPrice;
  return { map: m, cartons, wholeCartons: Math.abs(cartons - Math.round(cartons)) < 1e-9, priceOk: Math.abs(perUnit - m.ctnPrice / m.pack) < 0.005, amount };
}

export function checkNewPo(v: { poNo: string; clientId: string; poDate: string; winFrom: string; winTo: string; draft: DraftLine[] }, map: ItemMap[]): string | null {
  if (!v.poNo.trim()) return "Enter the customer's PO number.";
  if (!v.clientId) return "Choose the customer.";
  if (!v.winFrom || !v.winTo) return "Enter the delivery window.";
  if (v.winTo < v.winFrom) return "The delivery window cannot end before it starts.";
  if (v.winTo < v.poDate) return "The delivery window cannot end before the PO date.";
  if (!v.draft.length) return "Add at least one line.";
  for (const [i, l] of v.draft.entries()) {
    const n = i + 1;
    if (!(l.qty > 0)) return `Line ${n}: enter a quantity above 0.`;
    const r = resolveLine(map, l);
    if (!r.map) return `Line ${n}: code ${l.code || "(blank)"} is not in the customer's item list. Add it first.`;
    if (!r.wholeCartons) return `Line ${n}: ${l.qty} units is not a whole number of cartons (${r.map.pack} per carton).`;
    if (!r.priceOk) return `Line ${n}: the price differs from the agreed price. Confirm it with the customer, or update the item list.`;
  }
  return null;
}

export type InvLine = { cartons: number; ctnPrice: number };
export function checkInvoiceLink(otherInvoiceNos: string[], poDate: string, nLines: number, v: { no: string; date: string; lines: InvLine[] }): string | null {
  if (!v.no.trim()) return "Enter the invoice number as printed.";
  if (otherInvoiceNos.some((n) => n.toLowerCase() === v.no.trim().toLowerCase())) return "That invoice number is already linked to another PO.";
  if (!v.date) return "Enter the invoice date.";
  if (v.date < poDate) return "The invoice date cannot be before the PO date.";
  if (v.lines.length !== nLines) return "Enter the cartons and price for every line.";
  if (v.lines.some((l) => !(l.cartons >= 0) || !(l.ctnPrice >= 0))) return "Check the cartons and prices.";
  return null;
}

export type Diff = { kind: "short" | "over" | "price"; text: string; value: number };
export function compareLines(po: InvLine[], inv: InvLine[]): { diffs: Diff[][]; poTotal: number; invTotal: number } {
  const diffs = po.map((l, i): Diff[] => {
    const d: Diff[] = [];
    const dq = l.cartons - inv[i].cartons;
    if (dq > 0) d.push({ kind: "short", text: `Short by ${dq} cartons`, value: r2(dq * l.ctnPrice) });
    if (dq < 0) d.push({ kind: "over", text: `Over by ${-dq} cartons`, value: r2(-dq * l.ctnPrice) });
    if (Math.abs(inv[i].ctnPrice - l.ctnPrice) > 0.004) d.push({ kind: "price", text: `Price ${inv[i].ctnPrice.toFixed(2)} vs ${l.ctnPrice.toFixed(2)}`, value: r2(Math.abs(inv[i].ctnPrice - l.ctnPrice) * inv[i].cartons) });
    return d;
  });
  return { diffs, poTotal: r2(po.reduce((s, l) => s + l.cartons * l.ctnPrice, 0)), invTotal: r2(inv.reduce((s, l) => s + l.cartons * l.ctnPrice, 0)) };
}

const day = (s: string) => Math.round(new Date(s).getTime() / 86400000);
/** On time means delivered inside the customer's window. */
export function windowCheck(winFrom: string, winTo: string, delivered: string): { onTime: boolean; text: string } {
  if (delivered < winFrom) return { onTime: false, text: `${day(winFrom) - day(delivered)} day(s) before the window opens` };
  if (delivered > winTo) return { onTime: false, text: `${day(delivered) - day(winTo)} day(s) late` };
  return { onTime: true, text: "Inside the window" };
}
