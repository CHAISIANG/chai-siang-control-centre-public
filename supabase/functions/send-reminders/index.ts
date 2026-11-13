// Sends payment reminder emails through Resend and records each one in fin_reminders.
// Two ways in:
//   1. A signed-in person with the "finance_manage" permission:  { action: "send", invoice_id, template, lang, subject, body }
//      or { action: "daily" } to run today's check by hand.
//   2. The daily schedule, which sends the header x-cron-secret (must match the CRON_SECRET secret) and { action: "daily" }.
//      The schedule only sends when auto reminders are switched on and it is the chosen hour (Malaysia time).
// Secrets: RESEND_API_KEY (required to send), RESEND_FROM (optional, e.g. "Chai Siang <accounts@yourdomain.com>"), CRON_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

const myt = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit" }).format(d); // YYYY-MM-DD
const mytHour = () => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", hour12: false }).format(new Date())) % 24;
const dayNum = (s: string) => Math.round(Date.parse(s + "T00:00:00Z") / 86400000);
const fmtDate = (s: string) => new Date(s + "T00:00:00Z").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const fill = (text: string, v: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => v[k] ?? `{${k}}`);

type Settings = { company_name: string; company_email: string; currency: string; auto_reminders: boolean; reminder_hour: number };
type Template = { id: string; from_day: number; to_day: number; en_subject: string; en_body: string; zh_subject: string; zh_body: string };
type Client = { id: string; company_name: string; contact_person: string; email: string; language: string };

async function sendEmail(to: string, subject: string, text: string, replyTo: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, code: "no_key", error: "Email sending is not connected yet. Add the Resend key first." };
  const from = Deno.env.get("RESEND_FROM") ?? "Chai Siang <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
  });
  if (!res.ok) {
    let msg = `Email service said ${res.status}.`;
    try { const j = await res.json(); if (j?.message) msg = String(j.message); } catch { /* keep default */ }
    return { ok: false, code: "provider", error: msg };
  }
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400); }
  const action = String(body.action ?? "");

  // ---- who is calling ----
  const cronSecret = Deno.env.get("CRON_SECRET");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: auth, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !auth.user) return json({ error: "You are not signed in." }, 401);
    const { data: me } = await admin.from("profiles").select("role, active").eq("id", auth.user.id).maybeSingle();
    if (!me || !me.active) return json({ error: "Your login is switched off." }, 403);
    const { data: role } = await admin.from("roles").select("is_super").eq("name", me.role).maybeSingle();
    let allowed = !!role?.is_super;
    if (!allowed) {
      const { data: g } = await admin.from("role_permissions").select("allowed").eq("role", me.role).eq("permission", "finance_manage").maybeSingle();
      allowed = !!g?.allowed;
    }
    if (!allowed) return json({ error: "You do not have permission to send reminders." }, 403);
  }

  const { data: settings } = await admin.from("fin_settings").select("company_name, company_email, currency, auto_reminders, reminder_hour").eq("id", 1).single<Settings>();
  if (!settings) return json({ error: "Finance settings are missing." }, 500);
  const money = (n: number) => `${settings.currency} ${Number(n).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // ---- one reminder, written by the person ----
  if (action === "send") {
    if (isCron) return json({ error: "Not allowed." }, 403);
    const invoiceId = String(body.invoice_id ?? "");
    const subject = String(body.subject ?? "").trim();
    const text = String(body.body ?? "").trim();
    if (!invoiceId || !subject || !text) return json({ error: "Missing invoice, subject or message." }, 400);
    const { data: inv } = await admin.from("fin_invoices").select("id, client_id").eq("id", invoiceId).maybeSingle();
    if (!inv) return json({ error: "Invoice not found." }, 404);
    const { data: client } = await admin.from("fin_clients").select("email").eq("id", inv.client_id).single();
    if (!client?.email) return json({ ok: false, code: "no_email", error: "This client has no email address saved. Add one on the client page." }, 200);
    const r = await sendEmail(client.email, subject, text, settings.company_email);
    if (r.code === "no_key") return json({ ok: false, ...r }, 200);
    await admin.from("fin_reminders").insert({
      invoice_id: invoiceId, channel: "email", template: String(body.template ?? "") || null, lang: String(body.lang ?? "") || null, subject,
      status: r.ok ? "sent" : "failed", error: r.ok ? null : r.error, level: String(body.template ?? "") || null,
    });
    return json({ ok: r.ok, ...(r.ok ? {} : { code: r.code, error: r.error }) });
  }

  // ---- the daily check ----
  if (action === "daily") {
    if (isCron && (!settings.auto_reminders || mytHour() !== settings.reminder_hour)) return json({ ok: true, skipped: "Automatic reminders are off or it is not the chosen hour." });
    const today = myt();
    const { data: templates } = await admin.from("fin_reminder_templates").select("*").order("sort");
    const { data: invoices } = await admin.from("fin_invoices").select("id, invoice_no, client_id, due_date, balance_due, collection_notes, status")
      .gt("balance_due", 0).neq("status", "void").lt("due_date", today);
    const { data: clients } = await admin.from("fin_clients").select("id, company_name, contact_person, email, language");
    const { data: logs } = await admin.from("fin_reminders").select("invoice_id, created_at").eq("status", "sent");
    const lastSent = new Map<string, string>();
    for (const l of logs ?? []) { const d = myt(new Date(l.created_at)); if (!lastSent.get(l.invoice_id) || d > lastSent.get(l.invoice_id)!) lastSent.set(l.invoice_id, d); }
    const byClient = new Map((clients ?? []).map((c) => [c.id, c as Client]));

    const out = { sent: [] as string[], failed: [] as string[], skipped: [] as string[] };
    for (const inv of invoices ?? []) {
      const client = byClient.get(inv.client_id);
      if (/\bhold\b/i.test(inv.collection_notes ?? "")) { out.skipped.push(`${inv.invoice_no}: on hold`); continue; }
      if (!client?.email) { out.skipped.push(`${inv.invoice_no}: no client email`); continue; }
      const last = lastSent.get(inv.id);
      if (last && dayNum(today) - dayNum(last) < 7) { out.skipped.push(`${inv.invoice_no}: reminded in the last 7 days`); continue; }
      const days = dayNum(today) - dayNum(inv.due_date);
      const tpl = ((templates ?? []) as Template[]).find((t) => days >= t.from_day && days <= t.to_day) ?? (templates as Template[])[(templates ?? []).length - 1];
      const zh = client.language === "zh";
      const vars = { contact: client.contact_person || client.company_name, invoice_no: inv.invoice_no, amount: money(inv.balance_due), due_date: fmtDate(inv.due_date), days_overdue: String(days), company: settings.company_name };
      const subject = fill(zh ? tpl.zh_subject : tpl.en_subject, vars);
      const r = await sendEmail(client.email, subject, fill(zh ? tpl.zh_body : tpl.en_body, vars), settings.company_email);
      if (r.code === "no_key") return json({ ok: false, ...r, ...out }, 200);
      await admin.from("fin_reminders").insert({ invoice_id: inv.id, channel: "email", template: tpl.id, level: tpl.id, lang: zh ? "zh" : "en", subject, status: r.ok ? "sent" : "failed", error: r.ok ? null : r.error, auto: isCron });
      (r.ok ? out.sent : out.failed).push(inv.invoice_no);
    }
    return json({ ok: true, ...out });
  }

  return json({ error: "Unknown action." }, 400);
});
