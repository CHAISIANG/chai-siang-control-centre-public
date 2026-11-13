import type { FormKey } from "./paf";

// Shapes used by the pages. Real rows come from Supabase (salesmen, DA1 monthly figures, customers, claims, lorries).
// Anything the database does not have yet (aging, credit limits, collection, deliveries, November) is sample data
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

export type MonthStat = { rl: number; active: number; erc: number; target: number; sales: number; collected: number };
export type Salesman = { code: string; name: string; area: string; stats: MonthStat[] };

export type SalesmanRow = { code: string; name: string; area: string | null };
export type MonthlyRow = { salesman_code: string; month: number; rl_acct: number | null; active_acct: number | null; erc: number | null; sales_target: number | null; net_sales: number | null };

export function buildSalesmen(rows: SalesmanRow[], monthly: MonthlyRow[]): Salesman[] {
  return rows.map((s) => {
    const rnd = rng(hash(s.code));
    const mine = new Map(monthly.filter((m) => m.salesman_code === s.code).map((m) => [m.month, m]));
    const stats: MonthStat[] = MONTHS.map((_, i) => {
      if (i < NOV) {
        const m = mine.get(i + 1);
        const sales = Number(m?.net_sales ?? 0);
        return { rl: m?.rl_acct ?? 0, active: m?.active_acct ?? 0, erc: Number(m?.erc ?? 0), target: Number(m?.sales_target ?? 0), sales, collected: Math.round(sales * (0.7 + rnd() * 0.27)) };
      }
      const oct = mine.get(10);
      const prorate = DAYS_ELAPSED / DAYS_IN_MONTH;
      const sales = Math.round(Number(oct?.net_sales ?? 0) * prorate * (0.8 + rnd() * 0.4));
      const rl = oct?.rl_acct ?? 0;
      const active = Math.round((oct?.active_acct ?? 0) * (0.55 + rnd() * 0.3));
      return { rl, active, erc: rl ? Math.round((active / rl) * 10000) / 100 : 0, target: Math.round(Number(oct?.sales_target ?? 0) * prorate), sales, collected: Math.round(sales * (0.6 + rnd() * 0.3)) };
    });
    return { code: s.code, name: s.name, area: s.area ?? "", stats };
  });
}

export const sumStats = (list: Salesman[], mi: number): MonthStat => {
  const t = list.reduce((a, s) => ({ rl: a.rl + s.stats[mi].rl, active: a.active + s.stats[mi].active, erc: 0, target: a.target + s.stats[mi].target, sales: a.sales + s.stats[mi].sales, collected: a.collected + s.stats[mi].collected }), { rl: 0, active: 0, erc: 0, target: 0, sales: 0, collected: 0 });
  t.erc = t.rl ? Math.round((t.active / t.rl) * 1000) / 10 : 0;
  return t;
};

/** Daily November chart (sample): spreads the month-to-date total across the days so far. */
export function buildDailySales(nov: MonthStat) {
  const rnd = rng(77);
  const weights = Array.from({ length: DAYS_ELAPSED }, (_, i) => ([7, 8].includes(i + 1) ? 0.25 : 0.8 + rnd() * 0.5));
  const wsum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w, i) => ({ day: `${i + 1} Nov`, sales: Math.round((w / wsum) * nov.sales), target: Math.round((nov.target / wsum) * ([7, 8].includes(i + 1) ? 0.25 : 1)) }));
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
  creditLimit: number; // sample
  outstanding: number; // sample
  aging: number[]; // sample, by bucket
  lastInvoice: string; // sample
};

export type CustomerRow = { code: string; name: string; channel: string | null; route_name: string | null; visit_day: string | null; payment_term: string | null; salesman_code: string | null };

const cleanTerm = (t: string | null) => (t === "PT00" ? "Cash" : (t ?? "").replace(" Due n", "").replace("within ", "≤ "));
export function buildCustomers(rows: CustomerRow[]): Customer[] {
  return rows.map((c) => {
    const rnd = rng(hash(c.code));
    const creditLimit = [5000, 10000, 20000, 30000, 50000, 80000][Math.floor(rnd() * 6)];
    const outstanding = Math.round(creditLimit * (0.1 + rnd() * 1.02));
    const weights = [0.2 + rnd() * 0.5, 0.1 + rnd() * 0.3, rnd() * 0.3, rnd() * 0.2, rnd() > 0.7 ? rnd() * 0.25 : 0];
    const wsum = weights.reduce((a, b) => a + b, 0);
    return {
      code: c.code, name: c.name, channel: c.channel ?? "", route: (c.route_name ?? "").toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase()), visit: c.visit_day ?? "",
      salesman: c.salesman_code ?? "", paymentTerm: cleanTerm(c.payment_term),
      creditLimit, outstanding, aging: weights.map((w) => Math.round((w / wsum) * outstanding)),
      lastInvoice: `${Math.floor(1 + rnd() * 12)} Nov 2026`,
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
  ["Ramlee", "WXY 1288", "Rawang – Kuang", 34],
  ["Kumar", "VCD 4471", "Batang Kali – KKB", 28],
  ["Ah Chong", "BKP 902", "Selayang – Gombak", 41],
  ["Zulkifli", "WB 7710", "Kajang – Semenyih", 31],
  ["Hafiz", "PQR 3365", "Puchong – Klang", 37],
  ["Lim Wei", "JKL 218", "Shah Alam – Subang", 26],
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
  ["101S158492", 23, "Ah Chong", "Out for delivery", "Today"],
  ["101S158487", 46, "Ramlee", "Out for delivery", "Today"],
  ["101S158201", 69, "Kumar", "Customer closed – reschedule", "1 day"],
  ["101S158044", 92, "Hafiz", "Out for delivery", "Today"],
  ["101S157790", 115, "Zulkifli", "Short stock – partial", "2 days"],
  ["101S157733", 138, "Lim Wei", "Waiting to load", "Today"],
  ["101S157702", 161, "Ramlee", "Customer closed – reschedule", "1 day"],
  ["101S157688", 184, "Ah Chong", "Waiting to load", "Today"],
];
export const getPendingInvoices = (customers: Customer[]) =>
  pendingSeed.map(([inv, i, driver, status, age]) => ({ inv, customer: customers.length ? customers[i % customers.length].name : "—", driver, status, age }));

// ---- Claims (PAF) ----
export type ClaimStatus = "Draft" | "Pending supervisor" | "Approved" | "Sent to principal" | "Paid" | "Rejected";
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
