// Made-up sample data for the expense claim screens (stage 1: no database). All people, banks and numbers are fictional.
import { addDays, todayMY } from "@/lib/hr/rules";
import { EMPLOYEES as HR_STAFF, type Employee } from "@/lib/hr/sample";
import { DEFAULT_CLAIM_SETTINGS, mileageAmount, total, claimMonth, r2, type Bank, type Category, type Claim, type ClaimItem, type ClaimSettings, type ClaimStatus, type Step, type TaxCode, type Warning } from "./rules";

export type ClaimRole = "employee" | "manager" | "finance" | "director";
export const TODAY = todayMY();
export const YEAR = Number(TODAY.slice(0, 4));

export const STAFF: Employee[] = [
  ...HR_STAFF,
  { id: "e6", code: "CS006", name: "Wong Kah Seng", position: "Director", dept: "Management", gender: "M", state: "Selangor", joined: "2010-05-03", managerId: null, role: "manager", email: "kahseng@example.com", phone: "012-000 0006", active: true },
];
export const person = (id: string) => STAFF.find((e) => e.id === id)!;
/** Who the sample shows, for each view. Finance is the account clerk; the director gives the last approval. */
export const ME: Record<ClaimRole, string> = { employee: "e2", manager: "e1", finance: "e3", director: "e6" };
export const FINANCE = ["e3"];
export const DIRECTORS = ["e6"];

export const CATEGORIES: Category[] = [
  { code: "MIL", name: "Mileage", perItemLimit: null, monthlyBudget: 3000, receiptRequired: false, mileage: true, active: true },
  { code: "PKT", name: "Parking & toll", perItemLimit: 100, monthlyBudget: 1500, receiptRequired: true, mileage: false, active: true },
  { code: "MEL", name: "Meals & entertainment", perItemLimit: 200, monthlyBudget: 3000, receiptRequired: true, mileage: false, active: true },
  { code: "ACC", name: "Accommodation", perItemLimit: 350, monthlyBudget: 4000, receiptRequired: true, mileage: false, active: true },
  { code: "PHN", name: "Phone & internet", perItemLimit: 150, monthlyBudget: 1000, receiptRequired: true, mileage: false, active: true },
  { code: "OFF", name: "Office supplies", perItemLimit: 300, monthlyBudget: 1500, receiptRequired: true, mileage: false, active: true },
  { code: "TRN", name: "Training & courses", perItemLimit: 1500, monthlyBudget: 5000, receiptRequired: true, mileage: false, active: true },
  { code: "MED", name: "Medical (outpatient)", perItemLimit: 150, monthlyBudget: 2000, receiptRequired: true, mileage: false, active: true },
  { code: "OTH", name: "Others", perItemLimit: 200, monthlyBudget: 1000, receiptRequired: true, mileage: false, active: true },
];
export const catName = (code: string) => CATEGORIES.find((c) => c.code === code)?.name ?? code;

export const BANKS: Bank[] = [
  { empId: "e1", bank: "Maybank", accountName: "AHMAD FAIZAL BIN RAHMAN", accountNo: "1140 0000 1111" },
  { empId: "e2", bank: "CIMB Bank", accountName: "NURUL AISYAH BINTI HASSAN", accountNo: "8000 0000 2222" },
  { empId: "e3", bank: "Public Bank", accountName: "TAN MEI LING", accountNo: "3100 0000 3333" },
  { empId: "e4", bank: "RHB Bank", accountName: "RAJESH A/L SUBRAMANIAM", accountNo: "2120 0000 4444" },
  { empId: "e5", bank: "Hong Leong Bank", accountName: "LIM WEI JIE", accountNo: "0450 0000 5555" },
];
export const SETTINGS: ClaimSettings = DEFAULT_CLAIM_SETTINGS;

// ---------- sample claims over the last six months ----------
const monthStart = (back: number) => { const d = new Date(`${TODAY.slice(0, 7)}-01T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() - back); return d.toISOString().slice(0, 10); };
let seq = 0;
const it = (date: string, cat: string, desc: string, amount: number, tax: TaxCode = "none", receipt = true): ClaimItem => ({ id: `i${++seq}`, date, cat, desc, amount, tax, receipt: receipt ? `receipt-${seq}.jpg` : undefined });
const mil = (date: string, from: string, to: string, km: number): ClaimItem => ({ id: `i${++seq}`, date, cat: "MIL", desc: `${from} – ${to}`, amount: mileageAmount(km, SETTINGS.mileageRate), tax: "none", from, to, km });
const by = (id: string) => ({ by: id, byName: person(id).name });

/** Build a claim's history for the status it has reached. */
function steps(empId: string, sent: string, status: ClaimStatus, note?: string): Step[] {
  const s: Step[] = [{ at: sent, ...by(empId), action: "Submitted" }];
  if (status === "Draft" || status === "Pending manager") return status === "Draft" ? [] : s;
  const mgr = person(empId).managerId;
  const order: [1 | 2 | 3, string][] = [...(mgr && mgr !== "e6" ? [[1, mgr] as [1, string]] : []), [2, "e3"], [3, "e6"]];
  const stop = { "Pending finance": 1, "Pending director": 2, Approved: 3, Processing: 3, Paid: 3, Rejected: 1 }[status as string] ?? 3;
  let day = 1;
  for (const [lvl, who] of order) {
    if (lvl > stop) break;
    const rejectHere = status === "Rejected" && lvl === stop;
    s.push({ at: addDays(sent, day++), ...by(who), action: rejectHere ? "Rejected" : "Approved", level: lvl, note: rejectHere ? note : undefined });
    if (rejectHere) break;
  }
  if (status === "Processing" || status === "Paid") s.push({ at: addDays(sent, day++), ...by("e3"), action: "Processing", note: "In this month's payment run" });
  if (status === "Paid") s.push({ at: addDays(sent, day++), ...by("e3"), action: "Paid", note: "Transfer done" });
  return s;
}
const claim = (n: number, empId: string, title: string, status: ClaimStatus, items: ClaimItem[], note?: string): Claim => {
  const first = items.map((i) => i.date).sort()[0];
  const sent = addDays(items.map((i) => i.date).sort().slice(-1)[0], 2);
  return {
    id: `c${n}`, no: `EC-${YEAR}-${String(n).padStart(4, "0")}`, empId, title, status, items, createdAt: first,
    submittedAt: status === "Draft" ? undefined : sent, steps: steps(empId, sent, status, note),
    payment: status === "Paid" ? { ref: `IBG${String(880000 + n)}`, paidAt: addDays(sent, 5), method: "Bank transfer" } : status === "Processing" ? { ref: "", method: "Bank transfer" } : undefined,
  };
};

const m = (back: number, day: number) => addDays(monthStart(back), day - 1);
export const CLAIMS: Claim[] = [
  // five months ago to last month: paid
  claim(1, "e1", "Customer visits, Klang Valley", "Paid", [mil(m(5, 4), "Office", "Shah Alam", 42), mil(m(5, 9), "Office", "Klang", 58), it(m(5, 9), "PKT", "Parking Klang", 12)]),
  claim(2, "e2", "Stationery for admin", "Paid", [it(m(5, 15), "OFF", "Printer toner", 189, "SL10")]),
  claim(3, "e4", "Warehouse tools", "Paid", [it(m(4, 6), "OFF", "Pallet labels & tape", 96.5, "SL10")]),
  claim(4, "e1", "Supplier lunch", "Paid", [it(m(4, 12), "MEL", "Lunch with supplier, 4 pax", 236.8, "SV8")]),
  claim(5, "e5", "HR training", "Paid", [it(m(4, 20), "TRN", "Employment Act 2022 workshop", 850, "SV8")]),
  claim(6, "e3", "Phone bill", "Paid", [it(m(3, 3), "PHN", "Mobile plan (work share)", 88, "SV6")]),
  claim(7, "e1", "Penang trip", "Paid", [mil(m(3, 10), "Office", "Penang", 360), it(m(3, 10), "PKT", "Toll PLUS", 74.3), it(m(3, 11), "ACC", "Hotel 1 night", 268, "SV8"), it(m(3, 11), "MEL", "Dinner", 62, "SV6")]),
  claim(8, "e2", "Clinic visit", "Paid", [it(m(2, 8), "MED", "Panel clinic, fever", 65)]),
  claim(9, "e4", "Stock-take overtime meal", "Paid", [it(m(2, 14), "MEL", "Team dinner, 6 pax", 182, "SV6")]),
  claim(10, "e5", "Recruitment ads", "Rejected", [it(m(2, 18), "OFF", "Job board posting", 420)], "Job ads go on the company card, not a personal claim."),
  claim(11, "e1", "Customer visits, Seremban", "Paid", [mil(m(1, 5), "Office", "Seremban", 140), it(m(1, 5), "PKT", "Toll", 18.6), it(m(1, 5), "MEL", "Lunch with customer", 214, "SV8")]),
  claim(12, "e2", "Courier and supplies", "Paid", [it(m(1, 12), "OFF", "Courier charges", 46, "SV8"), it(m(1, 12), "OFF", "Folders", 38.9, "SL10")]),
  claim(13, "e3", "Accounting seminar", "Paid", [it(m(1, 19), "TRN", "SST update seminar", 380, "SV8")]),
  claim(14, "e6", "Distributor dinner", "Paid", [it(m(1, 22), "MEL", "Dinner with Colgate team, 8 pax", 980, "SV8")]),
  // this month: at every stage
  claim(15, "e1", "Johor trip", "Processing", [mil(m(0, 3), "Office", "Johor Bahru", 330), it(m(0, 3), "PKT", "Toll PLUS", 68.4), it(m(0, 4), "ACC", "Hotel 1 night", 289, "SV8")]),
  claim(16, "e4", "Warehouse safety items", "Approved", [it(m(0, 5), "OFF", "Safety gloves & vests", 156, "SL10")]),
  claim(17, "e3", "Phone bill", "Pending director", [it(m(0, 3), "PHN", "Mobile plan (work share)", 88, "SV6")]),
  claim(18, "e1", "Customer visits", "Pending finance", [mil(m(0, 9), "Office", "Rawang", 38), mil(m(0, 10), "Office", "Kajang", 44), it(m(0, 10), "MEL", "Customer lunch", 238, "SV8")]),
  claim(19, "e2", "Training course", "Pending manager", [it(m(0, 11), "TRN", "Excel advanced (1 day)", 450, "SV8"), mil(m(0, 11), "Office", "Petaling Jaya", 22)]),
  claim(20, "e4", "Parking and lunch", "Pending manager", [it(m(0, 12), "PKT", "Parking at port", 15), it(m(0, 12), "MEL", "Lunch at port", 23, "none", false)]),
  claim(21, "e2", "Medical", "Draft", [it(m(0, 14), "MED", "Dental scaling", 180)]),
];

// ---------- checks: they warn, they never block ----------
/** Total claimed by a person in a month, counting everything sent (not drafts or rejected). */
export function monthClaimed(claims: Claim[], empId: string, month: string, exceptId?: string) {
  return r2(claims.filter((c) => c.empId === empId && c.id !== exceptId && !["Draft", "Rejected"].includes(c.status) && claimMonth(c) === month).reduce((s, c) => s + total(c), 0));
}
/** Everyone's spending in a category in a month, against that category's budget. */
export function categorySpent(claims: Claim[], cat: string, month: string, exceptId?: string) {
  return r2(claims.filter((c) => c.id !== exceptId && !["Draft", "Rejected"].includes(c.status)).flatMap((c) => c.items).filter((i) => i.cat === cat && i.date.startsWith(month)).reduce((s, i) => s + i.amount, 0));
}
export function checkClaim(c: Claim, claims: Claim[], cats: Category[] = CATEGORIES, settings: ClaimSettings = SETTINGS): Warning[] {
  const w: Warning[] = [];
  for (const i of c.items) {
    const cat = cats.find((x) => x.code === i.cat);
    if (!cat) continue;
    if (cat.perItemLimit !== null && i.amount > cat.perItemLimit) w.push({ itemId: i.id, text: `${cat.name}: RM ${i.amount.toFixed(2)} is over the RM ${cat.perItemLimit} limit for one item.` });
    if (cat.receiptRequired && !i.receipt) w.push({ itemId: i.id, text: `${cat.name}: no receipt attached.` });
    if (i.date > TODAY) w.push({ itemId: i.id, text: `${i.desc || cat.name}: the date is in the future.` });
  }
  const month = claimMonth(c);
  for (const code of [...new Set(c.items.map((i) => i.cat))]) {
    const cat = cats.find((x) => x.code === code);
    if (!cat?.monthlyBudget) continue;
    const mine = c.items.filter((i) => i.cat === code && i.date.startsWith(month)).reduce((s, i) => s + i.amount, 0);
    const after = categorySpent(claims, code, month, c.id) + mine;
    if (after > cat.monthlyBudget) w.push({ text: `${cat.name}: company budget for the month is RM ${cat.monthlyBudget.toLocaleString()}; this claim brings it to RM ${after.toFixed(2)}.` });
  }
  const mineMonth = monthClaimed(claims, c.empId, month, c.id) + total(c);
  if (mineMonth > settings.monthlyLimit) w.push({ text: `Monthly limit: RM ${mineMonth.toFixed(2)} claimed for ${month}, over the RM ${settings.monthlyLimit.toLocaleString()} limit.` });
  return w;
}

/** Whose turn it is to approve, given the claim's status. */
export function waitingFor(c: Claim): { level: 1 | 2 | 3; who: string[] } | null {
  if (c.status === "Pending manager") return { level: 1, who: [person(c.empId).managerId!].filter(Boolean) };
  if (c.status === "Pending finance") return { level: 2, who: FINANCE };
  if (c.status === "Pending director") return { level: 3, who: DIRECTORS };
  return null;
}
export const bankOf = (empId: string) => BANKS.find((b) => b.empId === empId);
