// Reads the four weekly Excel reports (aging, coverage and net sales, sales by product and rep, net sales by customer).
// Pure code: it takes the rows of a sheet and returns tidy data plus checks that the reports agree with each other.
export type Row = unknown[];

/** Salesmen who are never loaded: not in the database, not in the screens, not in the test run. Their open invoices (if any) are kept as debts of the customer. */
export const EXCLUDED_SALESMEN: readonly string[] = ["MY01S00006", "MY01S00013", "MY01S00015", "MY01S00018"];
export const isExcluded = (code: string) => EXCLUDED_SALESMEN.includes(code);

const r2 = (n: number) => Math.round(n * 100) / 100;
/** Numbers arrive as numbers or as text like "1059125.00" or "90.70-" (a trailing minus means negative). */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v !== "string") return 0;
  const s = v.trim().replace(/,/g, "");
  if (!s) return 0;
  const neg = s.endsWith("-");
  const n = parseFloat(neg ? s.slice(0, -1) : s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}
const has = (v: unknown) => v !== null && v !== undefined && v !== "";
const txt = (v: unknown) => (has(v) ? String(v).trim() : "");
export function isoDate(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  const s = txt(v);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

export type Kind = "aging" | "coverage" | "products" | "customers";
export const KIND_LABEL: Record<Kind, string> = { aging: "Aging", coverage: "Coverage and net sales", products: "Sales by products and sales rep", customers: "Net sales by customer" };

/** Which report is this? Decided from the header rows, not the file name. */
export function detectReport(rows: Row[]): Kind | null {
  const head = rows.slice(0, 6).map((r) => r.map(txt).join("|").toLowerCase());
  if (head.some((h) => h.includes("doc no") && h.includes("company name") && h.includes("outstanding"))) return "aging";
  if (head.some((h) => h.startsWith("description|jan"))) return "coverage";
  if (head.some((h) => h.startsWith("product code|product description"))) return "products";
  if (head.some((h) => h.startsWith("name|jan") && h.includes("a/r balance"))) return "customers";
  return null;
}

// ---------- aging ----------
export type AgingInvoice = { doc: string; date: string; custCode: string; customer: string; terms: number; due: string; agent: string; amount: number; age: number; outstanding: number; note: string };
export type Aging = { invoices: AgingInvoice[]; fileGrandTotal?: number; fileSideTotals: { label: string; total: number }[]; sum: number };

export function parseAging(rows: Row[]): Aging {
  const hi = rows.findIndex((r) => txt(r[0]).toLowerCase() === "doc no");
  const invoices: AgingInvoice[] = [];
  const side: { label: string; total: number }[] = [];
  let grand: number | undefined;
  for (const r of rows.slice(hi + 1)) {
    const doc = txt(r[0]);
    if (doc && has(r[2])) {
      invoices.push({ doc, date: isoDate(r[1]), custCode: txt(r[2]), customer: txt(r[3]), terms: num(r[4]), due: isoDate(r[5]), agent: txt(r[6]), amount: num(r[7]), age: num(r[8]), outstanding: num(r[9]), note: txt(r[10]) });
    } else if (!doc && /total$/i.test(txt(r[6])) && has(r[9])) {
      const label = txt(r[6]);
      if (/^grand total$/i.test(label)) grand = num(r[9]);
      else if (!/^\d+ total$/i.test(label)) side.push({ label, total: num(r[9]) }); // a separate group total (for example a special customer group) sits outside the grand total
    }
  }
  return { invoices, fileGrandTotal: grand, fileSideTotals: side, sum: r2(invoices.reduce((s, i) => s + i.outstanding, 0)) };
}

export const AGE_BUCKETS = [
  { key: "current", label: "Not due", test: (a: number) => a <= 0 },
  { key: "d1", label: "1 to 30 days", test: (a: number) => a >= 1 && a <= 30 },
  { key: "d31", label: "31 to 60 days", test: (a: number) => a >= 31 && a <= 60 },
  { key: "d61", label: "61 to 90 days", test: (a: number) => a >= 61 && a <= 90 },
  { key: "d91", label: "91 to 180 days", test: (a: number) => a >= 91 && a <= 180 },
  { key: "d181", label: "181 to 365 days", test: (a: number) => a >= 181 && a <= 365 },
  { key: "d365", label: "Over 1 year", test: (a: number) => a > 365 },
] as const;
export const bucketIndex = (age: number) => AGE_BUCKETS.findIndex((b) => b.test(age));

/** Agent number 2 is salesman MY01S00002. */
export const agentToSalesman = (agent: string) => (/^\d{1,2}$/.test(agent) ? `MY01S${agent.padStart(5, "0")}` : "");
/** Aging customer code 123 is MY01C00123. */
export const custCodeOf = (code: string) => (/^\d+$/.test(code) ? `MY01C${code.padStart(5, "0")}` : code);

// ---------- coverage and net sales ----------
export type CovMonthly = { rl: number[]; active: number[]; erc: number[]; calls: number[]; invoices: number[]; productivity: number[]; target: (number | null)[]; sales: number[]; ytd: Record<string, number> };
export type CovRep = { code: string; name: string } & CovMonthly;
export type Coverage = { reps: CovRep[]; total: CovMonthly | null };

const METRICS: Record<string, keyof CovMonthly> = { "rl acct": "rl", "active acct": "active", "erc (%)": "erc", "target calls": "calls", "no. of invoices": "invoices", "productivity (%)": "productivity", "sales target": "target", "net sales": "sales" };
const blank = (): CovMonthly => ({ rl: [], active: [], erc: [], calls: [], invoices: [], productivity: [], target: [], sales: [], ytd: {} });

export function parseCoverage(rows: Row[]): Coverage {
  const reps: CovRep[] = [];
  let total: CovMonthly | null = null;
  let cur: { code: string; name: string; m: CovMonthly } | { code: "TOTAL"; name: "Total"; m: CovMonthly } | null = null;
  const flush = () => { if (!cur) return; if (cur.code === "TOTAL") total = cur.m; else reps.push({ code: cur.code, name: cur.name, ...cur.m }); cur = null; };
  for (const r of rows.slice(1)) {
    const label = txt(r[0]);
    const head = /^(MY\d+S\d+) - (.+)$/.exec(label);
    if (head) { flush(); cur = { code: head[1], name: head[2].trim(), m: blank() }; continue; }
    if (label.toLowerCase() === "total" && r.slice(1).every((c) => !has(c))) { flush(); cur = { code: "TOTAL", name: "Total", m: blank() }; continue; }
    if (!cur) continue;
    const key = METRICS[label.toLowerCase()];
    if (!key) continue;
    const months = r.slice(1, 13);
    if (key === "target") cur.m.target = months.map((c) => (has(c) ? num(c) : null));
    else (cur.m[key] as number[]) = months.map(num);
    cur.m.ytd[key] = num(r[13]);
  }
  flush();
  const keep = reps.filter((r) => !isExcluded(r.code));
  const left = reps.filter((r) => isExcluded(r.code));
  if (total && left.length) {
    const t = total as CovMonthly;
    const sub = (a: number[], f: (r: CovRep) => number[]) => a.map((v, i) => r2(v - left.reduce((s2, r) => s2 + (f(r)[i] ?? 0), 0)));
    t.rl = sub(t.rl, (r) => r.rl); t.active = sub(t.active, (r) => r.active); t.calls = sub(t.calls, (r) => r.calls); t.invoices = sub(t.invoices, (r) => r.invoices); t.sales = sub(t.sales, (r) => r.sales);
    t.target = t.target.map((v, i) => (v === null ? null : r2(v - left.reduce((s2, r) => s2 + (r.target[i] ?? 0), 0))));
    t.erc = t.rl.map((rl, i) => (rl ? r2((t.active[i] / rl) * 100) : 0));
    t.productivity = t.calls.map((c, i) => (c ? r2((t.invoices[i] / c) * 100) : 0));
    for (const k of ["rl", "active", "calls", "invoices", "sales", "target"] as const) t.ytd[k] = r2((t.ytd[k] ?? 0) - left.reduce((s2, r) => s2 + (r.ytd[k] ?? 0), 0));
  }
  return { reps: keep, total };
}

// ---------- sales by product and rep ----------
export type SaleLine = { product: string; desc: string; date: string; invoice: string; rep: string; repName: string; custCode: string; customer: string; qtyCS: number; qtyEA: number; gross: number; promoDisc: number; qtyDisc: number; invDisc: number; net: number };
export type ProductSales = { lines: SaleLine[]; fileNet?: number; fileGross?: number; net: number; gross: number };

export function parseProducts(rows: Row[]): ProductSales {
  const lines: SaleLine[] = [];
  let fileNet: number | undefined, fileGross: number | undefined;
  let skippedNet = 0, skippedGross = 0;
  for (const r of rows.slice(1)) {
    if (txt(r[3]) && isExcluded(txt(r[4]))) { skippedNet += num(r[21]); skippedGross += num(r[17]); continue; }
    if (txt(r[3])) {
      lines.push({ product: txt(r[0]), desc: txt(r[1]), date: isoDate(r[2]), invoice: txt(r[3]), rep: txt(r[4]), repName: txt(r[5]), custCode: txt(r[6]), customer: txt(r[7]),
        qtyCS: num(r[8]), qtyEA: num(r[10]), gross: num(r[17]), promoDisc: num(r[18]), qtyDisc: num(r[19]), invDisc: num(r[20]), net: num(r[21]) });
    } else if (!txt(r[0]) && has(r[21])) { fileNet = num(r[21]); fileGross = num(r[17]); } // the unlabelled last row is the grand total
  }
  return { lines, fileNet: fileNet === undefined ? undefined : r2(fileNet - skippedNet), fileGross: fileGross === undefined ? undefined : r2(fileGross - skippedGross), net: r2(lines.reduce((s, l) => s + l.net, 0)), gross: r2(lines.reduce((s, l) => s + l.gross, 0)) };
}

// ---------- net sales by customer ----------
export type CustSales = { code: string; name: string; months: number[]; ytd: number; ytdAms: number; pyAms: number; arBalance: number };
export type CustomerReport = { customers: CustSales[]; fileGrandTotal?: number; fileMonthTotals: number[]; sum: number };

export function parseCustomers(rows: Row[]): CustomerReport {
  const customers: CustSales[] = [];
  let grand: number | undefined; let monthTotals: number[] = [];
  for (const r of rows.slice(1)) {
    const m = /^(MY\d+C\d+)-(.*)$/.exec(txt(r[0]));
    if (m) customers.push({ code: m[1], name: m[2].trim(), months: r.slice(1, 12).map(num), ytd: num(r[12]), ytdAms: num(r[13]), pyAms: num(r[14]), arBalance: num(r[16]) });
    else if (/^grand total$/i.test(txt(r[0]))) { grand = num(r[12]); monthTotals = r.slice(1, 12).map(num); }
  }
  return { customers, fileGrandTotal: grand, fileMonthTotals: monthTotals, sum: r2(customers.reduce((s, c) => s + c.ytd, 0)) };
}

// ---------- checks that the reports agree ----------
export type Check = { ok: boolean; title: string; detail: string };
const rm = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const close = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;

export function crossChecks(d: { aging?: Aging; coverage?: Coverage; products?: ProductSales; customers?: CustomerReport }): Check[] {
  const out: Check[] = [];
  const { aging, coverage, products, customers } = d;
  if (aging) {
    const filed = (aging.fileGrandTotal ?? 0) + aging.fileSideTotals.reduce((s, t) => s + t.total, 0);
    out.push({ ok: close(aging.sum, filed), title: "Aging adds up", detail: `The ${aging.invoices.length.toLocaleString()} open invoices total ${rm(aging.sum)}. The report's own totals (grand total plus ${aging.fileSideTotals.map((t) => t.label).join(", ") || "no separate groups"}) give ${rm(filed)}.` });
  }
  if (products && coverage?.total) {
    const nov = coverage.total.sales[10] ?? 0;
    out.push({ ok: close(products.net, nov), title: "Product sales match November net sales", detail: `Sales by product add up to ${rm(products.net)}. The coverage report shows ${rm(nov)} for November.` });
  }
  if (products && products.fileNet !== undefined) out.push({ ok: close(products.net, products.fileNet), title: "Product report adds up", detail: `The lines add up to ${rm(products.net)}; the report's grand total says ${rm(products.fileNet)}.` });
  if (customers && coverage?.total) {
    const cov = coverage.total.ytd.sales ?? 0;
    out.push({ ok: close(customers.sum, cov), title: "Customer sales match the year to date", detail: `Customers add up to ${rm(customers.sum)} for the year. The coverage report shows ${rm(cov)}.` });
    const bad = coverage.total.sales.map((s, i) => ({ m: i, a: s, b: customers.fileMonthTotals[i] ?? 0 })).filter((x, i) => i < 11 && !close(x.a, x.b, 1));
    out.push({ ok: bad.length === 0, title: "Every month matches between the two sales reports", detail: bad.length === 0 ? "January to November agree." : `${bad.length} month(s) differ: ${bad.map((b) => `month ${b.m + 1}: ${rm(b.a)} vs ${rm(b.b)}`).join("; ")}.` });
  }
  if (aging && customers) {
    const known = new Set(customers.customers.map((c) => c.code));
    const codes = [...new Set(aging.invoices.map((i) => custCodeOf(i.custCode)))];
    const missing = codes.filter((c) => !known.has(c));
    out.push({ ok: missing.length === 0, title: "Every customer in the aging is in the sales report", detail: missing.length === 0 ? `All ${codes.length} customers with open invoices are in the net sales report.` : `${missing.length} of ${codes.length} customers with open invoices are not in the net sales report (they have no sales listed), for example ${missing.slice(0, 3).join(", ")}.` });
    const ar = customers.customers.reduce((s, c) => s + c.arBalance, 0);
    out.push({ ok: close(ar, aging.sum, 1), title: "The A/R Balance column matches the aging", detail: `The "A/R Balance" column in the customer report adds up to ${rm(ar)}, but the aging says ${rm(aging.sum)} is outstanding. Use the aging report for what customers owe.` });
  }
  if (aging && coverage) {
    const reps = new Set(coverage.reps.map((r) => r.code));
    const unknown = [...new Set(aging.invoices.map((i) => i.agent))].filter((a) => !reps.has(agentToSalesman(a)) && !isExcluded(agentToSalesman(a)));
    out.push({ ok: unknown.length === 0, title: "Every agent in the aging is a salesman in the coverage report", detail: unknown.length === 0 ? "All agents match a salesman (salesmen on the never-load list are left out on purpose)." : `Agent(s) ${unknown.join(", ")} in the aging are not salesmen in the coverage report.` });
  }
  return out;
}
