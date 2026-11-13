"use client";
import { useRef, useState } from "react";
import { ArrowRight, Loader2, Lock, UserRound } from "lucide-react";
import CleanGlassCanvas from "./CleanGlassCanvas";

const LINES = [["Next-Gen", "FMCG", "Distribution."], ["Powered", "by", "Predictive", "AI."]];

export default function Login({ onSignIn, notice }: { onSignIn: (email: string, password: string) => Promise<string | null>; notice?: string }) {
  const [id, setId] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!id.trim() || !pw) { setErr(!id.trim() ? "Enter your email address." : "Enter your password."); return; }
    setErr(null);
    setBusy(true);
    const problem = await onSignIn(id.trim(), pw);
    if (problem) { setErr(problem); setBusy(false); }
  }
  // Magnetic hover: the button leans toward the cursor.
  function lean(e: React.PointerEvent<HTMLButtonElement>) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = btn.current!, r = el.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / r.width, dy = (e.clientY - (r.top + r.height / 2)) / r.height;
    el.style.transform = `translate(${dx * 14}px, ${dy * 10}px)`;
  }
  const settle = () => { if (btn.current) btn.current.style.transform = ""; };

  const field = "w-full select-text rounded-md border border-white/20 bg-white/10 py-3 pl-10 pr-3 text-base text-white placeholder:text-white/45 outline-none transition focus:border-[#E11D48] focus:bg-white/15 focus:ring-2 focus:ring-[#E11D48]/40";
  let n = 0;
  return (
    <main className="relative min-h-screen select-none overflow-hidden bg-[#0A1128] font-[family-name:var(--pt-body)] text-white">
      <div className="absolute inset-0"><CleanGlassCanvas /></div>
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center justify-center px-5 py-10">
        <h1 className="text-center font-[family-name:var(--pt-head)] text-[clamp(2rem,5.2vw,3.75rem)] font-extrabold leading-[1.08] tracking-tight">
          {LINES.map((line, li) => (
            <span key={li} className="block">
              {line.map((word) => (
                <span key={word + n} className="pl-word mr-[0.28em] last:mr-0" style={{ "--i": n++ } as React.CSSProperties}>{word}</span>
              ))}
            </span>
          ))}
        </h1>
        <svg className="mt-4 h-2 w-56 sm:w-80" viewBox="0 0 320 8" fill="none" aria-hidden>
          <path className="pl-draw" d="M2 4 C 60 0, 100 8, 160 4 S 260 0, 318 4" stroke="#E11D48" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
        <p className="pl-fade mt-4 max-w-md text-center text-[15px] text-white/70" style={{ "--i": 9 } as React.CSSProperties}>Order cartons, track credit and reorder in seconds, from one secure distributor portal.</p>

        <form onSubmit={submit} className="pl-fade mt-8 w-full max-w-[400px] rounded-lg border border-white/15 bg-white/[0.07] p-6 shadow-2xl shadow-black/30 backdrop-blur-[16px]" style={{ "--i": 11 } as React.CSSProperties}>
          <h2 className="font-[family-name:var(--pt-head)] text-xl font-bold">Distributor sign in</h2>
          <label className="mt-4 block text-sm font-medium text-white/80">Email address
            <span className="relative mt-1.5 block"><UserRound size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" /><input className={field} type="email" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" placeholder="you@yourcompany.com" /></span>
          </label>
          <label className="mt-3 block text-sm font-medium text-white/80">Password
            <span className="relative mt-1.5 block"><Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" /><input className={field} type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" placeholder="Your password" /></span>
          </label>
          {notice && !err && <p role="status" className="mt-3 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white/90">{notice}</p>}
          {err && <p role="alert" className="mt-3 rounded-md border border-[#E11D48]/50 bg-[#E11D48]/15 px-3 py-2 text-sm text-rose-100">{err}</p>}
          <button ref={btn} onPointerMove={lean} onPointerLeave={settle} disabled={busy}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#E11D48] px-4 py-3 text-base font-semibold text-white shadow-[0_0_28px_rgba(225,29,72,0.45)] transition duration-150 ease-out hover:bg-[#F0224F] hover:shadow-[0_0_40px_rgba(225,29,72,0.65)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-80">
            {busy ? <><Loader2 size={18} className="animate-spin" /> Signing in…</> : <>Access Portal <ArrowRight size={18} /></>}
          </button>
          <p className="mt-4 text-center text-xs text-white/55">Accounts are created by your account manager. Forgot your password? Ask them to reset it.</p>
        </form>
      </div>
    </main>
  );
}
