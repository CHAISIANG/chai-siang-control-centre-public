// E-invoice print: the data for one printed invoice, built from the SAP import lines.
// The layout is fixed (see components/EInvoiceSheet); only these values change from invoice to invoice.
import type { ImportRow } from "./sapInvoice";

export type Company = {
  nameCn: string; name: string; regNo: string; tin: string;
  address: string; tel: string; mobile: string; email: string;
  bankName: string; bankAccountNo: string; interestPct: string;
};

export type Party = { name: string; brn: string; tin: string; address: string[]; email: string; tel: string };

export type InvoiceLine = { code: string; desc: string; perCtn: number; price: number; qty: number; unit: string; disc: number; amount: number };

export type InvoiceDoc = {
  no: string; date: Date | null; po: string; ourRef: string; attn: string; agent: string; terms: string; acCode: string;
  bill: Party; ship: Party;
  lines: InvoiceLine[];
  einv: { uuid: string; validatedAt: string; qrUrl: string } | null; // from LHDN MyInvois once validated
};

export const LINES_PER_PAGE = 14;

export const blankParty = (name = ""): Party => ({ name, brn: "", tin: "", address: [], email: "", tel: "" });

/** Group the import lines into one invoice per document number, in the order they appear. */
export function invoicesFrom(rows: ImportRow[], party: (code: string, name: string) => { bill: Party; ship: Party; terms: string }): InvoiceDoc[] {
  const docs = new Map<string, InvoiceDoc>();
  for (const r of rows) {
    let d = docs.get(r.docNo);
    if (!d) {
      const p = party(r.code, r.customerName);
      d = { no: r.docNo, date: r.docDate, po: r.docRef, ourRef: "", attn: "", agent: r.agent, terms: p.terms, acCode: r.code, bill: p.bill, ship: p.ship, lines: [], einv: null };
      docs.set(r.docNo, d);
    }
    d.lines.push({ code: String(r.itemCode), desc: r.desc, perCtn: r.suomQty, price: r.unitPrice, qty: r.qty, unit: r.uom, disc: r.discount, amount: r.amount });
  }
  return [...docs.values()];
}

const ONES = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
const TENS = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
function under1000(n: number): string {
  const h = Math.floor(n / 100), r = n % 100;
  const rest = r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`;
  return [h ? `${ONES[h]} HUNDRED` : "", rest].filter(Boolean).join(" ");
}
function words(n: number): string {
  if (n === 0) return "ZERO";
  const parts: string[] = [];
  for (const [size, name] of [[1e9, "BILLION"], [1e6, "MILLION"], [1e3, "THOUSAND"], [1, ""]] as const) {
    const c = Math.floor(n / size) % 1000;
    if (c) parts.push(`${under1000(c)}${name ? ` ${name}` : ""}`);
  }
  return parts.join(" ");
}
/** 3418.29 -> "THREE THOUSAND FOUR HUNDRED EIGHTEEN AND CENTS TWENTY NINE ONLY" */
export function amountInWords(amount: number): string {
  const sen = Math.round(amount * 100);
  const rm = Math.floor(sen / 100), c = sen % 100;
  return `${words(rm)}${c ? ` AND CENTS ${words(c)}` : ""} ONLY`;
}

// ---------- real data ----------

/** The top part of the invoice, from Finance settings. */
export function companyFrom(s: { company_name: string; company_name_cn: string; reg_no: string; tin: string; company_address: string; company_phone: string; company_mobile: string; company_email: string; bank_name: string; bank_account_no: string; late_interest: string }): Company {
  return {
    nameCn: s.company_name_cn, name: s.company_name.toUpperCase(), regNo: s.reg_no, tin: s.tin,
    address: s.company_address.split(/\r?\n/).map((l) => l.trim().replace(/,$/, "")).filter(Boolean).join(", "),
    tel: s.company_phone, mobile: s.company_mobile, email: s.company_email,
    bankName: s.bank_name.toUpperCase(), bankAccountNo: s.bank_account_no, interestPct: s.late_interest || "1.5%",
  };
}

/** Which company details are still empty, by their label in Finance settings. */
export function companyGaps(c: Company): string[] {
  return ([["Company name in Chinese", c.nameCn], ["Company reg. no.", c.regNo], ["TIN", c.tin], ["Address", c.address], ["Phone", c.tel], ["Mobile", c.mobile], ["Email", c.email], ["Bank", c.bankName], ["Account number", c.bankAccountNo]] as const)
    .filter(([, v]) => !v).map(([k]) => k);
}

/** "within 14 days Due n" -> "14"; "PT00" -> "0". */
export function termsFrom(paymentTerm: string | null | undefined): string {
  const t = paymentTerm ?? "";
  const m = t.match(/(\d+)\s*day/i) ?? t.match(/^PT(\d+)$/i);
  return m ? String(Number(m[1])) : t;
}

export type EinvCustomer = { cust_code: string; bill_name: string | null; brn: string | null; tin: string | null; bill_address: string | null; ship_address: string | null; email: string | null; tel: string | null; terms: string | null };
export type EinvValidation = { doc_no: string; uuid: string; long_id: string | null; qr_link: string | null; validated_at: string | null };

const lines = (s: string | null | undefined) => (s ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

export function partiesFrom(sapName: string, c: EinvCustomer | undefined): { bill: Party; ship: Party } {
  const name = (c?.bill_name || sapName).toUpperCase();
  const base = { name, brn: c?.brn ?? "", tin: c?.tin ?? "", email: c?.email ?? "", tel: c?.tel ?? "" };
  const bill = { ...base, address: lines(c?.bill_address) };
  const ship = { ...base, address: lines(c?.ship_address).length ? lines(c?.ship_address) : bill.address };
  return { bill, ship };
}

/** Where the QR code points: the MyInvois share link, made from the UUID and long ID when no link is given. */
export function qrTarget(v: EinvValidation): string {
  if (v.qr_link) return v.qr_link;
  return v.long_id ? `https://myinvois.hasil.gov.my/${v.uuid}/share/${v.long_id}` : "";
}

// ---------- uploads ----------
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const cell = (v: unknown) => (v == null ? "" : v instanceof Date ? v.toISOString() : String(v).trim());

function headerIndex(rows: unknown[][], must: string[]): number {
  return rows.findIndex((r) => must.every((m) => r.some((c) => norm(c) === m)));
}
function pick(head: unknown[], names: string[]): number {
  return head.findIndex((c) => names.includes(norm(c)));
}

export const CUSTOMER_HEADERS = ["Customer code", "Customer name (from SAP)", "Name on invoice (if different)", "BRN", "TIN", "Billing address line 1", "Billing address line 2", "Billing address line 3", "Billing address line 4", "Delivery address line 1", "Delivery address line 2", "Delivery address line 3", "Delivery address line 4", "Email", "Tel", "Terms (days, if different)"];

/** Read the filled customer template. A blank cell keeps what is saved. */
export function parseCustomerSheet(rows: unknown[][]): { rows: Partial<EinvCustomer>[]; error: string } {
  const hi = headerIndex(rows, ["customercode"]);
  if (hi < 0) return { rows: [], error: 'The column "Customer code" was not found. Use the downloaded template.' };
  const h = rows[hi];
  const ix = (n: string) => pick(h, [norm(n)]);
  const addr = (kind: string) => [1, 2, 3, 4].map((i) => ix(`${kind} address line ${i}`));
  const out: Partial<EinvCustomer>[] = [];
  for (const r of rows.slice(hi + 1)) {
    const code = cell(r[ix("Customer code")]);
    if (!code) continue;
    const rec: Partial<EinvCustomer> = { cust_code: code };
    const set = (k: keyof EinvCustomer, i: number) => { const v = i < 0 ? "" : cell(r[i]); if (v) (rec as Record<string, string>)[k] = v; };
    set("bill_name", ix("Name on invoice (if different)"));
    set("brn", ix("BRN")); set("tin", ix("TIN")); set("email", ix("Email")); set("tel", ix("Tel")); set("terms", ix("Terms (days, if different)"));
    const bill = addr("Billing").map((i) => (i < 0 ? "" : cell(r[i]))).filter(Boolean);
    const ship = addr("Delivery").map((i) => (i < 0 ? "" : cell(r[i]))).filter(Boolean);
    if (bill.length) rec.bill_address = bill.join("\n");
    if (ship.length) rec.ship_address = ship.join("\n");
    if (Object.keys(rec).length > 1) out.push(rec);
  }
  return { rows: out, error: "" };
}

export const VALIDATION_HEADERS = ["Invoice no", "UUID", "Long ID", "QR link", "Validation date"];

/** Read the LHDN validation list: invoice number, UUID and either the long ID or the QR link. */
export function parseValidationSheet(rows: unknown[][]): { rows: EinvValidation[]; error: string } {
  const hi = rows.findIndex((r) => r.some((c) => norm(c) === "uuid"));
  if (hi < 0) return { rows: [], error: 'The column "UUID" was not found.' };
  const h = rows[hi];
  const doc = pick(h, ["invoiceno", "einvoiceno", "docno", "documentno", "internalid", "invoicenumber"]);
  if (doc < 0) return { rows: [], error: 'The invoice number column was not found. Call it "Invoice no".' };
  const uuid = pick(h, ["uuid"]), long = pick(h, ["longid"]), link = pick(h, ["qrlink", "validationlink", "link", "qrcode", "url"]), when = pick(h, ["validationdate", "validated", "datevalidated", "validationdatetime"]);
  const out: EinvValidation[] = [];
  for (const r of rows.slice(hi + 1)) {
    const d = cell(r[doc]), u = cell(r[uuid]);
    if (!d || !u) continue;
    const w = when < 0 ? null : r[when];
    out.push({
      doc_no: d, uuid: u,
      long_id: long < 0 ? null : cell(r[long]) || null,
      qr_link: link < 0 ? null : cell(r[link]) || null,
      validated_at: w instanceof Date ? w.toLocaleString("en-GB", { timeZone: "UTC" }).replace(",", "") : cell(w) || null,
    });
  }
  return { rows: out, error: "" };
}
