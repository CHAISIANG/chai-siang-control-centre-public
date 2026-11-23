"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Lock, UserRound } from "lucide-react";
import CleanGlassCanvas from "@/components/portal/CleanGlassCanvas";
import { useAuth } from "@/components/auth";
import { toLoginEmail, validCode } from "@/lib/staffLogin";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = email.trim();
    if (!id.includes("@") && !validCode(id)) { setError("Enter your username (letters and numbers only) or your email."); return; }
    setBusy(true); setError(null);
    const err = await signIn(toLoginEmail(id), password);
    // the same message for both, so nobody can tell which staff codes exist
    if (err) setError(/invalid login/i.test(err) ? "That username or email and password do not match." : err); else router.replace("/");
    setBusy(false);
  }

  // Colours are explicit (not theme tokens) so the page looks the same in light and dark mode.
  const field = "w-full select-text rounded-md border border-white/20 bg-white/10 py-3 pl-10 pr-3 text-base text-white placeholder:text-white/45 outline-none transition focus:border-[#7FB2E5] focus:bg-white/15 focus:ring-2 focus:ring-[#7FB2E5]/40";
  return (
    <main className="relative min-h-screen select-none overflow-hidden bg-[#0A1128] text-white">
      <div className="absolute inset-0"><CleanGlassCanvas /></div>
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
        <div className="pl-fade mb-6 flex items-center gap-3" style={{ "--i": 0 } as React.CSSProperties}>
          <span className="plate font-display text-2xl" aria-hidden>CS</span>
          <div>
            <h1 className="font-display text-4xl font-semibold leading-none">Chai Siang</h1>
            <p className="mt-0.5 text-white/70">Control centre</p>
          </div>
        </div>
        <form onSubmit={submit} className="pl-fade rounded-lg border border-white/15 bg-white/[0.07] p-6 shadow-2xl shadow-black/30 backdrop-blur-[16px]" style={{ "--i": 3 } as React.CSSProperties}>
          <h2 className="font-display text-3xl font-semibold">Sign in</h2>
          <label className="mt-4 block text-sm font-medium text-white/80">Username or email
            <span className="relative mt-1.5 block"><UserRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" /><input className={field} type="text" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" placeholder="Username, e.g. 10023, or email" /></span>
          </label>
          <label className="mt-4 block text-sm font-medium text-white/80">Password
            <span className="relative mt-1.5 block"><Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" /><input className={field} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /></span>
          </label>
          {error && <p role="alert" className="mt-3 rounded-md border border-[#E11D48]/50 bg-[#E11D48]/15 px-3 py-2 text-sm text-rose-100">{error}</p>}
          <button disabled={busy} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#2F6DB5] px-4 py-3 text-base font-semibold text-white shadow-[0_0_28px_rgba(47,109,181,0.5)] transition hover:bg-[#3A7CC8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-80">
            {busy ? <><Loader2 size={18} className="animate-spin" /> Please wait…</> : <>Sign in <ArrowRight size={18} /></>}
          </button>
          <p className="mt-4 text-sm text-white/60">Logins are created by your administrator. If you forgot your password, ask them to reset it.</p>
        </form>
      </div>
    </main>
  );
}
