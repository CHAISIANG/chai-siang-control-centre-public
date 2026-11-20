import type { FormKey } from "./paf";

// Shapes used by the pages. Real rows come from Supabase (salesmen, monthly sales and coverage, customers, open invoices, claims, lorries).
// Anything the database does not have yet (credit limits, collection, deliveries) is sample data
// generated here with a seeded random generator, so it looks the same on every load.

function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const r = rng(2026);
const between = (min: number, max: number) => min + r() * (max - min);

export const TODAY = "13 Nov 2026";
export const DAYS_ELAPSED = 13;
export const DAYS_IN_MONTH = 30;
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
/** Jan–Oct come from the database (DA1). Nov is month-to-date and still sample. */
export const NOV = 10;

/** target is November pro-rated to the days so far (the dashboard compares against it); monthTarget is the whole month, as in the coverage file. */
export type MonthStat = { rl: number; active: number; erc: number; target: number; monthTarget: number; sales: number; collected: number };
export type Salesman = { code: string; name: string; area: string; stats: MonthStat[] };

export type SalesmanRow = { code: string; name: string; area: string | null };
export type MonthlyRow = { salesman_code: string; month: number; rl_acct: number | null; active_acct: number | null; erc: number | null; sales_target: number | null; net_sales: number | null };

export function buildSalesmen(rows: SalesmanRow[], monthly: MonthlyRow[], day: number = DAYS_ELAPSED): Salesman[] {
  return rows.map((s) => {
    const rnd = rng(hash(s.code));
    const mine = new Map(monthly.filter((m) => m.salesman_code === s.code).map((m) => [m.month, m]));
    const prorate = day / DAYS_IN_MONTH;
    const stats: MonthStat[] = MONTHS.map((_, i) => {
      const m = mine.get(i + 1);
      const oct = mine.get(10);
      if (i < NOV || m) {
        // A real month. November is month to date, so its target is the month's target pro-rated to the days so far
        // (October's target stands in when November has none).
        const sales = Number(m?.net_sales ?? 0);
        let target = Number(m?.sales_target ?? 0);
        const monthTarget = i === NOV ? Math.round(target || Number(oct?.sales_target ?? 0)) : target;
        if (i === NOV) target = Math.round(monthTarget * prorate);
        return { rl: m?.rl_acct ?? 0, active: m?.active_acct ?? 0, erc: Number(m?.erc ?? 0), target, monthTarget, sales, collected: 0 };
      }
      const sales = Math.round(Number(oct?.net_sales ?? 0) * prorate * (0.8 + rnd() * 0.4));
      const rl = oct?.rl_acct ?? 0;
      const active = Math.round((oct?.active_acct ?? 0) * (0.55 + rnd() * 0.3));
      return { rl, active, erc: rl ? Math.round((active / rl) * 10000) / 100 : 0, target: Math.round(Number(oct?.sales_target ?? 0) * prorate), monthTarget: Math.round(Number(oct?.sales_target ?? 0)), sales, collected: 0 };
    });
    return { code: s.code, name: s.name, area: s.area ?? "", stats };
  });
}

export const sumStats = (list: Salesman[], mi: number): MonthStat => {
  const t = list.reduce((a, s) => ({ rl: a.rl + s.stats[mi].rl, active: a.active + s.stats[mi].active, erc: 0, target: a.target + s.stats[mi].target, monthTarget: a.monthTarget + s.stats[mi].monthTarget, sales: a.sales + s.stats[mi].sales, collected: a.collected + s.stats[mi].collected }), { rl: 0, active: 0, erc: 0, target: 0, monthTarget: 0, sales: 0, collected: 0 });
  t.erc = t.rl ? Math.round((t.active / t.rl) * 1000) / 10 : 0;
  return t;
};

export type DailyRow = { sale_date: string; net: number | string; invoices: number | string };
/** Daily November chart from the invoice lines. The target line is the target to date spread evenly over the days so far. */
export function buildDaily(rows: DailyRow[], targetToDate: number, day: number) {
  const per = day ? targetToDate / day : 0;
  return rows.map((r) => ({ day: `${Number(r.sale_date.slice(8, 10))} Nov`, sales: Math.round(Number(r.net)), target: Math.round(per) }));
}

export const buckets = ["Current", "1–30", "31–60", "61–90", "90+"] as const;

export type Customer = {
  code: string;
  name: string;
  channel: string;
  route: string;
  visit: string;
  salesman: string; // code
  paymentTerm: string;
  creditLimit: number; // 0 = not known: credit limits are not in the reports yet
  outstanding: number;
  aging: number[]; // by bucket, from the aging report
  lastInvoice: string;
  ytdSales: number; // net sales this year (customer report)
  ytdAms: number; // monthly average this year
  pyAms: number; // monthly average last year
};

export type CustomerRow = { code: string; name: string; channel: string | null; route_name: string | null; visit_day: string | null; payment_term: string | null; salesman_code: string | null };
export type ArRow = { cust_code: string; customer: string; agent: string | null; total: number | string; b_current: number | string; b_30: number | string; b_60: number | string; b_90: number | string; b_over90: number | string };
export type CustSalesRow = { code: string; ytd: number | string; ytd_ams: number | string; py_ams: number | string };

/** The aging report prints customer 123; the customer list calls it MY01C00123. */
export const custCodeOf = (code: string) => (/^\d+$/.test(code) ? `MY01C${code.padStart(5, "0")}` : code);
const agentCode = (a: string | null) => (a && /^\d{1,2}$/.test(a) ? `MY01S${a.padStart(5, "0")}` : "");

const cleanTerm = (t: string | null) => (t === "PT00" ? "Cash" : (t ?? "").replace(" Due n", "").replace("within ", "≤ "));
export function buildCustomers(rows: CustomerRow[], ar: ArRow[] = [], sales: CustSalesRow[] = []): Customer[] {
  const owed = new Map(ar.map((a) => [custCodeOf(a.cust_code), a]));
  const sold = new Map(sales.map((x) => [x.code, x]));
  const known = new Set(rows.map((c) => c.code));
  // A customer that owes money but is missing from the customer list still has to be shown.
  const extra: CustomerRow[] = ar.filter((a) => !known.has(custCodeOf(a.cust_code))).map((a) => ({ code: custCodeOf(a.cust_code), name: a.customer, channel: null, route_name: null, visit_day: null, payment_term: null, salesman_code: agentCode(a.agent) || null }));
  return [...rows, ...extra].map((c) => {
    const a = owed.get(c.code);
    const x = sold.get(c.code);
    return {
      code: c.code, name: c.name, channel: c.channel ?? "", route: (c.route_name ?? "").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()), visit: c.visit_day ?? "",
      salesman: c.salesman_code ?? "", paymentTerm: cleanTerm(c.payment_term),
      creditLimit: 0, outstanding: a ? Number(a.total) : 0,
      aging: a ? [Number(a.b_current), Number(a.b_30), Number(a.b_60), Number(a.b_90), Number(a.b_over90)] : [0, 0, 0, 0, 0],
      lastInvoice: "", ytdSales: x ? Number(x.ytd) : 0, ytdAms: x ? Number(x.ytd_ams) : 0, pyAms: x ? Number(x.py_ams) : 0,
    };
  });
}

export const newCustomerSources = [
  { source: "Salesman canvassing", value: 14 },
  { source: "Referral", value: 8 },
  { source: "Walk-in / phone", value: 5 },
  { source: "Principal lead", value: 4 },
  { source: "Social media", value: 3 },
];

// ---- Logistics (today, sample) ----
export type Driver = {
  name: string;
  lorry: string;
  route: string;
  total: number;
  delivered: number;
  failed: number;
};
const driverSeed: [string, string, string, number][] = [
  ["Driver A", "SMP 1001", "Rawang – Kuang", 34],
  ["Driver B", "SMP 1002", "Batang Kali – KKB", 28],
  ["Driver C", "SMP 1003", "Selayang – Gombak", 41],
  ["Driver D", "SMP 1004", "Kajang – Semenyih", 31],
  ["Driver E", "SMP 1005", "Puchong – Klang", 37],
  ["Driver F", "SMP 1006", "Shah Alam – Subang", 26],
];
export const drivers: Driver[] = driverSeed.map(([name, lorry, route, total]) => {
  const delivered = Math.round(total * between(0.45, 0.95));
  const failed = r() > 0.6 ? Math.floor(between(1, 3)) : 0;
  return { name, lorry, route, total, delivered, failed };
});

export type Stage = { stage: string; count: number };
export const pipeline: Stage[] = [
  { stage: "Sales order received", count: 238 },
  { stage: "Invoiced", count: 227 },
  { stage: "Picked & packed", count: 214 },
  { stage: "Loaded on lorry", count: 197 },
  { stage: "Delivered", count: drivers.reduce((s, d) => s + d.delivered, 0) },
];

const pendingSeed: [string, number, string, string, string][] = [
  ["900S158492", 23, "Driver C", "Out for delivery", "Today"],
  ["900S158487", 46, "Driver A", "Out for delivery", "Today"],
  ["900S158201", 69, "Driver B", "Customer closed – reschedule", "1 day"],
  ["900S158044", 92, "Driver E", "Out for delivery", "Today"],
  ["900S157790", 115, "Driver D", "Short stock – partial", "2 days"],
  ["900S157733", 138, "Driver F", "Waiting to load", "Today"],
  ["900S157702", 161, "Driver A", "Customer closed – reschedule", "1 day"],
  ["900S157688", 184, "Driver C", "Waiting to load", "Today"],
];
export const getPendingInvoices = (customers: Customer[]) =>
  pendingSeed.map(([inv, i, driver, status, age]) => ({ inv, customer: customers.length ? customers[i % customers.length].name : "—", driver, status, age }));

// ---- Claims (PAF) ----
export type ClaimStatus = "Draft" | "Pending supervisor" | "Pending Colgate" | "Approved by Colgate" | "Paid" | "Returned";
export type Claim = {
  id: string;
  formKey: FormKey;
  customer: string;
  customerCode: string | null;
  salesman: string; // name
  salesmanCode: string | null;
  amount: number;
  status: ClaimStatus;
  submitted: string;
  attachments: number;
  remark: string;
  /** who gave the Colgate approval, and when (yyyy-mm-dd) */
  principalName: string;
  principalOn: string;
  values: Record<string, string>;
};

// ---- Upload centre ----
export const uploads = [
  { name: "Coverage & Net Sales (DA1)", source: "SQL finance", last: "13 Nov 08:12", rows: 1240, status: "OK" },
  { name: "Customer Master", source: "SAP", last: "10 Nov 17:40", rows: 910, status: "OK" },
  { name: "Promotional Discount", source: "SAP", last: "13 Nov 08:15", rows: 130, status: "OK" },
  { name: "Customer Aging & Credit Limit", source: "SQL finance", last: "13 Nov 08:20", rows: 910, status: "OK" },
  { name: "Collection", source: "SQL finance", last: "12 Nov 18:05", rows: 312, status: "Late" },
  { name: "Delivery / Invoice Status", source: "Thunder POS", last: "—", rows: 0, status: "Missing" },
];

export const fmt = (n: number) => n.toLocaleString("en-MY");
export const rm = (n: number) => "RM " + n.toLocaleString("en-MY", { maximumFractionDigits: 0 });
export const rmK = (n: number) =>
  n >= 1_000_000 ? `RM ${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `RM ${(n / 1000).toFixed(0)}K` : `RM ${n}`;
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// ---- Lorry status ----
export const LORRY_STATUSES = ["On duty", "Loading", "Empty"] as const;
export type LorryStatus = (typeof LORRY_STATUSES)[number];
export type Lorry = { lorryNo: string; driver: string; route: string; status: LorryStatus; invoices: number; loadPct: number };
