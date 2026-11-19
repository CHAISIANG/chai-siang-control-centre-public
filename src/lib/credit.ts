// Credit check on SAP invoices: before an invoice goes into the import file, look at the customer's aging.
// Only for invoices of salesmen 04, 11, 17, 21 and 22. A customer with any amount past due needs Finance or
// Management approval first; supermarkets are never held, their sales rep is reminded instead.

export const CHECKED_SALESMEN = ["MY01S00004", "MY01S00011", "MY01S00017", "MY01S00021", "MY01S00022"];
/** The aging report keeps the salesman as a short number ("4"); SAP gives the full code. */
export const agentToCode = (agent: string | number | null | undefined) => (agent == null || agent === "" ? "" : `MY01S${String(agent).padStart(5, "0")}`);
export const isSupermarket = (channel: string | null | undefined) => (channel ?? "").trim().toLowerCase() === "supermarket";

/** What the aging report says about one customer. */
export type CustomerAging = {
  code: string; name: string; channel: string | null;
  owed: number;          // everything outstanding
  overdue: number;       // past its due date
  oldestDays: number;    // days the oldest unpaid invoice is past due (0 if none)
  buckets: number[];     // [not due, 1-30, 31-60, 61-90, over 90]
  asAt: string | null;   // date of the aging report
};

export type CreditCase = {
  docNo: string; customer: string; customerName: string; salesRep: string; amount: number;
  kind: "approval" | "reminder";
  aging: CustomerAging;
};
export type ApprovalStatus = "Waiting" | "Approved" | "Rejected";
export type CreditApproval = {
  id: string; docNo: string; customer: string; customerName: string; salesRep: string; amount: number;
  overdue: number; oldestDays: number; buckets: number[]; asAt: string | null; file: string;
  status: ApprovalStatus; askedBy: string; askedAt: string; note?: string; decidedBy?: string; decidedAt?: string; decisionNote?: string;
};
export type CreditReminder = { id: string; salesRep: string; customer: string; customerName: string; docNo: string; amount: number; overdue: number; oldestDays: number; at: string; seen: boolean };

/** Which invoices in an upload need approval or a reminder. One entry per invoice. */
export function creditCases(docs: { docNo: string; customer: string; customerName: string; salesRep: string; amount: number }[], aging: Map<string, CustomerAging>): CreditCase[] {
  const out: CreditCase[] = [];
  for (const d of docs) {
    if (!CHECKED_SALESMEN.includes(d.salesRep)) continue;
    const a = aging.get(d.customer);
    if (!a || a.overdue <= 0) continue;
    out.push({ ...d, kind: isSupermarket(a.channel) ? "reminder" : "approval", aging: a });
  }
  return out;
}

const rmShort = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const overdueText = (a: { overdue: number; oldestDays: number }) => `${rmShort(a.overdue)} overdue, oldest ${a.oldestDays} ${a.oldestDays === 1 ? "day" : "days"} late`;
export const BUCKETS = ["Not due", "1–30", "31–60", "61–90", "90+"];

// ---------- sample data (made up) ----------
export const SAMPLE_AGING: CustomerAging[] = [
  { code: "SAMPLE-C02", name: "Sample Pharmacy", channel: "Drugstore", owed: 6420.5, overdue: 2180.5, oldestDays: 47, buckets: [4240, 1300.5, 880, 0, 0], asAt: "2026-11-13" },
  { code: "SAMPLE-C03", name: "Sample Cash & Carry Sdn Bhd", channel: "Supermarket", owed: 18950, overdue: 3120, oldestDays: 22, buckets: [15830, 3120, 0, 0, 0], asAt: "2026-11-13" },
  { code: "SAMPLE-C01", name: "Sample Mini Market", channel: "Superette/Mini-Marke", owed: 980, overdue: 0, oldestDays: 0, buckets: [980, 0, 0, 0, 0], asAt: "2026-11-13" },
];
export const SAMPLE_APPROVALS: CreditApproval[] = [
  { id: "a1", docNo: "900S000088", customer: "SAMPLE-C09", customerName: "Sample Kedai Runcit", salesRep: "MY01S00011", amount: 842.6, overdue: 5310.2, oldestDays: 96, buckets: [1200, 0, 1450, 2100, 1760.2], asAt: "2026-11-13", file: "Sample earlier file.xlsx", status: "Waiting", askedBy: "Finance clerk (sample)", askedAt: "2026-11-18", note: "Customer says payment next week" },
  { id: "a2", docNo: "900S000079", customer: "SAMPLE-C11", customerName: "Sample Wholesale Trading", salesRep: "MY01S00021", amount: 4120, overdue: 960, oldestDays: 12, buckets: [8800, 960, 0, 0, 0], asAt: "2026-11-13", file: "Sample earlier file.xlsx", status: "Approved", askedBy: "Finance clerk (sample)", askedAt: "2026-11-17", decidedBy: "Finance manager (sample)", decidedAt: "2026-11-17", decisionNote: "Cheque received, clearing tomorrow" },
];
export const SAMPLE_REMINDERS: CreditReminder[] = [
  { id: "m1", salesRep: "MY01S00004", customer: "SAMPLE-C03", customerName: "Sample Cash & Carry Sdn Bhd", docNo: "900S000077", amount: 1890, overdue: 3120, oldestDays: 22, at: "2026-11-17", seen: false },
];
