"use client";
import Link from "next/link";
import { useAuth } from "@/components/auth";
import Login from "@/components/portal/Login";
import Store from "@/components/portal/Store";
import { usePortal } from "@/components/portal/usePortal";

function Message({ title, text, action }: { title: string; text: string; action: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0A1128] px-5 font-[family-name:var(--pt-body)] text-white">
      <div className="max-w-md text-center">
        <h1 className="font-[family-name:var(--pt-head)] text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-white/70">{text}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>
      </div>
    </main>
  );
}

function Shop({ userId, onLogout }: { userId: string; onLogout: () => void }) {
  const d = usePortal(userId);
  if (d.loading) return <Message title="Loading your catalogue…" text="One moment." action={null} />;
  if (!d.account) return <Message title="Your account is not active" text="Your login is not set up for ordering, or it has been switched off. Please contact your account manager." action={<button onClick={onLogout} className="rounded-md border border-white/30 px-4 py-2 font-medium hover:bg-white/10">Sign out</button>} />;
  return <Store data={{ account: d.account, products: d.products, orders: d.orders, creditUsed: d.creditUsed, place: d.place, storageKey: `portal-cart-${userId}` }} onLogout={onLogout} />;
}

export default function Portal() {
  const { session, profile, loading, signIn, signOut } = useAuth();
  if (loading) return <Message title="Loading…" text="" action={null} />;
  if (!session) return <Login onSignIn={async (email, password) => (await signIn(email, password)) ?? null} />;
  if (profile && profile.role !== "distributor") {
    return <Message title="This portal is for distributors" text="You are signed in with a staff login. Staff use the control centre." action={<><Link href="/" className="rounded-md bg-[#E11D48] px-4 py-2 font-semibold">Go to the control centre</Link><button onClick={() => void signOut()} className="rounded-md border border-white/30 px-4 py-2 font-medium hover:bg-white/10">Sign out</button></>} />;
  }
  return <Shop userId={session.user.id} onLogout={() => void signOut()} />;
}
