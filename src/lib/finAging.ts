// What customers owe, from the latest aging report. Used by Finance overview and Finance invoices.
// Ages are counted from the date of the report ("as at"), the same way Collection follow-up does.

export type AgingInv = {
  doc: string; docDate: string | null; cust: string; customer: string; agent: string | null; due: string | null; owed: number; asAt: string;
};
export const BUCKET_NAMES = ["Not due", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;

const dayMs = 86400000;
const t = (s: string) => new Date(`${s}T00:00:00Z`).getTime();
/** Days past the due date at the report date. Negative means not due yet. */
export const daysLate = (i: AgingInv) => (i.due ? Math.round((t(i.asAt) - t(i.due)) / dayMs) : 0);
export const bucketOf = (days: number) => (days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4);
/** The aging report writes the salesman as a number ("7"); the app uses MY01S00007. */
export const salesmanCode = (agent: string | null) => (agent && /^\d{1,2}$/.test(agent) ? `MY01S${agent.padStart(5, "0")}` : agent ?? "");

export type Totals = { owed: number; overdue: number; over60: number; buckets: number[]; customers: number; overdueCustomers: number; invoices: number };
export function totalsOf(list: AgingInv[]): Totals {
  const buckets = [0, 0, 0, 0, 0];
  const cust = new Set<string>(), over = new Set<string>();
  let owed = 0;
  for (const i of list) {
    const b = bucketOf(daysLate(i));
    buckets[b] += i.owed; owed += i.owed; cust.add(i.cust);
    if (b > 0) over.add(i.cust);
  }
  const r = (n: number) => Math.round(n * 100) / 100;
  return { owed: r(owed), overdue: r(buckets.slice(1).reduce((a, b) => a + b, 0)), over60: r(buckets[3] + buckets[4]), buckets: buckets.map(r), customers: cust.size, overdueCustomers: over.size, invoices: list.length };
}

/** Totals for each salesman, largest overdue first. */
export function bySalesman(list: AgingInv[]) {
  const m = new Map<string, AgingInv[]>();
  for (const i of list) (m.get(salesmanCode(i.agent)) ?? m.set(salesmanCode(i.agent), []).get(salesmanCode(i.agent))!).push(i);
  return [...m.entries()].map(([code, l]) => ({ code, ...totalsOf(l) })).sort((a, b) => b.overdue - a.overdue);
}
/** Customers with the most overdue, with their oldest invoice. */
export function topOverdue(list: AgingInv[], n = 10) {
  const m = new Map<string, { cust: string; customer: string; agent: string | null; overdue: number; oldest: number; invoices: number }>();
  for (const i of list) {
    const d = daysLate(i);
    if (d <= 0) continue;
    const c = m.get(i.cust) ?? { cust: i.cust, customer: i.customer, agent: i.agent, overdue: 0, oldest: 0, invoices: 0 };
    c.overdue += i.owed; c.invoices++; c.oldest = Math.max(c.oldest, d);
    m.set(i.cust, c);
  }
  return [...m.values()].map((c) => ({ ...c, overdue: Math.round(c.overdue * 100) / 100 })).sort((a, b) => b.overdue - a.overdue).slice(0, n);
}

// ---------- made-up sample for the preview ----------
const AS_AT = "2026-11-20";
const s = (doc: string, docDate: string, cust: string, customer: string, agent: string, due: string, owed: number): AgingInv => ({ doc, docDate, cust, customer, agent, due, owed, asAt: AS_AT });
export const SAMPLE_AGING_INVS: AgingInv[] = [
  s("S900101", "2026-09-02", "SAMPLE-C01", "Sample Mini Market", "7", "2026-10-02", 1280.4),
  s("S900102", "2026-10-20", "SAMPLE-C01", "Sample Mini Market", "7", "2026-11-19", 940.0),
  s("S900103", "2026-11-12", "SAMPLE-C01", "Sample Mini Market", "7", "2026-12-12", 2210.6),
  s("S900104", "2026-07-15", "SAMPLE-C02", "Sample Pharmacy", "4", "2026-08-14", 5310.2),
  s("S900105", "2026-10-01", "SAMPLE-C02", "Sample Pharmacy", "4", "2026-10-31", 760.55),
  s("S900106", "2026-11-05", "SAMPLE-C03", "Sample Cash & Carry Sdn Bhd", "11", "2026-11-04", 18420.0),
  s("S900107", "2026-11-18", "SAMPLE-C03", "Sample Cash & Carry Sdn Bhd", "11", "2026-12-18", 9120.3),
  s("S900108", "2026-08-30", "SAMPLE-C04", "Sample Kedai Runcit", "2", "2026-09-29", 412.9),
  s("S900109", "2026-11-10", "SAMPLE-C04", "Sample Kedai Runcit", "2", "2026-12-10", 655.0),
  s("S900110", "2026-10-10", "SAMPLE-C05", "Sample Trading", "21", "2026-11-09", 3100.75),
  s("S900111", "2026-06-20", "SAMPLE-C06", "Sample Provision Store", "17", "2026-07-20", 2290.0),
  s("S900112", "2026-11-17", "SAMPLE-C07", "Sample Supermart", "5", "2026-12-17", 4980.1),
  s("S900113", "2026-10-25", "SAMPLE-C08", "Sample Hardware & Daily Needs", "3", "2026-11-24", 1175.3),
  s("S900114", "2026-09-18", "SAMPLE-C09", "Sample Sundry Shop", "7", "2026-10-18", 880.0),
];

/** Made-up receipts not yet posted, for the preview (customer code -> receipts). */
export const SAMPLE_UNPOSTED: Record<string, import("./credit").Unposted[]> = {
  "SAMPLE-C02": [{ docNo: "S900104", paid: 5310.2, date: "2026-11-24", receipt: "TOR00-0007" }],
  "SAMPLE-C06": [{ docNo: "S900111", paid: 1000, date: "2026-11-23", receipt: "TOR00-0008" }],
};

/** Extra facts about customers and invoices that the aging report itself does not carry. */
export type AgingExtras = {
  channel: Record<string, string | undefined>;                 // customer code -> sales channel, for example "Supermarket"
  settled: Record<string, { on: string; ref?: string }>;       // invoice -> marked settled by Finance from a collection summary
};
export const isSupermarketChannel = (c?: string | null) => (c ?? "").trim().toLowerCase() === "supermarket";
export const NO_EXTRAS: AgingExtras = { channel: {}, settled: {} };
/** Made-up channels and settlements for the preview. */
export const SAMPLE_EXTRAS: AgingExtras = {
  channel: { "SAMPLE-C03": "Supermarket", "SAMPLE-C07": "Supermarket", "SAMPLE-C02": "Drugstore" },
  settled: { S900106: { on: "2026-11-18", ref: "Collection summary 1-15 Nov" } },
};
