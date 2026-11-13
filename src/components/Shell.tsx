"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, TrendingUp, Users, Truck, FileText, Upload, Menu, X, Moon, Sun, LogOut, UserCog, ShieldCheck, KeyRound, Wallet, Receipt, Building2, Settings, HandCoins, PackageCheck, ClipboardCheck, ClipboardList } from "lucide-react";
import { RoleProvider, useRole } from "./role";
import { AuthProvider, useAuth } from "./auth";
import { DataProvider, useData } from "./data";
import { TODAY } from "@/lib/mock";

type Nav = { href: string; label: string; icon: typeof Users; perm: string };
const NAV: Nav[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "page_dashboard" },
  { href: "/sales", label: "Sales & KPI", icon: TrendingUp, perm: "page_sales" },
  { href: "/customers", label: "Customers & Credit", icon: Users, perm: "page_customers" },
  { href: "/logistics", label: "Logistics", icon: Truck, perm: "page_logistics" },
  { href: "/claims", label: "Claims (PAF)", icon: FileText, perm: "page_claims" },
  { href: "/upload", label: "Data Upload", icon: Upload, perm: "page_upload" },
  { href: "/my-orders", label: "My PO orders", icon: ClipboardList, perm: "page_po_mine" },
  { href: "/distributors", label: "Distributor orders", icon: PackageCheck, perm: "page_portal" },
];
const FIN_NAV: Nav[] = [
  { href: "/finance", label: "Overview", icon: Wallet, perm: "page_finance" },
  { href: "/finance/invoices", label: "Invoices", icon: Receipt, perm: "page_finance" },
  { href: "/finance/po", label: "PO & delivery", icon: ClipboardCheck, perm: "page_finance" },
  { href: "/finance/clients", label: "Clients", icon: Building2, perm: "page_finance" },
  { href: "/finance/ar", label: "Collections", icon: HandCoins, perm: "page_finance" },
  { href: "/finance/settings", label: "Settings", icon: Settings, perm: "finance_manage" },
];
// Admin pages follow the person's own permission, never a preview.
const ADMIN_NAV: Nav[] = [
  { href: "/users", label: "Users", icon: UserCog, perm: "users_manage" },
  { href: "/roles", label: "Roles & permissions", icon: ShieldCheck, perm: "roles_manage" },
];

function Inner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can, realCan, role, canPreview, roles, setRole, previewing, salesmanCode, setSalesmanCode, roleLabel } = useRole();
  const { salesmen, error, loading } = useData();
  const { profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  useEffect(() => {
    // Read the theme the page already applied before hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("cssb-theme", next ? "dark" : "light"); } catch {}
  };
  const items = [
    ...NAV.filter((n) => can(n.perm)),
    ...ADMIN_NAV.filter((n) => realCan(n.perm)),
    { href: "/account", label: "My account", icon: KeyRound, perm: "" },
  ];
  const finItems = FIN_NAV.filter((n) => can(n.perm));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : href === "/finance" ? pathname === "/finance" : pathname.startsWith(href));
  const link = (n: Nav, sub = false) => {
    const active = isActive(n.href);
    return (
      <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
        className={`flex items-center gap-3 border-l-4 py-3 pr-4 text-base ${sub ? "pl-7" : "pl-4"} ${active ? "border-signal bg-signal-soft font-medium text-slate-900" : "border-transparent text-slate-600 hover:bg-slate-100"}`}>
        <n.icon size={18} /> {n.label}
      </Link>
    );
  };
  const sel = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-base text-slate-700";

  return (
    <div className="flex min-h-screen text-slate-800">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 w-56 transform border-r border-slate-200 bg-white text-slate-700 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between gap-3 px-4 py-5">
          <div className="flex items-center gap-3">
            <span className="plate !px-2 font-display text-xl" aria-hidden>CS</span>
            <div className="leading-tight">
              <div className="text-[17px] font-semibold text-slate-900">Chai Siang</div>
              <div className="text-sm text-slate-500">Control centre</div>
            </div>
          </div>
          <button className="p-2 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="mt-2 max-h-[calc(100vh-5.5rem)] overflow-y-auto pb-4">
          {items.filter((n) => NAV.includes(n)).map((n) => link(n))}
          {finItems.length > 0 && (
            <div role="group" aria-label="Finance">
              <div className="mt-2 border-t border-slate-200 px-4 pb-1 pt-3 text-sm font-semibold text-slate-500">Finance</div>
              {finItems.map((n) => link(n, true))}
            </div>
          )}
          <div className="mt-2 border-t border-slate-200 pt-1">{items.filter((n) => !NAV.includes(n)).map((n) => link(n))}</div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
          <button className="-ml-1 p-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={24} /></button>
          <div className="text-sm text-slate-500">Data as of <span className="font-medium text-slate-800">{TODAY}, 08:20</span></div>
          <span className="rounded-sm bg-signal-soft px-1.5 py-0.5 text-xs font-medium text-slate-800 ring-1 ring-inset ring-signal/60" title="Sales, customers, claims and lorries are live. Aging, credit limits, collection, deliveries and November are still sample.">Live + sample data</span>
          <button onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className="ml-auto rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-100 sm:ml-0 sm:order-last">
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            {canPreview && (
              <>
                <label htmlFor="view-as" className="sr-only text-sm text-slate-500 sm:not-sr-only">View as</label>
                <select id="view-as" className={sel} value={role} onChange={(e) => setRole(e.target.value)} aria-label="View as role">
                  {roles.filter((r) => r.name !== "pending").map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
                </select>
                {previewing && !can("view_all_data") && (
                  <select className={sel} value={salesmanCode} onChange={(e) => setSalesmanCode(e.target.value)} aria-label="Salesperson">
                    {salesmen.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                  </select>
                )}
              </>
            )}
            <span className="text-sm text-slate-500">{profile?.full_name} · {roleLabel}</span>
          </div>
          <button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className="rounded-md border border-slate-300 p-2 text-slate-700 hover:bg-slate-100 sm:order-last"><LogOut size={18} /></button>
        </header>
        {previewing && <div className="border-b border-signal/40 bg-signal-soft px-4 py-1.5 text-sm text-slate-800">Previewing the app as <b>{roleLabel}</b>. You are still signed in as yourself, and the data rules are your own.</div>}
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">
          {error && <p role="alert" className="mb-4 rounded bg-rose-50 px-3 py-2 text-rose-800">Could not load some data: {error}</p>}
          {loading ? <p className="text-slate-500">Loading your data…</p> : children}
        </main>
      </div>
    </div>
  );
}

function Splash({ children }: { children?: ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center text-slate-600">{children ?? "Loading…"}</main>;
}

function Gate({ children }: { children: ReactNode }) {
  const { session, profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === "/login";
  useEffect(() => {
    if (loading) return;
    if (pathname.startsWith("/portal")) return;
    if (session && profile?.role === "distributor") { router.replace("/portal"); return; }
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) router.replace("/");
  }, [loading, session, profile, onLogin, pathname, router]);

  // The distributor portal preview is a separate, sample-only experience with its own screens.
  if (onLogin || pathname.startsWith("/portal")) return <>{children}</>;
  if (loading || !session || profile?.role === "distributor") return <Splash />;
  if (!profile || !profile.active || profile.role === "pending") {
    return (
      <Splash>
        <span className="plate font-display text-2xl" aria-hidden>CS</span>
        <h1 className="font-display text-3xl font-semibold text-slate-900">{profile && !profile.active ? "Your login is switched off" : "No access yet"}</h1>
        <p>{profile && !profile.active ? "Ask your administrator to switch it back on." : "Your login has no role yet. Ask your administrator to give you one."}</p>
        <button onClick={() => void signOut()} className="rounded-md border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-100">Sign out</button>
      </Splash>
    );
  }
  return <DataProvider><RoleProvider><Inner>{children}</Inner></RoleProvider></DataProvider>;
}

export default function Shell({ children }: { children: ReactNode }) {
  // Dynamic routes (invoice and client pages) read the URL at runtime, so the shell streams in behind a Suspense boundary.
  return <AuthProvider><Suspense fallback={<Splash />}><Gate>{children}</Gate></Suspense></AuthProvider>;
}
