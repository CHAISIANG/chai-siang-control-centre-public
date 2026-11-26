// Colgate SAP (SAPDMS) invoice export -> accounting import file.
// Does in one pass what finance used to do by hand in Excel:
//   1. sort by document, item description, item code
//   2. keep only the columns the import needs (found by header name, not by column letter)
//   3. make the scheme discount positive and work out the carton price
//   4. use that carton price as the unit price
//   5-6. split an item ordered in both cartons and loose units into two lines,
//        sharing the scheme discount and the net value between them
// The two lines of a split item always add back to SAP's net value, to the sen.

export type SapLine = {
  row: number; // row number in the uploaded sheet, for messages
  customer: string;
  customerName: string;
  salesRep: string;
  docNo: string;
  docDate: Date | null;
  orderRef: string;
  material: string | number;
  desc: string;
  conv: number;
  cs: number;
  unit1: string;
  ea: number;
  unit2: string;
  listPrice: number;
  net: number;
  scheme: number; // as SAP gives it (negative)
  manualDiscount: number;
  docType: string;
};

export type ImportRow = {
  code: string;
  customerName: string;
  agent: string;
  docNo: string;
  docDate: Date | null;
  docRef: string;
  itemCode: string | number;
  desc: string;
  qty: number;
  uom: "Ctn" | "Unit" | "Pack";
  unitPrice: number;
  amount: number;
  discount: number;
  suomQty: number;
  split: boolean; // one of the two lines of a carton + loose split
};

export type Issue = { level: "error" | "warn"; docNo: string; item: string; text: string };

export const IMPORT_HEADERS = ["Code", "Customer Name", "Agent", "Doc No.", "Doc Date", "Doc Ref 1", "Item Code", "Order Qty", "UOM", "Unit Price", "Amount", "Discount", "SUOMQTY"];

// Header name in the SAP export -> field. The names are matched loosely (case, spaces and dots ignored).
const COLS: Record<string, keyof SapLine> = {
  customer: "customer",
  customername: "customerName",
  salesrep: "salesRep",
  documentno: "docNo",
  documentdate: "docDate",
  hdmsorderno: "orderRef",
  material: "material",
  materialdesc: "desc",
  conv: "conv",
  orderqty: "cs",
  salesunit1: "unit1",
  orderqtyineaip: "ea",
  salesunit2: "unit2",
  listprice: "listPrice",
  netval: "net",
  schemediscount: "scheme",
  manualdiscount: "manualDiscount",
  documenttypedescr: "docType",
};
const REQUIRED: (keyof SapLine)[] = ["customer", "docNo", "material", "desc", "conv", "cs", "ea", "net", "scheme"];
const LABEL: Partial<Record<keyof SapLine, string>> = { customer: "Customer", docNo: "Document No.", material: "Material", desc: "Material Desc", conv: "Conv", cs: "Order Qty", ea: "Order Qty in EA/IP", net: "Net Val", scheme: "Scheme Discount" };

const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const num = (v: unknown) => {
  if (typeof v === "number") return v;
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown) => (v == null ? "" : String(v).trim());
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const clean = (n: number) => Math.round(n * 1e8) / 1e8;

function toDate(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)); // Excel serial
  const m = str(v).match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/); // SAP gives 17.11.2026
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  return null;
}

/** Read the SAP export. Returns the lines, or the names of the columns it could not find. */
export function parseSap(rows: unknown[][]): { lines: SapLine[]; missing: string[] } {
  const hi = rows.findIndex((r) => r.some((c) => norm(c) === "documentno") && r.some((c) => norm(c) === "material"));
  if (hi < 0) return { lines: [], missing: REQUIRED.map((k) => LABEL[k] ?? k) };
  const at: Partial<Record<keyof SapLine, number>> = {};
  rows[hi].forEach((c, i) => {
    const f = COLS[norm(c)];
    if (f && at[f] === undefined) at[f] = i;
  });
  const missing = REQUIRED.filter((k) => at[k] === undefined).map((k) => LABEL[k] ?? k);
  if (missing.length) return { lines: [], missing };
  const g = (r: unknown[], k: keyof SapLine) => (at[k] === undefined ? null : r[at[k]!]);
  const lines: SapLine[] = [];
  rows.slice(hi + 1).forEach((r, i) => {
    const docNo = str(g(r, "docNo"));
    const material = g(r, "material");
    if (!docNo || material == null || str(material) === "") return; // blank and total rows
    lines.push({
      row: hi + i + 2,
      customer: str(g(r, "customer")),
      customerName: str(g(r, "customerName")),
      salesRep: str(g(r, "salesRep")),
      docNo,
      docDate: toDate(g(r, "docDate")),
      orderRef: str(g(r, "orderRef")),
      material: typeof material === "number" ? material : str(material),
      desc: str(g(r, "desc")),
      conv: num(g(r, "conv")),
      cs: num(g(r, "cs")),
      unit1: str(g(r, "unit1")),
      ea: num(g(r, "ea")),
      unit2: str(g(r, "unit2")),
      listPrice: num(g(r, "listPrice")),
      net: num(g(r, "net")),
      scheme: num(g(r, "scheme")),
      manualDiscount: num(g(r, "manualDiscount")),
      docType: str(g(r, "docType")),
    });
  });
  return { lines, missing: [] };
}

/** Step 1: document, then item description, then item code. */
export function sortLines(lines: SapLine[]): SapLine[] {
  const s = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...lines].sort((a, b) => s(a.docNo, b.docNo) || s(a.desc.toLowerCase(), b.desc.toLowerCase()) || s(String(a.material), String(b.material)));
}

/**
 * Steps 3-6. packItems: item codes whose loose unit is a pack (twin packs, 3-packs ...), shown as "Pack" instead of "Unit".
 */
export function convert(input: SapLine[], packItems: Set<string> = new Set()): { rows: ImportRow[]; issues: Issue[] } {
  const rows: ImportRow[] = [];
  const issues: Issue[] = [];
  for (const l of sortLines(input)) {
    const item = `${l.material} ${l.desc}`;
    const add = (level: Issue["level"], text: string) => issues.push({ level, docNo: l.docNo, item, text });
    if (l.conv <= 0) { add("error", `No carton size (Conv) in SAP, so the carton price cannot be worked out. Sheet row ${l.row}.`); continue; }
    if (l.cs < 0 || l.ea < 0) { add("error", `Negative quantity. This looks like a return, which needs a credit note instead. Sheet row ${l.row}.`); continue; }
    const units = l.cs * l.conv + l.ea;
    if (units === 0) { add("error", `No quantity in cartons or loose units. Sheet row ${l.row}.`); continue; }

    const scheme = Math.abs(l.scheme); // step 3.1: remove the minus sign
    const price = clean(((l.net + scheme) / units) * l.conv); // step 3.2: carton price
    if (l.net <= 0) add("warn", "Net value is zero. Check whether this is free goods.");
    if (l.manualDiscount) add("warn", `SAP has a manual discount of RM ${Math.abs(l.manualDiscount).toFixed(2)} on this line. It is already inside the net value.`);
    if (l.listPrice && Math.abs(l.listPrice - (l.net + scheme)) > 0.05) add("warn", `SAP list price RM ${l.listPrice.toFixed(2)} is not net value plus scheme discount (RM ${(l.net + scheme).toFixed(2)}). The carton price uses net plus scheme.`);
    if (l.docType && !/invoice/i.test(l.docType)) add("warn", `Document type is "${l.docType}", not an invoice.`);
    if (l.cs > 0 && l.unit1 && l.unit1.toUpperCase() !== "CS") add("warn", `First unit is "${l.unit1}", expected CS.`);

    const base = {
      code: l.customer, customerName: l.customerName, agent: l.salesRep, docNo: l.docNo, docDate: l.docDate,
      docRef: l.orderRef && l.orderRef !== l.docNo ? l.orderRef : "", // SAP repeats the invoice number when there is no customer order number
      itemCode: l.material, desc: l.desc, unitPrice: price, suomQty: l.conv,
    };
    const looseUom = packItems.has(String(l.material)) ? "Pack" : "Unit";

    if (l.cs > 0 && l.ea > 0) {
      // step 6.2: the carton line takes its share of the scheme discount; the loose line takes the rest
      const csDisc = r2((scheme * l.cs * l.conv) / units);
      const csAmt = r2(l.cs * price - csDisc);
      rows.push({ ...base, qty: l.cs, uom: "Ctn", amount: csAmt, discount: csDisc, split: true });
      rows.push({ ...base, qty: l.ea, uom: looseUom, amount: r2(l.net - csAmt), discount: r2(scheme - csDisc), split: true });
    } else if (l.cs > 0) {
      rows.push({ ...base, qty: l.cs, uom: "Ctn", amount: r2(l.net), discount: r2(scheme), split: false });
    } else {
      rows.push({ ...base, qty: l.ea, uom: looseUom, amount: r2(l.net), discount: r2(scheme), split: false });
    }
  }
  return { rows, issues };
}

/** Totals per document, SAP against the import file, to prove nothing was lost. */
export function reconcile(lines: SapLine[], rows: ImportRow[]) {
  const docs = new Map<string, { docNo: string; customer: string; sapNet: number; sapScheme: number; outNet: number; outDisc: number; lines: number }>();
  for (const l of lines) {
    const d = docs.get(l.docNo) ?? { docNo: l.docNo, customer: l.customerName || l.customer, sapNet: 0, sapScheme: 0, outNet: 0, outDisc: 0, lines: 0 };
    d.sapNet += l.net;
    d.sapScheme += Math.abs(l.scheme);
    docs.set(l.docNo, d);
  }
  for (const r of rows) {
    const d = docs.get(r.docNo);
    if (!d) continue;
    d.outNet += r.amount;
    d.outDisc += r.discount;
    d.lines += 1;
  }
  return [...docs.values()].map((d) => ({ ...d, sapNet: r2(d.sapNet), sapScheme: r2(d.sapScheme), outNet: r2(d.outNet), outDisc: r2(d.outDisc), ok: Math.abs(d.sapNet - d.outNet) < 0.005 && Math.abs(d.sapScheme - d.outDisc) < 0.005 }));
}

/** Item codes marked as packs, read from a sheet with an SKU / item code column (e.g. the "NEW UOM" sheet). */
export function parsePackList(rows: unknown[][]): { code: string; desc: string }[] {
  const hi = rows.findIndex((r) => r.some((c) => ["sku", "itemcode", "material"].includes(norm(c))));
  if (hi < 0) return [];
  const ci = rows[hi].findIndex((c) => ["sku", "itemcode", "material"].includes(norm(c)));
  const di = rows[hi].findIndex((c) => ["description", "materialdesc", "desc"].includes(norm(c)));
  const seen = new Map<string, string>();
  for (const r of rows.slice(hi + 1)) {
    const code = str(r[ci]);
    if (code && !seen.has(code)) seen.set(code, di < 0 ? "" : str(r[di]));
  }
  return [...seen].map(([code, desc]) => ({ code, desc }));
}

/** One line of the import file, whether it comes from a fresh conversion or from the history. */
export type FileRow = Pick<ImportRow, "code" | "customerName" | "agent" | "docNo" | "docDate" | "docRef" | "itemCode" | "qty" | "uom" | "unitPrice" | "amount" | "discount" | "suomQty">;

/** Amount of a line: cartons at the carton price, or loose units as a share of a carton, less the discount. */
export function lineAmount(qty: number, uom: string, unitPrice: number, perCarton: number, discount: number): number {
  const cartons = uom === "Ctn" || !perCarton ? qty : qty / perCarton;
  return r2(cartons * unitPrice - discount);
}

/** Unit Price and Amount are always written rounded to 2 decimals and formatted to show exactly 2 (10.00, 15.50, 20.75). */
export const MONEY_FORMAT = "0.00";
const money = (n: number) => ({ value: r2(Number.isFinite(n) ? n : 0), format: MONEY_FORMAT });

/** The rows of the IMPORT sheet below the headings, in the 13 columns the accounting system takes. */
export function importSheetRows(rows: FileRow[]) {
  return rows.map((r) => [
    { value: r.code }, { value: r.customerName }, { value: r.agent }, { value: r.docNo },
    r.docDate ? { value: r.docDate, format: "dd/mm/yyyy" } : { value: "" },
    { value: r.docRef }, { value: r.itemCode }, { value: r.qty }, { value: r.uom },
    money(r.unitPrice), money(r.amount), { value: r.discount ? r.discount.toFixed(2) : "" }, { value: r.suomQty },
  ]);
}

/** Write the import file (sheet IMPORT, same 13 columns the accounting system takes) and save it. */
export async function writeImportFile(rows: FileRow[], fileName: string) {
  const { default: writeExcelFile } = await import("write-excel-file/browser");
  const head = (t: string) => ({ value: t, fontWeight: "bold" as const });
  await writeExcelFile([{ sheet: "IMPORT", columns: [14, 36, 14, 14, 12, 18, 12, 10, 8, 12, 12, 10, 10].map((width) => ({ width })), data: [IMPORT_HEADERS.map(head), ...importSheetRows(rows)] }]).toFile(fileName);
}
