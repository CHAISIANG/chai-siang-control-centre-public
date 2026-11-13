"use client";
import { useState } from "react";
import { useAr, type DailyResult } from "@/components/ar";
import { btnGhost, btnPrimary, inputCls } from "@/components/finui";
import { Card, PageHeader } from "@/components/ui";
import { balanceOf, daysPastDue, fillTemplate, type TemplateId } from "@/lib/ar";
import { money } from "@/lib/finance";

const sample = { contact: "Mr Tan", invoice_no: "INV-2026-0107", amount: "RM 10,250.00", due_date: "05 Oct 2026", days_overdue: "9", company: "Your company" };
const toneCls = ["border-emerald-300", "border-yellow-300", "border-orange-300", "border-rose-300"];

export default function Reminders() {
  const { templates, saveTemplate, dueToday, runDaily, setAuto, autoOn, reminderHour, canManage, customer, today, currency } = useAr();
  const [lang, setLang] = useState<"en" | "zh">("en");
  const [editing, setEditing] = useState<TemplateId | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ran, setRan] = useState<DailyResult | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const waiting = dueToday();
  const seg = "rounded-md border px-3 py-1.5 text-sm font-medium";
  const tplName = (id: TemplateId) => templates.find((t) => t.id === id)?.name ?? id;

  function startEdit(id: TemplateId) {
    const t = templates.find((x) => x.id === id)!;
    setEditing(id); setSubject(t[lang].subject); setBody(t[lang].body);
  }
  async function toggleAuto(on: boolean, hour: number) {
    setErr(null);
    setErr(await setAuto(on, hour));
  }
  async function run() {
    setBusy(true); setRan(null); setConfirmRun(false);
    setRan(await runDaily());
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Reminder templates" sub="Four messages, from friendly to firm. Each is used automatically for invoices of the matching age."
        right={<div className="flex gap-2"><button className={`${seg} ${lang === "en" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600"}`} onClick={() => { setLang("en"); setEditing(null); }}>English</button><button className={`${seg} ${lang === "zh" ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 text-slate-600"}`} onClick={() => { setLang("zh"); setEditing(null); }}>中文</button></div>} />

      <Card title="Automatic reminders" className="mb-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <label className="inline-flex items-center gap-2 text-base"><input type="checkbox" checked={autoOn} disabled={!canManage} onChange={(e) => void toggleAuto(e.target.checked, reminderHour)} className="h-4 w-4" /> Check every day and send reminders</label>
          <label className="inline-flex items-center gap-2 text-base text-slate-600">at
            <select aria-label="Hour" value={reminderHour} disabled={!canManage} onChange={(e) => void toggleAuto(autoOn, Number(e.target.value))} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-800 disabled:opacity-50">
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}
            </select> Malaysia time</label>
        </div>
        {err && <p role="alert" className="mt-2 rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
        <p className="mt-3 text-sm text-slate-500">Each day, every overdue invoice whose client has an email gets the template for its age, but never more than one reminder every 7 days. Invoices with a note containing &ldquo;hold&rdquo; are skipped. This is <b>{autoOn ? "on" : "off"}</b>; it is off until you switch it on.</p>
        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!confirmRun
              ? <button className={btnPrimary} disabled={busy || waiting.length === 0} onClick={() => setConfirmRun(true)}>{busy ? "Sending…" : "Run today's check now"}</button>
              : <><span className="font-medium text-slate-800">Send {waiting.length} real email{waiting.length === 1 ? "" : "s"} to clients now?</span><button className={btnPrimary} onClick={() => void run()}>Yes, send</button><button className={btnGhost} onClick={() => setConfirmRun(false)}>Cancel</button></>}
            <span className="text-slate-600">{waiting.length === 0 ? "Nothing is waiting: every overdue invoice was reminded within 7 days, has no client email, or is on hold." : `${waiting.length} reminder${waiting.length === 1 ? "" : "s"} would go out today.`}</span>
          </div>
        )}
        {confirmRun && (
          <ul className="mt-2 text-sm text-slate-600">{waiting.map((w) => <li key={w.inv.id}>{w.inv.no} · {customer(w.inv.customerId).name} · {money(balanceOf(w.inv), currency)} · {daysPastDue(w.inv, today)} days late → {tplName(w.template)}</li>)}</ul>
        )}
        {ran && (
          ran.ok ? (
            <div role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-emerald-900">
              <b>{ran.sent.length} sent{ran.failed.length ? `, ${ran.failed.length} failed` : ""}.</b>
              {ran.sent.length > 0 && <div className="text-sm">Sent: {ran.sent.join(", ")}</div>}
              {ran.failed.length > 0 && <div className="text-sm text-rose-800">Failed: {ran.failed.join(", ")} (see each invoice&rsquo;s history)</div>}
              {ran.skipped.length > 0 && <div className="text-sm text-slate-600">Skipped: {ran.skipped.join("; ")}</div>}
            </div>
          ) : <p role="alert" className="mt-3 rounded bg-rose-50 px-3 py-2 text-rose-800">{ran.error ?? "The check could not run."}{ran.sent.length ? ` ${ran.sent.length} were sent before it stopped.` : ""}</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {templates.map((t, n) => (
          <section key={t.id} className={`rounded-xl border border-l-4 bg-white ${toneCls[n] ?? ""}`}>
            <div className="border-b border-slate-200 px-4 py-2.5">
              <h2 className="text-base font-semibold text-slate-800">{n + 1}. {t.name}</h2>
              <p className="text-sm text-slate-500">{t.tone} · used {t.when}</p>
            </div>
            <div className="space-y-2 p-4">
              {editing === t.id ? (
                <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const r = await saveTemplate(t.id, lang, subject, body); setBusy(false); setErr(r); if (!r) setEditing(null); }}>
                  <label className="block text-sm font-medium text-slate-600">Subject<input className={inputCls} value={subject} onChange={(e) => setSubject(e.target.value)} required /></label>
                  <label className="block text-sm font-medium text-slate-600">Message<textarea rows={10} className={inputCls + " text-sm"} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
                  <p className="text-xs text-slate-500">Keep the words in curly brackets, such as {"{contact}"}, {"{invoice_no}"}, {"{amount}"}, {"{due_date}"}, {"{days_overdue}"} and {"{company}"}. They are filled in for each customer.</p>
                  <div className="flex gap-2"><button disabled={busy} className={btnPrimary + " !py-1.5 !text-sm"}>{busy ? "Saving…" : "Save wording"}</button><button type="button" className={btnGhost + " !py-1.5 !text-sm"} onClick={() => setEditing(null)}>Cancel</button></div>
                </form>
              ) : (
                <>
                  <div className="text-sm"><span className="text-slate-500">Subject: </span><span className="font-medium">{fillTemplate(t[lang].subject, sample)}</span></div>
                  <pre className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-sm text-slate-700">{fillTemplate(t[lang].body, sample)}</pre>
                  {canManage && <button className="text-sm font-medium text-indigo-600 hover:underline" onClick={() => startEdit(t.id)}>Edit {lang === "en" ? "English" : "Chinese"} wording</button>}
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
