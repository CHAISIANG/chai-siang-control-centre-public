// Expense claims: types and the rules every screen uses. Amounts are ringgit; dates are YYYY-MM-DD (Malaysia time).

export type TaxCode = "none" | "SV8" | "SV6" | "SL10" | "SL5";
export const TAXES: { code: TaxCode; label: string; rate: number; kind: "service" | "sales" | "none" }[] = [
  { code: "none", label: "No SST", rate: 0, kind: "none" },
  { code: "SV8", label: "Service tax 8%", rate: 8, kind: "service" },
  { code: "SV6", label: "Service tax 6%", rate: 6, kind: "service" },
  { code: "SL10", label: "Sales tax 10%", rate: 10, kind: "sales" },
  { code: "SL5", label: "Sales tax 5%", rate: 5, kind: "sales" },
];

export type Category = { code: string; name: string; perItemLimit: number | null; monthlyBudget: number | null; receiptRequired: boolean; mileage: boolean; active: boolean };

export type ClaimItem = {
  id: string; date: string; cat: string; desc: string;
  amount: number;              // what was paid, SST included (for mileage: km x rate)
  tax: TaxCode;
  receipt?: string;            // file name or storage path
  from?: string; to?: string; km?: number; // mileage only
  file?: File;                 // a receipt picked on this screen, not uploaded yet
};

export type ClaimStatus = "Draft" | "Pending manager" | "Pending finance" | "Pending director" | "Approved" | "Processing" | "Paid" | "Rejected";
export type Step = { at: string; by: string; byName: string; action: "Submitted" | "Approved" | "Rejected" | "Processing" | "Paid" | "Resubmitted"; level?: 1 | 2 | 3; note?: string };
export type Claim = {
  id: string; no: string; empId: string; title: string; status: ClaimStatus;
  items: ClaimItem[]; steps: Step[]; createdAt: string; submittedAt?: string;
  route?: (1 | 2 | 3)[];       // the approval steps, fixed when sent
  payment?: { ref: string; paidAt?: string; method: "Bank transfer" | "Cash" | "Cheque" };
};
export type Bank = { empId: string; bank: string; accountName: string; accountNo: string };

export type ClaimSettings = {
  monthlyLimit: number;      // per employee, warns only
  mileageRate: number;       // RM per km
  levels: { manager: boolean; finance: boolean; director: boolean };
};
export const DEFAULT_CLAIM_SETTINGS: ClaimSettings = { monthlyLimit: 2000, mileageRate: 0.6, levels: { manager: true, finance: true, director: true } };

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const total = (c: { items: ClaimItem[] }) => r2(c.items.reduce((s, i) => s + i.amount, 0));
/** The SST inside an amount that already includes it: 108.00 with 8% service tax holds 8.00 of tax. */
export const taxPortion = (amount: number, code: TaxCode) => { const t = TAXES.find((x) => x.code === code)!; return t.rate ? r2((amount * t.rate) / (100 + t.rate)) : 0; };
export const claimTax = (c: { items: ClaimItem[] }) => r2(c.items.reduce((s, i) => s + taxPortion(i.amount, i.tax), 0));
export const mileageAmount = (km: number, rate: number) => r2(Math.max(0, km) * rate);
/** The month a claim counts in: its earliest expense date. */
export const claimMonth = (c: Claim) => (c.items.map((i) => i.date).sort()[0] ?? c.createdAt).slice(0, 7);

export const STATUS_TONE: Record<ClaimStatus, "grey" | "amber" | "blue" | "green" | "red"> = {
  Draft: "grey", "Pending manager": "amber", "Pending finance": "amber", "Pending director": "amber", Approved: "blue", Processing: "blue", Paid: "green", Rejected: "red",
};
/** Once sent, a claim cannot be changed by its owner; only a draft (or a rejected one, sent again as new) can. */
export const editable = (c: Claim) => c.status === "Draft" || c.status === "Rejected";
export const LEVEL_NAME = { 1: "Manager", 2: "Finance", 3: "Director" } as const;

export type Warning = { itemId?: string; text: string };
