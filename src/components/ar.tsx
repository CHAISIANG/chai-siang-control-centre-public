"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useFinance } from "./finance";
import { Badge } from "./ui";
import { btnGhost, btnPrimary, Modal } from "./finui";
import { supabase } from "@/lib/supabase";
import { balanceOf, daysPastDue, fillTemplate, isOpen, lastSent, scoreFor, templateFor, toArInvoice, toCustomer, toTemplate, type ArCustomer, type ArInvoice, type Score, type Template, type TemplateId } from "@/lib/ar";
import { daysBetween, fmtDate, money, round2, todayISO } from "@/lib/finance";

export type Channel = "email" | "whatsapp";
export type DailyResult = { ok: boolean; error?: string; code?: string; sent: string[]; failed: string[]; skipped: string[] };
export type SendResult = { ok: boolean; error?: string; code?: string };

type Ctx = {
  today: string; customers: ArCustomer[]; invoices: ArInvoice[]; templates: Template[];
  canManage: boolean; autoOn: boolean; reminderHour: number; currency: string; company: string;
  customer: (id: string) => ArCustomer; score: (customerId: string) => Score;
  addPayment: (id: string, amount: number, date: string, method: string) => Promise<string | null>;
  /** Sends a real email through the send-reminders function. */
  sendEmail: (inv: ArInvoice, template: TemplateId, lang: "en" | "zh", subject: string, body: string) => Promise<SendResult>;
  /** Records a reminder that was sent outside the system (a WhatsApp chat, or an email you sent yourself). */
  record: (invoiceId: string, channel: Channel, template: TemplateId, subject?: string) => Promise<string | null>;
  addNote: (id: string, text: string) => Promise<string | null>;
  saveTemplate: (id: TemplateId, lang: "en" | "zh", subject: string, body: string) => Promise<string | null>;
  setAuto: (on: boolean, hour: number) => Promise<string | null>;
  /** What the daily check would send now: overdue, has an email, not reminded in the last 7 days, not on hold. */
  dueToday: () => { inv: ArInvoice; template: TemplateId }[];
  runDaily: () => Promise<DailyResult>;
};
const ArCtx = createContext<Ctx | null>(null);

const TABS = [
  { href: "/finance/ar", label: "Aging" },
  { href: "/finance/ar/invoices", label: "Invoices" },
  { href: "/finance/ar/reminders", label: "Reminders" },
  { href: "/finance/ar/reports", label: "Reports" },
];

export function ArShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { clients, invoices: finInvoices, templates: finTemplates, settings, canManage, refresh } = useFinance();
  const today = todayISO();
  const customers = useMemo(() => clients.map(toCustomer), [clients]);
  const invoices = useMemo(() => finInvoices.map(toArInvoice), [finInvoices]);
  const templates = useMemo(() => finTemplates.map(toTemplate), [finTemplates]);

  const addPayment = useCallback(async (id: string, amount: number, date: string, method: string) => {
    const inv = invoices.find((i) => i.id === id);
    if (!inv) return "Invoice not found.";
    const amt = round2(amount);
    if (!(amt > 0)) return "Enter an amount above 0.";
    if (amt > balanceOf(inv)) return `That is more than the balance of ${money(balanceOf(inv), settings.currency)}.`;
    if (date > todayISO()) return "The date cannot be in the future.";
    const { error } = await supabase.from("fin_payments").insert({ invoice_id: id, paid_on: date, amount: amt, method });
    if (error) return error.message;
    await refresh();
    return null;
  }, [invoices, refresh, settings.currency]);

  const sendEmail = useCallback(async (inv: ArInvoice, template: TemplateId, lang: "en" | "zh", subject: string, body: string): Promise<SendResult> => {
    const { data, error } = await supabase.functions.invoke("send-reminders", { body: { action: "send", invoice_id: inv.id, template, lang, subject, body } });
    await refresh();
    if (error) return { ok: false, error: "Could not reach the email service. Try again in a moment." };
    return data as SendResult;
  }, [refresh]);

  const record = useCallback(async (invoiceId: string, channel: Channel, template: TemplateId, subject?: string) => {
    const { error } = await supabase.from("fin_reminders").insert({ invoice_id: invoiceId, channel, template, level: template, subject: subject ?? null, status: "sent" });
    if (error) return error.message;
    await refresh();
    return null;
  }, [refresh]);

  const addNote = useCallback(async (id: string, text: string) => {
    const inv = invoices.find((i) => i.id === id);
    const { error } = await supabase.from("fin_invoices").update({ collection_notes: [inv?.notes, text].filter(Boolean).join("\n") }).eq("id", id);
    if (error) return error.message;
    await refresh();
    return null;
  }, [invoices, refresh]);

  const saveTemplate = useCallback(async (id: TemplateId, lang: "en" | "zh", subject: string, body: string) => {
    const { error } = await supabase.from("fin_reminder_templates").update(lang === "en" ? { en_subject: subject, en_body: body } : { zh_subject: subject, zh_body: body }).eq("id", id);
    if (error) return error.message;
    await refresh();
    return null;
  }, [refresh]);

  const setAuto = useCallback(async (on: boolean, hour: number) => {
    const { error } = await supabase.from("fin_settings").update({ auto_reminders: on, reminder_hour: hour }).eq("id", 1);
    if (error) return error.message;
    await refresh();
    return null;
  }, [refresh]);

  const dueToday = useCallback(() => invoices
    .filter((i) => {
      const email = customers.find((c) => c.id === i.customerId)?.email;
      const last = lastSent(i);
      return isOpen(i) && daysPastDue(i, today) > 0 && !!email && !/\bhold\b/i.test(i.notes) && (!last || daysBetween(last.date, today) >= 7);
    })
    .map((inv) => ({ inv, template: templateFor(daysPastDue(inv, today)) })), [invoices, customers, today]);

  const runDaily = useCallback(async (): Promise<DailyResult> => {
    const { data, error } = await supabase.functions.invoke("send-reminders", { body: { action: "daily" } });
    await refresh();
    if (error) return { ok: false, error: "Could not reach the email service. Try again in a moment.", sent: [], failed: [], skipped: [] };
    const d = data as Partial<DailyResult>;
    return { ok: !!d.ok, error: d.error, code: d.code, sent: d.sent ?? [], failed: d.failed ?? [], skipped: d.skipped ?? [] };
  }, [refresh]);

  const value = useMemo<Ctx>(() => ({
    today, customers, invoices, templates, canManage, autoOn: settings.auto_reminders, reminderHour: settings.reminder_hour, currency: settings.currency, company: settings.company_name,
    customer: (id) => customers.find((c) => c.id === id) ?? { id, name: "Unknown client", contact: "", email: "", phone: "", language: "en" },
    score: (id) => scoreFor(id, invoices, today).score,
    addPayment, sendEmail, record, addNote, saveTemplate, setAuto, dueToday, runDaily,
  }), [today, customers, invoices, templates, canManage, settings, addPayment, sendEmail, record, addNote, saveTemplate, setAuto, dueToday, runDaily]);

  return (
    <ArCtx.Provider value={value}>
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <nav aria-label="Collections" className="flex gap-1 rounded-lg border border-slate-200 bg-white p-1">
          {TABS.map((t) => {
            const on = t.href === "/finance/ar" ? pathname === t.href : pathname.startsWith(t.href);
            return <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`rounded-md px-3.5 py-1.5 text-base font-medium ${on ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{t.label}</Link>;
          })}
        </nav>
        <span className="text-sm text-slate-500">Uses your Finance invoices, clients and payments.</span>
      </div>
      {children}
    </ArCtx.Provider>
  );
}

export function useAr() {
  const c = useContext(ArCtx);
  if (!c) throw new Error("useAr outside ArShell");
  return c;
}

const scoreTone: Record<Score, "green" | "blue" | "amber" | "red"> = { A: "green", B: "blue", C: "amber", D: "red" };
export function ScoreBadge({ score }: { score: Score }) {
  return <Badge tone={scoreTone[score]}>Rated {score}</Badge>;
}

export const bucketCls = {
  green: { bar: "bg-emerald-500", card: "border-emerald-300 bg-emerald-50/60", text: "text-emerald-800" },
  yellow: { bar: "bg-yellow-400", card: "border-yellow-300 bg-yellow-50/70", text: "text-yellow-800" },
  orange: { bar: "bg-orange-500", card: "border-orange-300 bg-orange-50/70", text: "text-orange-800" },
  red: { bar: "bg-rose-600", card: "border-rose-300 bg-rose-50/70", text: "text-rose-800" },
} as const;

/** Preview and send. Email goes out through Resend; WhatsApp opens a ready-written chat that you send yourself. */
export function ReminderPreview({ invoices, onClose }: { invoices: ArInvoice[]; onClose: () => void }) {
  const { customer, today, templates, canManage, currency, company, sendEmail, record } = useAr();
  const [channel, setChannel] = useState<Channel>("email");
  const [lang, setLang] = useState<"en" | "zh" | "">("");
  const [idx, setIdx] = useState(0);
  const [tplOverride, setTplOverride] = useState<TemplateId | "">("");
  const [done, setDone] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; manual?: boolean } | null>(null);
  const inv = invoices[idx];
  const c = customer(inv.customerId);
  const useLang = lang || c.language;
  const days = Math.max(1, daysPastDue(inv, today));
  const tplId = tplOverride || templateFor(days);
  const tpl = templates.find((t) => t.id === tplId);
  if (!tpl) return <Modal title="Send reminder" onClose={onClose}><p className="text-slate-600">The reminder templates could not be loaded. Close this and try again.</p></Modal>;
  const vars = { contact: c.contact || c.name, invoice_no: inv.no, amount: money(balanceOf(inv), currency), due_date: fmtDate(inv.due), days_overdue: String(days), company };
  const subject = fillTemplate(tpl[useLang].subject, vars);
  const body = fillTemplate(tpl[useLang].body, vars);
  const waLink = `https://wa.me/${c.phone}?text=${encodeURIComponent(body)}`;
  const seg = "rounded-md border px-3 py-1.5 text-sm font-medium";
  const on = "border-indigo-600 bg-indigo-600 text-white";
  const off = "border-slate-300 text-slate-600 hover:bg-slate-100";
  const sent = done.includes(inv.id);
  const next = () => { if (idx < invoices.length - 1) setIdx(idx + 1); };

  async function sendMail() {
    setBusy(true); setMsg(null);
    const r = await sendEmail(inv, tplId, useLang, subject, body);
    setBusy(false);
    if (r.ok) { setDone((d) => [...d, inv.id]); setMsg({ ok: true, text: `Email sent to ${c.email}.` }); next(); }
    else setMsg({ ok: false, text: r.error ?? "The email could not be sent.", manual: r.code === "no_key" || r.code === "provider" });
  }
  async function recordOnly(ch: Channel) {
    setBusy(true); setMsg(null);
    const err = await record(inv.id, ch, tplId, ch === "email" ? subject : undefined);
    setBusy(false);
    if (err) return setMsg({ ok: false, text: err });
    setDone((d) => [...d, inv.id]); setMsg({ ok: true, text: "Recorded in the invoice history." }); next();
  }
  function whatsapp() {
    window.open(waLink, "_blank", "noopener");
    void recordOnly("whatsapp");
  }

  return (
    <Modal title={invoices.length > 1 ? `Send reminders · ${idx + 1} of ${invoices.length}` : "Send reminder"} onClose={onClose} wide>
      <div className="space-y-3">
        {invoices.length > 1 && (
          <div className="flex items-center gap-2 text-sm">
            <button className={btnGhost + " !px-3 !py-1"} disabled={idx === 0} onClick={() => { setIdx(idx - 1); setMsg(null); }}>Previous</button>
            <button className={btnGhost + " !px-3 !py-1"} disabled={idx === invoices.length - 1} onClick={() => { setIdx(idx + 1); setMsg(null); }}>Next</button>
            <span className="text-slate-500">{done.length} of {invoices.length} done. Each invoice gets the tone that fits its age.</span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button className={`${seg} ${channel === "email" ? on : off}`} onClick={() => setChannel("email")}>Email</button>
          <button className={`${seg} ${channel === "whatsapp" ? on : off}`} onClick={() => setChannel("whatsapp")}>WhatsApp</button>
          <span className="mx-1 h-5 w-px bg-slate-300" />
          <button className={`${seg} ${useLang === "en" ? on : off}`} onClick={() => setLang("en")}>English</button>
          <button className={`${seg} ${useLang === "zh" ? on : off}`} onClick={() => setLang("zh")}>中文</button>
          <select aria-label="Template" className="ml-auto rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={tplId} onChange={(e) => setTplOverride(e.target.value as TemplateId)}>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-slate-50 px-3 py-2 text-sm">
          <dt className="text-slate-500">To</dt><dd>{c.name} · {channel === "email" ? c.email || "no email saved" : c.phone ? `+${c.phone}` : "no phone saved"}</dd>
          <dt className="text-slate-500">Invoice</dt><dd>{inv.no} · {money(balanceOf(inv), currency)} · {days} days past due</dd>
          {channel === "email" && <><dt className="text-slate-500">Subject</dt><dd className="font-medium">{subject}</dd></>}
        </dl>
        <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 p-3 font-sans text-sm text-slate-700">{body}</pre>
        {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}
        {!canManage ? <p className="text-sm text-slate-500">Your role can view collections but not send reminders.</p> : (
          <div className="flex flex-wrap items-center gap-3">
            {channel === "email" ? (
              <>
                <button disabled={sent || busy || !c.email} className={btnPrimary} onClick={() => void sendMail()}>{busy ? "Sending…" : sent ? "Already sent" : "Send this email"}</button>
                {msg?.manual && !sent && <button disabled={busy} className={btnGhost} onClick={() => void recordOnly("email")}>I sent it myself, record it</button>}
              </>
            ) : (
              <button disabled={sent || busy || !c.phone} className={btnPrimary} onClick={whatsapp}>{sent ? "Already recorded" : "Open WhatsApp and record"}</button>
            )}
            <span className="text-sm text-slate-500">{channel === "email" ? "Sent from the system and added to the invoice history." : "Opens WhatsApp with this message ready. You press send."}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
