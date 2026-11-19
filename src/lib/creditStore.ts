"use client";
// One shared store for the credit check, so SAP import, Credit approvals and the sales rep reminders see the same requests.
// Live mode (inside the app) reads the database and acts through the credit_* functions, which redo the aging check on
// the server. Sample mode (the sample upload and the preview page) keeps made-up data in this browser.
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { SAMPLE_APPROVALS, SAMPLE_REMINDERS, type ApprovalStatus, type CreditApproval, type CreditCase, type CreditReminder } from "./credit";

export type CreditState = { approvals: CreditApproval[]; reminders: CreditReminder[]; loading?: boolean };
export type Result = { ok: true; text: string } | { ok: false; text: string };

/** The preview page wraps its screens in this, so they use sample data instead of the database. */
const SampleMode = createContext(false);
export function CreditSample({ children }: { children: ReactNode }) { return createElement(SampleMode.Provider, { value: true }, children); }
/** Whether the screen uses sample data: on the preview page, or when asked (the SAP import sample upload). */
export function useCreditSample(force = false) { return useContext(SampleMode) || force; }

const KEY = "cssb.credit.sample.v1";
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const uid = () => Math.random().toString(36).slice(2, 10);
const seed = (): CreditState => ({ approvals: structuredClone(SAMPLE_APPROVALS), reminders: structuredClone(SAMPLE_REMINDERS) });
const fail = (e: { message?: string } | null | undefined): Result => ({ ok: false, text: (e?.message ?? "Something went wrong. Try again.").replace(/^.*?ERROR:\s*/, "") });
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());

// ---------- sample: this browser only ----------
let sample: CreditState = seed();
let sampleLoaded = false;
function loadSample() {
  if (sampleLoaded || typeof window === "undefined") return;
  sampleLoaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s?.approvals) sample = s; } } catch { /* start from the sample */ }
}
function setSample(next: CreditState) {
  sample = next;
  try { localStorage.setItem(KEY, JSON.stringify(sample)); } catch { /* ignore */ }
  ping();
}

// ---------- live: the database ----------
let live: CreditState = { approvals: [], reminders: [], loading: true };
let liveStarted = false;
type ApprovalRow = { id: string; doc_no: string; customer: string; customer_name: string | null; sales_rep: string; amount: number; overdue: number; oldest_days: number; buckets: number[]; as_at: string | null; file_name: string | null; status: ApprovalStatus; asked_by_name: string | null; asked_at: string; note: string | null; decided_by_name: string | null; decided_at: string | null; decision_note: string | null };
type ReminderRow = { id: string; doc_no: string; customer: string; customer_name: string | null; sales_rep: string; amount: number; overdue: number; oldest_days: number; sent_on: string; seen: boolean };

export async function reloadCredit() {
  const [a, r] = await Promise.all([
    supabase.from("credit_approvals").select("id, doc_no, customer, customer_name, sales_rep, amount, overdue, oldest_days, buckets, as_at, file_name, status, asked_by_name, asked_at, note, decided_by_name, decided_at, decision_note").order("created_at", { ascending: false }).limit(1000),
    supabase.from("credit_reminders").select("id, doc_no, customer, customer_name, sales_rep, amount, overdue, oldest_days, sent_on, seen").order("sent_on", { ascending: false }).limit(500),
  ]);
  live = {
    approvals: ((a.data ?? []) as ApprovalRow[]).map((x): CreditApproval => ({
      id: x.id, docNo: x.doc_no, customer: x.customer, customerName: x.customer_name ?? x.customer, salesRep: x.sales_rep, amount: Number(x.amount),
      overdue: Number(x.overdue), oldestDays: x.oldest_days, buckets: (x.buckets ?? []).map(Number), asAt: x.as_at, file: x.file_name ?? "",
      status: x.status, askedBy: x.asked_by_name ?? "", askedAt: x.asked_at, note: x.note ?? undefined,
      decidedBy: x.decided_by_name ?? undefined, decidedAt: x.decided_at ?? undefined, decisionNote: x.decision_note ?? undefined,
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
    .subscribe();
}

const SERVER = seed();
const SERVER_LIVE: CreditState = { approvals: [], reminders: [], loading: true };
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
export function resetCredit() { setSample(seed()); }

/** Where each invoice stands. An invoice has at most one open (waiting or approved) request, and that one counts;
 *  otherwise it was rejected and can be asked again. */
export function statusByDoc(approvals: CreditApproval[]): Record<string, ApprovalStatus> {
  const out: Record<string, ApprovalStatus> = {};
  for (const a of approvals) if (a.status !== "Rejected" || !out[a.docNo]) out[a.docNo] = a.status;
  return out;
}
