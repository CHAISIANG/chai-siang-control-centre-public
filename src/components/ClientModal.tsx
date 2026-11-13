"use client";
import { useState } from "react";
import { btnGhost, btnPrimary, Field, inputCls, Modal } from "./finui";
import { supabase } from "@/lib/supabase";
import type { FinClient } from "@/lib/finance";

export default function ClientModal({ client, onClose, onSaved }: { client?: FinClient; onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const [f, setF] = useState({ company_name: client?.company_name ?? "", contact_person: client?.contact_person ?? "", email: client?.email ?? "", phone: client?.phone ?? "", address: client?.address ?? "", notes: client?.notes ?? "", language: (client?.language ?? "en") as "en" | "zh" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.company_name.trim()) return setErr("Enter the company name.");
    setBusy(true); setErr(null);
    const body = { ...f, company_name: f.company_name.trim() };
    const r = client
      ? await supabase.from("fin_clients").update(body).eq("id", client.id).select("id").single()
      : await supabase.from("fin_clients").insert(body).select("id").single();
    if (r.error) { setBusy(false); return setErr(r.error.message); }
    await onSaved(r.data.id as string);
    onClose();
  }
  return (
    <Modal title={client ? "Edit client" : "New client"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Company name"><input className={inputCls} value={f.company_name} onChange={set("company_name")} autoFocus required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact person"><input className={inputCls} value={f.contact_person} onChange={set("contact_person")} /></Field>
          <Field label="Phone"><input className={inputCls} value={f.phone} onChange={set("phone")} /></Field>
        </div>
        <Field label="Email (for reminders)"><input type="email" className={inputCls} value={f.email} onChange={set("email")} /></Field>
        <Field label="Reminder language"><select className={inputCls} value={f.language} onChange={set("language")}><option value="en">English</option><option value="zh">中文</option></select></Field>
        <Field label="Address"><textarea rows={3} className={inputCls} value={f.address} onChange={set("address")} /></Field>
        <Field label="Notes"><input className={inputCls} value={f.notes} onChange={set("notes")} /></Field>
        {err && <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
        <div className="flex gap-3"><button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Save client"}</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}
