"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { LayoutDashboard, TrendingUp, Users, Truck, FileText, Upload, Menu, X, Moon, Sun, LogOut, UserCog, ShieldCheck, KeyRound, Wallet, Receipt, Building2, Settings, HandCoins, PackageCheck, ClipboardCheck, ClipboardList, FileSpreadsheet, Database, PhoneCall, Home, Clock, CalendarPlus, History, CalendarDays, CheckSquare, UsersRound, IdCard, CalendarHeart, BarChart3, SlidersHorizontal } from "lucide-react";
import { RoleProvider, useRole } from "./role";
import { AuthProvider, useAuth } from "./auth";
import { DataProvider, useData } from "./data";

type Nav = { href: string; label: string; icon: typeof Users; perm: string; group?: string };
const NAV: Nav[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, perm: "page_dashboard", group: "Overview" },
  { href: "/sales", label: "Sales & KPI", icon: TrendingUp, perm: "page_sales", group: "Sales" },
  { href: "/customers", label: "Customers & Credit", icon: Users, perm: "page_customers", group: "Sales" },
  { href: "/followup", label: "Collection follow-up", icon: PhoneCall, perm: "page_customers", group: "Sales" },
  { href: "/claims", label: "Claims (PAF)", icon: FileText, perm: "page_claims", group: "Sales" },
  { href: "/my-orders", label: "My PO orders", icon: ClipboardList, perm: "page_po_mine", group: "Sales" },
  { href: "/distributors", label: "Distributor orders", icon: PackageCheck, perm: "page_portal", group: "Sales" },
  { href: "/logistics", label: "Logistics", icon: Truck, perm: "page_logistics", group: "Operations" },
  { href: "/upload", label: "Data upload", icon: Upload, perm: "page_upload", group: "Data" },
  { href: "/master", label: "Master data", icon: Database, perm: "page_master", group: "Data" },
  { href: "/test-run", label: "Real data test run", icon: FileSpreadsheet, perm: "page_upload", group: "Data" },
];
const FIN_NAV: Nav[] = [
  { href: "/finance", label: "Overview", icon: Wallet, perm: "page_finance" },
  { href: "/finance/invoices", label: "Invoices", icon: Receipt, perm: "page_finance" },
  { href: "/finance/sap-import", label: "SAP invoice import", icon: FileSpreadsheet, perm: "sap_import" },
  { href: "/finance/po", label: "PO & delivery", icon: ClipboardCheck, perm: "page_finance" },
  { href: "/finance/clients", label: "Clients", icon: Building2, perm: "page_finance" },
  { href: "/finance/ar", label: "Collections", icon: HandCoins, perm: "page_finance" },
  { href: "/finance/settings", label: "Settings", icon: Settings, perm: "finance_manage" },
];
// HR: leave and attendance. Everyone with a login uses "My HR"; managers and HR get the rest.
const HR_NAV: Nav[] = [
  { href: "/hr", label: "My HR", icon: Home, perm: "hr_self", group: "My HR" },
  { href: "/hr/clock", label: "Clock in / out", icon: Clock, perm: "hr_self", group: "My HR" },
  { href: "/hr/leave/apply", label: "Apply leave", icon: CalendarPlus, perm: "hr_self", group: "My HR" },
  { href: "/hr/leave", label: "My leave", icon: History, perm: "hr_self", group: "My HR" },
  { href: "/hr/calendar", label: "Team leave calendar", icon: CalendarDays, perm: "hr_self", group: "My HR" },
  { href: "/hr/approvals", label: "Leave approvals", icon: CheckSquare, perm: "hr_approve", group: "HR management" },
  { href: "/hr/team", label: "Team overview", icon: UsersRound, perm: "hr_approve", group: "HR management" },
  { href: "/hr/admin/employees", label: "Employees", icon: IdCard, perm: "hr_admin", group: "HR management" },
  { href: "/hr/admin/holidays", label: "Public holidays", icon: CalendarHeart, perm: "hr_admin", group: "HR management" },
  { href: "/hr/admin/reports", label: "HR reports", icon: BarChart3, perm: "hr_admin", group: "HR management" },
  { href: "/hr/admin/settings", label: "HR settings", icon: SlidersHorizontal, perm: "hr_admin", group: "HR management" },
];
// Admin pages follow the person's own permission, never a preview.
const ADMIN_NAV: Nav[] = [
  { href: "/users", label: "Users", icon: UserCog, perm: "users_manage" },
  { href: "/roles", label: "Roles & permissions", icon: ShieldCheck, perm: "roles_manage" },
];

function Inner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { can, realCan, role, canPreview, roles, setRole, previewing, salesmanCode, setSalesmanCode, roleLabel } = useRole();
  const { salesmen, error, loading, asAt } = useData();
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
  const hrItems = HR_NAV.filter((n) => can(n.perm));
  const isActive = (href: string) => (href === "/" ? pathname === "/" : href === "/finance" || href === "/hr" || href === "/hr/leave" ? pathname === href : pathname.startsWith(href));
  const link = (n: Nav) => {
    const active = isActive(n.href);
    return (
      <Link key={n.href} href={n.href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}
        className={`relative mx-2 flex items-center gap-3 rounded-md px-3 py-2 text-[15px] transition-colors ${active ? "bg-white/10 font-medium text-white" : "text-white/65 hover:bg-white/5 hover:text-white"}`}>
        {active && <span aria-hidden className="absolute -left-2 bottom-1.5 top-1.5 w-[3px] rounded-r bg-signal" />}
        <n.icon size={17} className={active ? "text-signal" : "text-white/50"} /> {n.label}
      </Link>
    );
  };
  const section = (label: string, list: Nav[]) => list.length > 0 && (
    <div key={label} role="group" aria-label={label} className="mt-5 first:mt-1">
      <div className="px-5 pb-1.5 text-xs font-medium text-white/40">{label}</div>
      <div className="space-y-0.5">{list.map((n) => link(n))}</div>
    </div>
  );
  const groups = ["Overview", "Sales", "Operations", "Data"];
  const mainItems = items.filter((n) => NAV.includes(n));
  const current = [...NAV, ...FIN_NAV, ...HR_NAV, ...ADMIN_NAV, { href: "/account", label: "My account", icon: KeyRound, perm: "" }].filter((n) => isActive(n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const initials = (profile?.full_name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const asAtText = asAt ? new Date(asAt + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;
  const sel = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700";
  const iconBtn = "rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900";

  return (
    <div className="flex min-h-screen text-slate-800">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-60 transform flex-col bg-rail text-white transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="plate !px-1.5 font-display text-lg" aria-hidden>CS</span>
            <div className="leading-tight">
              <div className="text-[15px] font-semibold text-white">Chai Siang</div>
              <div className="text-xs text-white/55">Control centre</div>
            </div>
          </div>
          <button className="p-2 text-white/70 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={20} /></button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {groups.map((g) => section(g, mainItems.filter((n) => n.group === g)))}
          {section("Finance", finItems)}
          {section("My HR", hrItems.filter((n) => n.group === "My HR"))}
          {section("HR management", hrItems.filter((n) => n.group === "HR management"))}
          {section("Admin", items.filter((n) => !NAV.includes(n)))}
        </nav>
        <div className="border-t border-white/10 px-5 py-3 text-xs text-white/45">Chai Siang Sdn Bhd</div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur sm:px-6">
          <button className="-ml-1 rounded-md p-2 text-slate-700 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={22} /></button>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-slate-900">{current?.label ?? "Chai Siang"}</div>
            {asAtText && <div className="text-xs text-slate-500">Data as of {asAtText}</div>}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {canPreview && (
              <>
                <label htmlFor="view-as" className="sr-only text-sm text-slate-500 md:not-sr-only">View as</label>
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
            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
              <span aria-hidden className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{initials}</span>
              <div className="leading-tight">
                <div className="text-sm font-medium text-slate-800">{profile?.full_name}</div>
                <div className="text-xs text-slate-500">{roleLabel}</div>
              </div>
            </div>
            <button onClick={toggleTheme} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"} className={iconBtn}>
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button onClick={() => void signOut()} aria-label="Sign out" title="Sign out" className={iconBtn}><LogOut size={17} /></button>
          </div>
        </header>
        {previewing && <div className="border-b border-signal/40 bg-signal-soft px-4 py-1.5 text-sm text-slate-800">Previewing the app as <b>{roleLabel}</b>. You are still signed in as yourself, and the data rules are your own.</div>}
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-8 sm:py-7">
          {error && <p role="alert" className="mb-4 rounded bg-rose-50 px-3 py-2 text-rose-800">Could not load some data: {error}</p>}
          {loading ? <p className="flex items-center gap-2 text-slate-500"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-600" aria-hidden /> Loading your data…</p> : children}
        </main>
      </div>
    </div>
  );
}

function Splash({ children }: { children?: ReactNode }) {
  return <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-3 px-4 text-center text-slate-600">{children ?? "Loading…"}</main>;
}

function Gate({ children }: { children: ReactNode }) {
  const { session, profile, loading, signOut, realCan } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname === "/login";
  useEffect(() => {
    if (loading) return;
    if (pathname.startsWith("/portal")) return;
    if (session && profile?.role === "distributor") { router.replace("/portal"); return; }
    // Colgate (principal) only ever sees the Claims page and their own account.
    if (session && profile?.role === "principal" && pathname !== "/claims" && pathname !== "/account" && !onLogin) { router.replace("/claims"); return; }
    // HR-only staff (no sales dashboard) start on their own HR page
    if (session && pathname === "/" && !realCan("page_dashboard") && realCan("hr_self")) { router.replace("/hr"); return; }
    if (!session && !onLogin) router.replace("/login");
    if (session && onLogin) router.replace("/");
  }, [loading, session, profile, onLogin, pathname, router, realCan]);

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
