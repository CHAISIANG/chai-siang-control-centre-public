"use client";
import { useState } from "react";
import { useAuth } from "@/components/auth";
import { Card, PageHeader } from "@/components/ui";
import { supabase } from "@/lib/supabase";

export default function AccountPage() {
  const { session, profile, roleInfo } = useAuth();
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function change(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) { setMsg({ ok: false, text: "Use at least 8 characters." }); return; }
    if (pw !== again) { setMsg({ ok: false, text: "The two passwords do not match." }); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Password changed." });
    if (!error) { setPw(""); setAgain(""); }
    setBusy(false);
  }

  const input = "mt-1 w-full max-w-sm rounded-md border border-slate-300 bg-white px-3 py-2 text-base text-slate-800";
  return (
    <>
      <PageHeader title="My account" />
      <Card title="Your login">
        <dl className="grid max-w-md grid-cols-3 gap-y-2 text-base">
          <dt className="text-slate-500">Name</dt><dd className="col-span-2 font-medium text-slate-900">{profile?.full_name ?? "—"}</dd>
          <dt className="text-slate-500">Email</dt><dd className="col-span-2 font-medium text-slate-900">{session?.user.email}</dd>
          <dt className="text-slate-500">Role</dt><dd className="col-span-2 font-medium text-slate-900">{roleInfo?.label ?? profile?.role}</dd>
        </dl>
      </Card>
      <Card title="Change password" className="mt-5">
        <form onSubmit={change}>
          <label className="block text-sm font-medium text-slate-600">New password<input className={input} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
          <label className="mt-3 block text-sm font-medium text-slate-600">Type it again<input className={input} type="password" value={again} onChange={(e) => setAgain(e.target.value)} autoComplete="new-password" /></label>
          {msg && <p role={msg.ok ? "status" : "alert"} className={`mt-3 max-w-sm rounded px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}
          <button disabled={busy} className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-base font-medium text-white hover:bg-indigo-700 disabled:opacity-50">{busy ? "Saving…" : "Change password"}</button>
        </form>
      </Card>
    </>
  );
}
