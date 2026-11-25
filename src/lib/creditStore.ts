"use client";
// One shared store for the credit check, so SAP import, Credit approvals and the sales rep reminders see the same requests.
// Live mode (inside the app) reads the database and acts through the credit_* functions, which redo the aging check on
// the server. Sample mode (the sample upload and the preview page) keeps made-up data in this browser.
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { SAMPLE_APPROVALS, SAMPLE_REMINDERS, SAMPLE_SETTLED, SAMPLE_SUPERMARKET, type ApprovalStatus, type CreditApproval, type CreditCase, type CreditReminder, type Settled, type SupermarketInvoice, type Unposted } from "./credit";

export type CreditState = { approvals: CreditApproval[]; reminders: CreditReminder[]; supermarket: SupermarketInvoice[]; settled: Settled[]; loading?: boolean };
export type Result = { ok: true; text: string } | { ok: false; text: string };

/** The preview page wraps its screens in this, so they use sample data instead of the database. */
const SampleMode = createContext(false);
export function CreditSample({ children }: { children: ReactNode }) { return createElement(SampleMode.Provider, { value: true }, children); }
/** Whether the screen uses sample data: on the preview page, or when asked (the SAP import sample upload). */
export function useCreditSample(force = false) { return useContext(SampleMode) || force; }

const KEY = "cssb.credit.sample.v2";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const uid = () => Math.random().toString(36).slice(2, 10);
const seed = (): CreditState => ({ approvals: structuredClone(SAMPLE_APPROVALS), reminders: structuredClone(SAMPLE_REMINDERS), supermarket: structuredClone(SAMPLE_SUPERMARKET), settled: structuredClone(SAMPLE_SETTLED) });
const fail = (e: { message?: string } | null | undefined): Result => ({ ok: false, text: (e?.message ?? "Something went wrong. Try again.").replace(/^.*?ERROR:\s*/, "") });
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

// ---------- sample: this browser only ----------
let sample: CreditState = seed();
let sampleLoaded = false;
function loadSample() {
  if (sampleLoaded || typeof window === "undefined") return;
  sampleLoaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s?.approvals && s?.settled && s?.supermarket) sample = s; } } catch { /* start from the sample */ }
}
function setSample(next: CreditState) {
  sample = next;
  try { localStorage.setItem(KEY, JSON.stringify(sample)); } catch { /* ignore */ }
  ping();
}

// ---------- live: the database ----------
let live: CreditState = { approvals: [], reminders: [], supermarket: [], settled: [], loading: true };
let liveStarted = false;
type ApprovalRow = { id: string; doc_no: string; customer: string; customer_name: string | null; sales_rep: string; amount: number; overdue: number; oldest_days: number; buckets: number[]; as_at: string | null; file_name: string | null; status: ApprovalStatus; asked_by_name: string | null; asked_at: string; note: string | null; decided_by_name: string | null; decided_at: string | null; decision_note: string | null };
type UnpostedRow = { customer: string; doc_no: string; paid: number; paid_on: string; receipt: string };
type SettledRow = { id: string; doc_no: string; customer: string; customer_name: string | null; sales_rep: string; amount: number; settled_on: string; summary_ref: string | null; note: string | null; by_name: string | null; created_at: string };
type OpenRow = { doc_no: string; customer: string; customer_name: string; sales_rep: string; amount: number; due_date: string | null };
/** Receipts not yet posted in the aging, for these customers (the database works it out; empty for people who may not see it). */
export async function loadUnposted(customers: string[]): Promise<Map<string, Unposted[]>> {
  const out = new Map<string, Unposted[]>();
  if (!customers.length) return out;
  const { data } = await supabase.rpc("credit_unposted", { p_customers: customers });
  for (const r of (data ?? []) as UnpostedRow[]) {
    const list = out.get(r.customer) ?? [];
    list.push({ docNo: r.doc_no, paid: Number(r.paid), date: r.paid_on, receipt: r.receipt });
    out.set(r.customer, list);
  }
  return out;
}
type ReminderRow = { id: string; doc_no: string; customer: string; customer_name: string | null; sales_rep: string; amount: number; overdue: number; oldest_days: number; sent_on: string; seen: boolean };

export async function reloadCredit() {
  const [a, r, st, op] = await Promise.all([
    supabase.from("credit_approvals").select("id, doc_no, customer, customer_name, sales_rep, amount, overdue, oldest_days, buckets, as_at, file_name, status, asked_by_name, asked_at, note, decided_by_name, decided_at, decision_note").order("created_at", { ascending: false }).limit(1000),
    supabase.from("credit_reminders").select("id, doc_no, customer, customer_name, sales_rep, amount, overdue, oldest_days, sent_on, seen").order("sent_on", { ascending: false }).limit(500),
    supabase.from("credit_settled").select("id, doc_no, customer, customer_name, sales_rep, amount, settled_on, summary_ref, note, by_name, created_at").order("created_at", { ascending: false }).limit(500),
    supabase.rpc("supermarket_open"),   // empty for people who may not see it
  ]);
  const waitingCustomers = [...new Set(((a.data ?? []) as ApprovalRow[]).filter((x) => x.status === "Waiting").map((x) => x.customer))];
  const unposted = await loadUnposted(waitingCustomers);
  live = {
    supermarket: ((op.data ?? []) as OpenRow[]).map((x): SupermarketInvoice => ({ docNo: x.doc_no, customer: x.customer, customerName: x.customer_name, salesRep: x.sales_rep, amount: Number(x.amount), dueDate: x.due_date ?? "" })),
    settled: ((st.data ?? []) as SettledRow[]).map((x): Settled => ({ id: x.id, docNo: x.doc_no, customer: x.customer, customerName: x.customer_name ?? x.customer, salesRep: x.sales_rep, amount: Number(x.amount), settledOn: x.settled_on, summaryRef: x.summary_ref ?? undefined, note: x.note ?? undefined, by: x.by_name ?? "", at: x.created_at.slice(0, 10) })),
    approvals: ((a.data ?? []) as ApprovalRow[]).map((x): CreditApproval => ({
      id: x.id, docNo: x.doc_no, customer: x.customer, customerName: x.customer_name ?? x.customer, salesRep: x.sales_rep, amount: Number(x.amount),
      overdue: Number(x.overdue), oldestDays: x.oldest_days, buckets: (x.buckets ?? []).map(Number), asAt: x.as_at, file: x.file_name ?? "",
      status: x.status, askedBy: x.asked_by_name ?? "", askedAt: x.asked_at, note: x.note ?? undefined,
      decidedBy: x.decided_by_name ?? undefined, decidedAt: x.decided_at ?? undefined, decisionNote: x.decision_note ?? undefined,
      unposted: x.status === "Waiting" ? unposted.get(x.customer) : undefined,
    })),
    reminders: ((r.data ?? []) as ReminderRow[]).map((x): CreditReminder => ({
      id: x.id, docNo: x.doc_no, customer: x.customer, customerName: x.customer_name ?? x.customer, salesRep: x.sales_rep, amount: Number(x.amount),
      overdue: Number(x.overdue), oldestDays: x.oldest_days, at: x.sent_on, seen: x.seen,
    })),
  };
  ping();
}
function startLive() {
  if (liveStarted || typeof window === "undefined") return;
  liveStarted = true;
  void reloadCredit();
  // another person asks or decides: everyone's screen follows
  supabase.channel(`credit-${uid()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "credit_approvals" }, () => void reloadCredit())
    .on("postgres_changes", { event: "*", schema: "public", table: "credit_reminders" }, () => void reloadCredit())
    .on("postgres_changes", { event: "*", schema: "public", table: "credit_settled" }, () => void reloadCredit())
    .subscribe();
}

const SERVER = seed();
const SERVER_LIVE: CreditState = { approvals: [], reminders: [], supermarket: [], settled: [], loading: true };
export function useCreditStore(useSample: boolean): CreditState {
  return useSyncExternalStore(
    (f) => { if (useSample) loadSample(); else startLive(); subs.add(f); return () => subs.delete(f); },
    () => { if (useSample) { loadSample(); return sample; } return live; },
    () => (useSample ? SERVER : SERVER_LIVE),
  );
}

const askText = (asked: number, reminded: number) => {
  const parts = [asked && `approval asked for ${asked} ${asked === 1 ? "invoice" : "invoices"}`, reminded && `${reminded} sales rep ${reminded === 1 ? "reminder" : "reminders"} sent`].filter(Boolean);
  return parts.length ? `${parts.join("; ")}.`.replace(/^./, (x) => x.toUpperCase()) : "Already asked.";
};

/** Ask for approval of held invoices, and remind sales reps about supermarkets. Asking twice for the same invoice does nothing. */
export async function askCredit(useSample: boolean, cases: CreditCase[], file: string, askedBy: string, note: string): Promise<Result> {
  if (!useSample) {
    const { data, error } = await supabase.rpc("credit_ask", {
      p_cases: cases.map((c) => ({ doc_no: c.docNo, customer: c.customer, customer_name: c.customerName, sales_rep: c.salesRep, amount: Math.round(c.amount * 100) / 100 })),
      p_file: file, p_note: note,
    });
    if (error) return fail(error);
    await reloadCredit();
    const r = data as { asked: number; reminded: number };
    return { ok: true, text: askText(r.asked, r.reminded) };
  }
  const s = structuredClone(sample);
  let asked = 0, reminded = 0;
  for (const c of cases) {
    const base = { docNo: c.docNo, customer: c.customer, customerName: c.customerName, salesRep: c.salesRep, amount: Math.round(c.amount * 100) / 100, overdue: c.aging.overdue, oldestDays: c.aging.oldestDays };
    if (c.kind === "approval") {
      const was = s.approvals.find((a) => a.docNo === c.docNo && a.status !== "Rejected");
      if (was) continue;
      s.approvals.push({ id: uid(), ...base, buckets: c.aging.buckets, asAt: c.aging.asAt, file, status: "Waiting", askedBy, askedAt: today(), note: note.trim() || undefined });
      asked++;
    } else {
      if (s.reminders.some((r) => r.docNo === c.docNo)) continue;
      s.reminders.push({ id: uid(), ...base, at: today(), seen: false });
      reminded++;
    }
  }
  setSample(s);
  return { ok: true, text: askText(asked, reminded) };
}

export async function decideCredit(useSample: boolean, id: string, status: Exclude<ApprovalStatus, "Waiting">, by: string, note: string): Promise<Result> {
  const list = useSample ? sample.approvals : live.approvals;
  const a = list.find((x) => x.id === id);
  if (!a || a.status !== "Waiting") return { ok: false, text: "This request has already been decided." };
  if (status === "Rejected" && !note.trim()) return { ok: false, text: "Give a reason for rejecting." };
  const done: Result = { ok: true, text: status === "Approved" ? `${a.docNo} approved. It can now go into the import file.` : `${a.docNo} rejected. It stays out of the import file.` };
  if (!useSample) {
    const { error } = await supabase.rpc("credit_decide", { p_id: id, p_status: status, p_note: note });
    await reloadCredit();
    return error ? fail(error) : done;
  }
  setSample({ ...sample, approvals: sample.approvals.map((x) => (x.id === id ? { ...x, status, decidedBy: by, decidedAt: today(), decisionNote: note.trim() || undefined } : x)) });
  return done;
}

export async function seenReminder(useSample: boolean, id: string): Promise<Result> {
  if (!useSample) {
    const { error } = await supabase.rpc("credit_seen", { p_id: id });
    await reloadCredit();
    return error ? fail(error) : { ok: true, text: "Ticked." };
  }
  setSample({ ...sample, reminders: sample.reminders.map((r) => (r.id === id ? { ...r, seen: true } : r)) });
  return { ok: true, text: "Ticked." };
}
/**
 * Finance marks supermarket invoices as settled from a collection summary (they are knocked off by hand twice a month).
 * This only records it; the aging is not changed. Live: the database records it; sample: this browser.
 */
export async function settleSupermarket(useSample: boolean, docNos: string[], settledOn: string, summaryRef: string, note: string, by: string): Promise<Result> {
  if (!useSample) {
    if (!docNos.length) return { ok: false, text: "Tick at least one invoice." };
    if (!settledOn) return { ok: false, text: "Pick the date it was settled." };
    const { data, error } = await supabase.rpc("supermarket_settle", { p_docs: docNos, p_date: settledOn, p_ref: summaryRef, p_note: note });
    await reloadCredit();
    return error ? fail(error) : { ok: true, text: `${data as number} ${data === 1 ? "invoice" : "invoices"} marked settled.` };
  }
  if (!docNos.length) return { ok: false, text: "Tick at least one invoice." };
  if (!settledOn) return { ok: false, text: "Pick the date it was settled." };
  if (settledOn > today()) return { ok: false, text: "The settled date cannot be in the future." };
  const open = sample.supermarket.filter((x) => docNos.includes(x.docNo));
  if (!open.length) return { ok: false, text: "These invoices are already settled." };
  const rows: Settled[] = open.map((x) => ({ id: uid(), docNo: x.docNo, customer: x.customer, customerName: x.customerName, salesRep: x.salesRep, amount: x.amount, settledOn, summaryRef: summaryRef.trim() || undefined, note: note.trim() || undefined, by, at: today() }));
  setSample({ ...sample, supermarket: sample.supermarket.filter((x) => !docNos.includes(x.docNo)), settled: [...rows, ...sample.settled] });
  return { ok: true, text: `${rows.length} ${rows.length === 1 ? "invoice" : "invoices"} marked settled.` };
}
/** Put a settled invoice back on the open list (a mistake). */
export async function undoSettled(useSample: boolean, id: string): Promise<Result> {
  if (!useSample) {
    const { error } = await supabase.rpc("supermarket_unsettle", { p_id: id });
    await reloadCredit();
    return error ? fail(error) : { ok: true, text: "Open again." };
  }
  const x = sample.settled.find((r) => r.id === id);
  if (!x) return { ok: false, text: "Not found." };
  const back: SupermarketInvoice = { docNo: x.docNo, customer: x.customer, customerName: x.customerName, salesRep: x.salesRep, amount: x.amount, dueDate: x.settledOn };
  setSample({ ...sample, settled: sample.settled.filter((r) => r.id !== id), supermarket: [...sample.supermarket, back] });
  return { ok: true, text: `${x.docNo} is open again.` };
}
export function resetCredit() { setSample(seed()); }

/** Where each invoice stands. An invoice has at most one open (waiting or approved) request, and that one counts;
 *  otherwise it was rejected and can be asked again. */
export function statusByDoc(approvals: CreditApproval[]): Record<string, ApprovalStatus> {
  const out: Record<string, ApprovalStatus> = {};
  for (const a of approvals) if (a.status !== "Rejected" || !out[a.docNo]) out[a.docNo] = a.status;
  return out;
}
