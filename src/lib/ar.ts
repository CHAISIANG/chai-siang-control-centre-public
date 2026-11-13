// Accounts receivable calculations for the Collections screens. Everything here works on invoices loaded from Finance.
import { addDays, daysBetween, round2, todayISO, type FinClient, type FinInvoice, type FinTemplate } from "./finance";

export type TemplateId = "friendly" | "followup" | "firm" | "final";
export type Score = "A" | "B" | "C" | "D";
export type ArCustomer = { id: string; name: string; contact: string; email: string; phone: string; language: "en" | "zh" };
export type ArPayment = { date: string; amount: number; method: string };
export type ArReminder = { date: string; channel: "email" | "whatsapp"; template: string | null; status: "sent" | "failed"; error: string | null; auto: boolean };
export type ArInvoice = {
  id: string; no: string; customerId: string; issue: string; due: string; total: number;
  payments: ArPayment[]; reminders: ArReminder[]; notes: string; void: boolean;
};
export type Template = { id: TemplateId; name: string; tone: string; when: string; en: { subject: string; body: string }; zh: { subject: string; body: string } };

/** WhatsApp wants digits only, with the country code: 012-345 6789 becomes 60123456789. */
export function waNumber(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("60")) return d;
  if (d.startsWith("0")) return "6" + d;
  return "60" + d;
}

export const toCustomer = (c: FinClient): ArCustomer => ({ id: c.id, name: c.company_name, contact: c.contact_person, email: c.email, phone: waNumber(c.phone), language: c.language });
export const toTemplate = (t: FinTemplate): Template => ({ id: t.id, name: t.name, tone: t.tone, when: t.when_text, en: { subject: t.en_subject, body: t.en_body }, zh: { subject: t.zh_subject, body: t.zh_body } });

export function toArInvoice(i: FinInvoice): ArInvoice {
  return {
    id: i.id, no: i.invoice_no, customerId: i.client_id, issue: i.issue_date, due: i.due_date, total: i.total, void: i.status === "void", notes: i.collection_notes,
    payments: i.payments.map((p) => ({ date: p.paid_on, amount: p.amount, method: p.method })),
    reminders: i.reminders.map((r) => ({ date: r.created_at.slice(0, 10), channel: r.channel, template: r.template, status: r.status, error: r.error, auto: r.auto })),
  };
}

export const paidOf = (i: ArInvoice) => round2(i.payments.reduce((s, p) => s + p.amount, 0));
export const balanceOf = (i: ArInvoice) => (i.void ? 0 : Math.max(0, round2(i.total - paidOf(i))));
export const daysPastDue = (i: ArInvoice, today = todayISO()) => daysBetween(i.due, today);
export const isOpen = (i: ArInvoice) => balanceOf(i) > 0;
export const lastSent = (i: ArInvoice) => [...i.reminders].reverse().find((r) => r.status === "sent");

// Buckets by days past the due date. "Current" holds everything not yet more than 30 days late.
export const BUCKETS = [
  { key: "current", label: "Current", range: "0–30 days", tone: "green" },
  { key: "d31", label: "31–60 days", range: "late", tone: "yellow" },
  { key: "d61", label: "61–90 days", range: "late", tone: "orange" },
  { key: "d90", label: "Over 90 days", range: "late", tone: "red" },
] as const;
export const bucketOf = (i: ArInvoice, today = todayISO()) => {
  const d = daysPastDue(i, today);
  return d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3;
};

export type Standing = "current" | "overdue" | "partial" | "paid";
export function standing(i: ArInvoice, today = todayISO()): Standing {
  if (!isOpen(i)) return "paid";
  if (daysPastDue(i, today) > 0) return "overdue";
  return paidOf(i) > 0 ? "partial" : "current";
}

/** Customer payment behaviour: A always on time; B up to 14 days late; C habitually around 30 days; D severe (over 45 days). */
export function scoreFor(customerId: string, invoices: ArInvoice[], today = todayISO()): { score: Score; worstDays: number } {
  let worst = 0;
  for (const i of invoices.filter((x) => x.customerId === customerId && !x.void)) {
    if (isOpen(i)) worst = Math.max(worst, daysPastDue(i, today));
    else if (i.payments.length) worst = Math.max(worst, daysBetween(i.due, i.payments[i.payments.length - 1].date));
  }
  return { worstDays: worst, score: worst <= 0 ? "A" : worst <= 14 ? "B" : worst <= 45 ? "C" : "D" };
}
export const SCORE_NOTE: Record<Score, string> = {
  A: "Always pays on time", B: "Occasionally late, within 14 days", C: "Habitually late, around 30 days", D: "Severely late, over 45 days",
};

/** DSO = AR balance / sales in the period x days in the period, as it stood on `asOf`. */
export function dsoAt(invoices: ArInvoice[], asOf: string, periodDays = 90) {
  const live = invoices.filter((i) => !i.void && i.issue <= asOf);
  const ar = live.reduce((s, i) => s + i.total - i.payments.filter((p) => p.date <= asOf).reduce((t, p) => t + p.amount, 0), 0);
  const sales = live.filter((i) => daysBetween(i.issue, asOf) < periodDays).reduce((s, i) => s + i.total, 0);
  return sales > 0 ? Math.round((Math.max(0, ar) / sales) * periodDays) : 0;
}
export const dso = (invoices: ArInvoice[], periodDays = 90, today = todayISO()) => dsoAt(invoices, today, periodDays);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** The last `n` calendar months ending with the month of `today`, oldest first. */
export function lastMonths(n: number, today = todayISO()) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, k) => {
    const d = new Date(y, m - 1 - (n - 1 - k), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const end = k === n - 1 ? today : addDays(`${key}-01`, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - 1);
    return { key, label: MONTHS[d.getMonth()], end };
  });
}
export function recoverySeries(invoices: ArInvoice[], today = todayISO()) {
  return lastMonths(6, today).map((mo) => {
    const live = invoices.filter((i) => !i.void);
    const billed = round2(live.filter((i) => i.issue.startsWith(mo.key)).reduce((s, i) => s + i.total, 0));
    const collected = round2(live.flatMap((i) => i.payments).filter((p) => p.date.startsWith(mo.key)).reduce((s, p) => s + p.amount, 0));
    return { month: mo.label, billed, collected, rate: billed > 0 ? Math.round((collected / billed) * 100) : null };
  });
}
export const dsoSeries = (invoices: ArInvoice[], today = todayISO()) => lastMonths(6, today).map((mo) => ({ month: mo.label, dso: dsoAt(invoices, mo.end) }));

// Which template suits an invoice this many days past its due date.
export const templateFor = (days: number): TemplateId => (days <= 14 ? "friendly" : days <= 30 ? "followup" : days <= 60 ? "firm" : "final");

export function fillTemplate(text: string, vars: Record<string, string>) {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
