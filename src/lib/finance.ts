// Finance types and pure helpers (dates are plain "YYYY-MM-DD" strings, money is 2-decimal numbers).

export type FinSettings = {
  company_name: string; company_address: string; company_phone: string; company_email: string; reg_no: string; sst_no: string;
  tax_rate: number; currency: string; payment_terms_days: number; bank_name: string; bank_account_no: string; bank_account_name: string;
  auto_reminders: boolean; reminder_hour: number;
};
export type FinClient = { id: string; company_name: string; contact_person: string; email: string; phone: string; address: string; notes: string; language: "en" | "zh" };
export type FinReminder = { id: number; invoice_id: string; channel: "email" | "whatsapp"; template: string | null; subject: string | null; status: "sent" | "failed"; error: string | null; auto: boolean; created_at: string };
export type FinTemplate = { id: "friendly" | "followup" | "firm" | "final"; sort: number; name: string; tone: string; when_text: string; from_day: number; to_day: number; en_subject: string; en_body: string; zh_subject: string; zh_body: string };
export type FinItem = { id: number; invoice_id: string; sort: number; description: string; qty: number; unit_price: number; amount: number };
export type FinPayment = { id: number; invoice_id: string; paid_on: string; amount: number; method: string; reference: string; note: string };
export type InvStatus = "unpaid" | "partial" | "overdue" | "paid" | "void";
export type FinInvoice = {
  id: string; invoice_no: string; client_id: string; issue_date: string; due_date: string; status: InvStatus;
  subtotal: number; tax_rate: number; tax_amount: number; total: number; amount_paid: number; balance_due: number;
  recurrence: "monthly" | "quarterly" | null; next_generate_date: string | null; recurring_source: string | null; notes: string; collection_notes: string;
  items: FinItem[]; payments: FinPayment[]; reminders: FinReminder[];
};

export const DEFAULT_SETTINGS: FinSettings = {
  company_name: "Chai Siang Sdn Bhd", company_address: "", company_phone: "", company_email: "", reg_no: "", sst_no: "",
  tax_rate: 8, currency: "RM", payment_terms_days: 30, bank_name: "", bank_account_no: "", bank_account_name: "",
  auto_reminders: false, reminder_hour: 9,
};

/** Round to 2 decimals without floating-point drift (e.g. 1.005). */
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const money = (n: number, currency = "RM") =>
  `${currency} ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const pad = (n: number) => String(n).padStart(2, "0");
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
const parse = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
/** Whole days from a to b (positive when b is later). */
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return toISO(d); };
export const fmtDate = (s: string | null) => (s ? parse(s).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

/** Status as seen today. The database marks overdue daily, but this keeps the screen right in between. */
export function effectiveStatus(inv: FinInvoice, today = todayISO()): InvStatus {
  if (inv.status === "void" || inv.status === "paid") return inv.status;
  if (inv.balance_due > 0 && inv.due_date < today) return "overdue";
  return inv.status;
}

export const STATUS_LABEL: Record<InvStatus, string> = { unpaid: "Unpaid", partial: "Part paid", overdue: "Overdue", paid: "Paid", void: "Void" };
export const STATUS_TONE: Record<InvStatus, "grey" | "amber" | "red" | "green" | "blue"> = { unpaid: "blue", partial: "blue", overdue: "red", paid: "green", void: "grey" };

export type Alert = { key: "soon" | "overdue" | "n7" | "n30" | "n60"; label: string; tone: "amber" | "red"; days: number };
/** Yellow from 3 days before the due date; red once overdue; escalation notices at 7, 30 and 60 days overdue. */
export function alertFor(inv: FinInvoice, today = todayISO()): Alert | null {
  if (inv.status === "void" || inv.status === "paid" || inv.balance_due <= 0) return null;
  const toDue = daysBetween(today, inv.due_date);
  if (toDue >= 0 && toDue <= 3) return { key: "soon", label: toDue === 0 ? "Due today" : `Due in ${toDue} day${toDue === 1 ? "" : "s"}`, tone: "amber", days: -toDue };
  const over = -toDue;
  if (over >= 60) return { key: "n60", label: `Final notice · ${over} days overdue`, tone: "red", days: over };
  if (over >= 30) return { key: "n30", label: `Second notice · ${over} days overdue`, tone: "red", days: over };
  if (over >= 7) return { key: "n7", label: `First notice · ${over} days overdue`, tone: "red", days: over };
  if (over >= 1) return { key: "overdue", label: `Overdue ${over} day${over === 1 ? "" : "s"}`, tone: "red", days: over };
  return null;
}

export const BUCKETS = ["Current", "1–30 days", "31–60 days", "61–90 days", "Over 90 days"] as const;
export function bucketIndex(inv: FinInvoice, today = todayISO()): number {
  const over = daysBetween(inv.due_date, today);
  if (over <= 0) return 0;
  if (over <= 30) return 1;
  if (over <= 60) return 2;
  if (over <= 90) return 3;
  return 4;
}

export const openInvoices = (list: FinInvoice[]) => list.filter((i) => i.status !== "void" && i.balance_due > 0);

/** Totals as the form shows them. The database recomputes the same figures when saved. */
export function calcTotals(lines: { qty: number; unit_price: number }[], taxRate: number) {
  const subtotal = round2(lines.reduce((s, l) => s + round2((Number(l.qty) || 0) * (Number(l.unit_price) || 0)), 0));
  const tax = round2((subtotal * taxRate) / 100);
  return { subtotal, tax, total: round2(subtotal + tax) };
}

export function reminderEmail(inv: FinInvoice, client: FinClient, s: FinSettings, alert: Alert | null) {
  const level = alert?.key === "n60" ? "FINAL NOTICE" : alert?.key === "n30" ? "Second reminder" : alert?.key === "n7" ? "First reminder" : alert?.key === "soon" ? "Friendly reminder" : "Payment reminder";
  const subject = `${level}: invoice ${inv.invoice_no} (${money(inv.balance_due, s.currency)})`;
  const opening = alert?.key === "soon"
    ? `This is a friendly reminder that invoice ${inv.invoice_no} falls due on ${fmtDate(inv.due_date)}.`
    : `Our records show that invoice ${inv.invoice_no}, due on ${fmtDate(inv.due_date)}, is still unpaid${alert ? ` and is now ${alert.days} days overdue` : ""}.`;
  const closing = alert?.key === "n60"
    ? "This account is now seriously overdue. Please settle it within 7 days, or contact us to arrange payment, to avoid further action."
    : alert?.key === "n30"
      ? "Please arrange payment this week, or let us know if there is a problem with the invoice."
      : "If you have already paid, please send us the transfer slip so we can update our records.";
  const bank = s.bank_account_no ? `\nBank transfer to:\n${s.bank_name}\nAccount name: ${s.bank_account_name}\nAccount no.: ${s.bank_account_no}\nPlease quote ${inv.invoice_no} as the reference.\n` : "";
  const body = `Dear ${client.contact_person || client.company_name},\n\n${opening}\n\nInvoice: ${inv.invoice_no}\nInvoice date: ${fmtDate(inv.issue_date)}\nDue date: ${fmtDate(inv.due_date)}\nTotal: ${money(inv.total, s.currency)}\nPaid: ${money(inv.amount_paid, s.currency)}\nBalance due: ${money(inv.balance_due, s.currency)}\n${bank}\n${closing}\n\nThank you.\n\n${s.company_name}${s.company_phone ? `\n${s.company_phone}` : ""}${s.company_email ? `\n${s.company_email}` : ""}`;
  return { subject, body };
}
