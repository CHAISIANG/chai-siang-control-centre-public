"use client";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, History, LayoutGrid, ListChecks, Repeat, LogOut, Menu, Minus, PackageCheck, Plus, Search, ShoppingCart, SlidersHorizontal, Trash2, X } from "lucide-react";
import ProductArt from "./ProductArt";
import { CATEGORIES, cartonNet, cartonPrice, lineSaving, lineTotal, rm, stockState, tierPct, type Account, type Category, type Order, type Product } from "./data";
import type { PlaceResult } from "./usePortal";

const RED = "#D9232E";
const MINT = "#00A88F";
const mono = "font-[family-name:var(--pt-mono)]";
const head = "font-[family-name:var(--pt-head)]";

type Cart = Record<string, number>;
const clamp = (n: number, p: Product) => Math.max(0, Math.min(Math.floor(n) || 0, p.stock));

function Stepper({ value, onChange, max, small = false, label }: { value: number; onChange: (n: number) => void; max: number; small?: boolean; label: string }) {
  const b = `grid place-items-center border border-[#E2E8F0] bg-white text-slate-700 transition hover:bg-[#F4F6F9] disabled:opacity-40 ${small ? "h-8 w-8" : "h-10 w-10"}`;
  return (
    <div className="inline-flex items-center" role="group" aria-label={label}>
      <button className={`${b} rounded-l-[6px]`} aria-label="One fewer carton" disabled={value <= 0} onClick={() => onChange(value - 1)}><Minus size={small ? 14 : 16} /></button>
      <input aria-label="Cartons" inputMode="numeric" className={`${mono} border-y border-[#E2E8F0] bg-white text-center text-slate-900 outline-none focus:ring-2 focus:ring-[#D9232E]/40 ${small ? "h-8 w-11 text-sm" : "h-10 w-14 text-base"}`}
        value={value} onChange={(e) => onChange(Math.min(max, Math.max(0, Number(e.target.value.replace(/\D/g, "")) || 0)))} />
      <button className={`${b} rounded-r-[6px]`} aria-label="One more carton" disabled={value >= max} onClick={() => onChange(value + 1)}><Plus size={small ? 14 : 16} /></button>
    </div>
  );
}

function StockBadge({ p }: { p: Product }) {
  const s = stockState(p);
  const cls = s === "in" ? `bg-[#00A88F]/10 text-[#007A68] ring-[#00A88F]/30` : s === "low" ? "bg-amber-50 text-amber-800 ring-amber-300" : "bg-slate-100 text-slate-500 ring-slate-300";
  return <span className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${cls}`}><i className="h-1.5 w-1.5 rounded-full" style={{ background: s === "in" ? MINT : s === "low" ? "#D97706" : "#94A3B8" }} />{s === "in" ? "In Stock" : s === "low" ? `Low: ${p.stock} cartons` : "Out of stock"}</span>;
}

export type StoreData = { account: Account; products: Product[]; orders: Order[]; creditUsed: number; place: (lines: { sku: string; n: number }[]) => Promise<PlaceResult>; storageKey: string };

export default function Store({ data, onLogout }: { data: StoreData; onLogout: () => void }) {
  const { account, products, orders, creditUsed, place: placeOrder, storageKey } = data;
  const [cart, setCart] = useState<Cart>(() => {
    try { const raw = localStorage.getItem(storageKey); return raw ? (JSON.parse(raw) as Cart) : {}; } catch { return {}; }
  });
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [flag, setFlag] = useState<"all" | "promo" | "bundle">("all");
  const [tab, setTab] = useState<"catalog" | "quick" | "orders">("catalog");
  const [cartOpen, setCartOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [quick, setQuick] = useState<Record<string, number>>({});
  const [placed, setPlaced] = useState<{ ref: string; total: number; cartons: number } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeErr, setPlaceErr] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(cart)); } catch { /* private mode: the cart just will not persist */ } }, [cart, storageKey]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setCartOpen(false); setFiltersOpen(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const term = q.trim().toLowerCase();
  const list = useMemo(() => products.filter((p) =>
    (cat === "all" || p.category === cat) && (flag === "all" || (flag === "promo" ? !!p.promo : !!p.bundle)) &&
    (!term || `${p.sku} ${p.barcode} ${p.name}`.toLowerCase().includes(term))), [products, cat, flag, term]);

  const lines = Object.entries(cart).filter(([sku, n]) => n > 0 && products.some((x) => x.sku === sku)).map(([sku, n]) => ({ p: products.find((x) => x.sku === sku)!, n: Math.min(n, products.find((x) => x.sku === sku)!.stock) })).filter((l) => l.n > 0);
  const cartons = lines.reduce((s, l) => s + l.n, 0);
  const units = lines.reduce((s, l) => s + l.n * l.p.perCarton, 0);
  const gross = lines.reduce((s, l) => s + cartonPrice(l.p) * l.n, 0);
  const total = lines.reduce((s, l) => s + lineTotal(l.p, l.n), 0);
  const saving = lines.reduce((s, l) => s + lineSaving(l.p, l.n), 0);
  const available = account.creditLimit - creditUsed;
  const over = total > available;
  const usedPct = Math.min(100, ((creditUsed + total) / account.creditLimit) * 100);

  const setLine = (p: Product, n: number) => setCart((c) => { const next = { ...c }; const v = clamp(n, p); if (v === 0) delete next[p.sku]; else next[p.sku] = v; return next; });
  const note = (t: string) => { setToast(t); window.setTimeout(() => setToast(null), 2200); };
  const addCartons = (p: Product, n: number) => { if (n < 1) return; setLine(p, (cart[p.sku] ?? 0) + n); note(`${n} carton${n > 1 ? "s" : ""} of ${p.name} added`); };
  const addQuick = () => {
    setCart((c) => { const next = { ...c }; for (const [sku, n] of Object.entries(quick)) { const p = products.find((x) => x.sku === sku)!; const v = clamp((next[sku] ?? 0) + n, p); if (n > 0 && v > 0) next[sku] = v; } return next; });
    setQuick({}); note("Quick order added to your cart"); setCartOpen(true);
  };
  const place = async () => {
    setPlacing(true); setPlaceErr(null);
    const r = await placeOrder(lines.map((l) => ({ sku: l.p.sku, n: l.n })));
    setPlacing(false);
    if (!r.ok) return setPlaceErr(r.error);
    setPlaced({ ref: r.ref, total: r.total, cartons: r.cartons });
    setCart({});
  };
  const reorder = (o: Order) => {
    let skipped = 0;
    setCart((c) => {
      const next = { ...c };
      for (const l of o.lines) {
        const p = products.find((x) => x.sku === l.sku);
        if (!p) { skipped++; continue; }
        const before = next[l.sku] ?? 0;
        const v = clamp(before + l.n, p);
        if (v > before) next[l.sku] = v; else skipped++;
      }
      return next;
    });
    note(`Order ${o.ref} added to your cart${skipped ? `, ${skipped} item${skipped > 1 ? "s" : ""} out of stock` : ""}`);
    setCartOpen(true);
  };

  const quickTotal = Object.entries(quick).reduce((s, [sku, n]) => s + lineTotal(products.find((x) => x.sku === sku)!, n), 0);
  const quickCartons = Object.values(quick).reduce((s, n) => s + n, 0);

  const Sidebar = (
    <nav aria-label="Categories" className="space-y-5">
      <div>
        <button onClick={() => { setCat("all"); setFiltersOpen(false); }} className={`flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[15px] font-semibold ${cat === "all" ? "bg-[#D9232E] text-white" : "text-slate-800 hover:bg-[#F4F6F9]"}`}>All products <span className={`${mono} text-xs ${cat === "all" ? "text-white/80" : "text-slate-400"}`}>{products.length}</span></button>
      </div>
      {CATEGORIES.map((g) => (
        <div key={g.group}>
          <div className={`${head} px-3 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400`}>{g.group}</div>
          {g.items.map((c) => (
            <button key={c} onClick={() => { setCat(c); setFiltersOpen(false); }} className={`flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[15px] ${cat === c ? "bg-[#D9232E] font-semibold text-white" : "text-slate-700 hover:bg-[#F4F6F9]"}`}>
              {c} <span className={`${mono} text-xs ${cat === c ? "text-white/80" : "text-slate-400"}`}>{products.filter((p) => p.category === c).length}</span>
            </button>
          ))}
        </div>
      ))}
      <div>
        <div className={`${head} px-3 pb-1 text-xs font-bold uppercase tracking-wider text-slate-400`}>Offers</div>
        {([["all", "All offers"], ["promo", "Promotions"], ["bundle", "Bundles"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => { setFlag(k); setFiltersOpen(false); }} className={`flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-[15px] ${flag === k ? "bg-[#00A88F]/12 font-semibold text-[#007A68]" : "text-slate-700 hover:bg-[#F4F6F9]"}`}>
            {label} {k !== "all" && <span className={`${mono} text-xs text-slate-400`}>{products.filter((p) => (k === "promo" ? p.promo : p.bundle)).length}</span>}
          </button>
        ))}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen bg-[#F4F6F9] font-[family-name:var(--pt-body)] text-slate-800">
      {/* Utility bar */}
      <header className="sticky top-0 z-30 border-b border-[#E2E8F0] bg-white">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-5">
          <button className="grid h-10 w-10 place-items-center rounded-[6px] border border-[#E2E8F0] lg:hidden" aria-label="Open categories" onClick={() => setFiltersOpen(true)}><Menu size={20} /></button>
          <div className="flex items-center gap-2.5">
            <span className={`${head} grid h-9 w-9 place-items-center rounded-[6px] bg-[#D9232E] text-sm font-extrabold text-white`} aria-hidden>CS</span>
            <div className="hidden leading-tight sm:block"><div className={`${head} text-[15px] font-bold text-slate-900`}>Wholesale Portal</div><div className="text-xs text-slate-500">{account.company}</div></div>
          </div>
          <label className="relative order-last w-full md:order-none md:max-w-xl md:flex-1">
            <span className="sr-only">Search by SKU, barcode or product</span>
            <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={(e) => { setQ(e.target.value); if (tab === "quick") return; }} placeholder="Search SKU, barcode or product name" className={`w-full rounded-[6px] border border-[#E2E8F0] bg-[#F4F6F9] py-2.5 pl-10 pr-9 text-[15px] outline-none focus:border-[#D9232E] focus:bg-white focus:ring-2 focus:ring-[#D9232E]/25`} />
            {q && <button aria-label="Clear search" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"><X size={16} /></button>}
          </label>
          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-1.5 rounded-[6px] border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-800 sm:inline-flex"><i className="h-2 w-2 rounded-full bg-amber-400" />{account.tier} distributor</span>
            <div className="hidden min-w-[150px] sm:block" title={`Credit used ${rm(creditUsed)} of ${rm(account.creditLimit)}`}>
              <div className="flex justify-between gap-3 text-xs text-slate-500"><span>Credit available</span><span className={`${mono} font-medium ${over ? "text-[#D9232E]" : "text-slate-800"}`}>{rm(Math.max(0, available - total))}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]"><div className="h-full rounded-full" style={{ width: `${usedPct}%`, background: over ? RED : usedPct > 80 ? "#D97706" : MINT }} /></div>
            </div>
            <button onClick={() => setCartOpen(true)} className="relative inline-flex h-10 items-center gap-2 rounded-[6px] bg-[#D9232E] px-3.5 text-sm font-semibold text-white hover:bg-[#BF1D27]" aria-label={`Open cart, ${cartons} cartons`}>
              <ShoppingCart size={18} /> <span className="hidden sm:inline">Cart</span>
              <span className={`${mono} grid min-w-5 place-items-center rounded-full bg-white px-1.5 text-xs font-bold text-[#D9232E]`}>{cartons}</span>
            </button>
            <button onClick={onLogout} aria-label="Sign out" title="Sign out" className="grid h-10 w-10 place-items-center rounded-[6px] border border-[#E2E8F0] text-slate-600 hover:bg-[#F4F6F9]"><LogOut size={18} /></button>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1500px] gap-6 px-3 py-5 sm:px-5">
        <aside className="hidden w-60 shrink-0 lg:block"><div className="sticky top-[76px] rounded-[6px] border border-[#E2E8F0] bg-white p-3">{Sidebar}</div></aside>

        <main className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className={`${head} text-2xl font-extrabold tracking-tight text-slate-900 sm:text-[28px]`}>{cat === "all" ? "Oral, personal and home care" : cat}</h1>
              <p className="text-sm text-slate-500">{list.length} product{list.length === 1 ? "" : "s"} · prices per unit, ordered by the carton, before tax</p>
            </div>
            <div role="tablist" aria-label="View" className="inline-flex rounded-[6px] border border-[#E2E8F0] bg-white p-1">
              {([["catalog", "Catalog", LayoutGrid], ["quick", "Quick order", ListChecks], ["orders", "My orders", History]] as const).map(([k, label, Icon]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`inline-flex items-center gap-2 rounded-[4px] px-3.5 py-1.5 text-sm font-semibold ${tab === k ? "bg-[#D9232E] text-white" : "text-slate-600 hover:bg-[#F4F6F9]"}`}><Icon size={16} />{label}</button>
              ))}
            </div>
          </div>

          {tab !== "orders" && list.length === 0 && <div className="rounded-[6px] border border-dashed border-[#CBD5E1] bg-white p-10 text-center text-slate-500">No products match. <button className="font-semibold text-[#D9232E] underline" onClick={() => { setQ(""); setCat("all"); setFlag("all"); }}>Clear filters</button></div>}

          {tab === "catalog" && list.length > 0 && (
            <div className="grid grid-cols-1 gap-4 min-[520px]:grid-cols-2 xl:grid-cols-3 min-[1500px]:grid-cols-4">
              {list.map((p) => {
                const qty = draft[p.sku] ?? 1;
                const pct = tierPct(p, qty);
                const out = stockState(p) === "out";
                const inCart = cart[p.sku] ?? 0;
                return (
                  <article key={p.sku} className="flex flex-col rounded-[6px] border border-[#E2E8F0] bg-white">
                    <div className="relative grid h-40 place-items-center rounded-t-[6px] bg-[#F4F6F9]">
                      <ProductArt product={p} className="h-32 w-32" />
                      <div className="absolute left-2 top-2 flex flex-col items-start gap-1">
                        {p.promo && <span className="rounded-[4px] bg-[#D9232E] px-2 py-0.5 text-xs font-bold text-white">Promo</span>}
                        {p.bundle && <span className="rounded-[4px] bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">Bundle</span>}
                      </div>
                      <div className="absolute right-2 top-2"><StockBadge p={p} /></div>
                    </div>
                    <div className="flex flex-1 flex-col p-4">
                      <div className={`${mono} text-xs tracking-wide text-slate-500`}>{p.sku} · {p.barcode}</div>
                      <h2 className={`${head} mt-1 text-[16px] font-bold leading-snug text-slate-900`}>{p.name} <span className="font-medium text-slate-500">{p.size}</span></h2>
                      <div className={`${mono} mt-1 text-[13px] text-slate-600`}>1 Carton = {p.perCarton} Units</div>
                      {p.promo && <div className="mt-1 text-[13px] font-medium text-[#D9232E]">{p.promo}</div>}
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div><div className={`${mono} text-xl font-semibold text-slate-900`}>{rm(p.unitPrice)}</div><div className="text-xs text-slate-500">per unit, wholesale</div></div>
                        <div className="text-right"><div className={`${mono} text-sm font-medium text-slate-700`}>{rm(cartonNet(p, qty))}</div><div className="text-xs text-slate-500">{pct ? `per carton, ${pct}% off` : "per carton"}</div></div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Bulk discounts">
                        {p.tiers.map((t) => <span key={t.min} className={`${mono} rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset ${qty >= t.min && tierPct(p, qty) === t.pct ? "bg-[#00A88F]/10 text-[#007A68] ring-[#00A88F]/40" : "bg-white text-slate-500 ring-[#E2E8F0]"}`}>{t.min}+ ctn −{t.pct}%</span>)}
                      </div>
                      <div className="mt-auto flex items-center gap-2 pt-4">
                        <Stepper value={qty} max={Math.max(1, p.stock)} label={`Cartons of ${p.name}`} onChange={(n) => setDraft((d) => ({ ...d, [p.sku]: Math.max(1, n) }))} />
                        <button disabled={out} onClick={() => addCartons(p, qty)} className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[6px] bg-[#D9232E] px-2 text-sm font-semibold text-white transition hover:bg-[#BF1D27] disabled:bg-slate-200 disabled:text-slate-400"><Plus size={16} /> Add Carton</button>
                      </div>
                      {inCart > 0 && <div className="mt-2 text-xs font-medium text-[#007A68]">{inCart} carton{inCart > 1 ? "s" : ""} in your cart</div>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {tab === "quick" && list.length > 0 && (
            <section className="rounded-[6px] border border-[#E2E8F0] bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E8F0] px-4 py-3">
                <p className="text-sm text-slate-600">Type carton quantities for as many products as you like, then add them all at once.</p>
                <div className="flex items-center gap-2">
                  <button className="rounded-[6px] border border-[#E2E8F0] px-3 py-2 text-sm font-medium text-slate-700 hover:bg-[#F4F6F9] disabled:opacity-40" disabled={quickCartons === 0} onClick={() => setQuick({})}>Clear</button>
                  <button className="inline-flex items-center gap-2 rounded-[6px] bg-[#D9232E] px-4 py-2 text-sm font-semibold text-white hover:bg-[#BF1D27] disabled:bg-slate-200 disabled:text-slate-400" disabled={quickCartons === 0} onClick={addQuick}><ShoppingCart size={16} /> Add {quickCartons || ""} carton{quickCartons === 1 ? "" : "s"} to cart</button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left">
                  <thead className="bg-[#F4F6F9] text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr><th className="px-4 py-2.5">SKU</th><th className="px-3 py-2.5">Product</th><th className="px-3 py-2.5">Stock</th><th className="px-3 py-2.5 text-right">Units / ctn</th><th className="px-3 py-2.5 text-right">Carton price</th><th className="px-3 py-2.5 text-right">Cartons</th><th className="px-4 py-2.5 text-right">Line total</th></tr>
                  </thead>
                  <tbody>
                    {list.map((p) => {
                      const n = quick[p.sku] ?? 0;
                      const out = stockState(p) === "out";
                      return (
                        <tr key={p.sku} className="border-t border-[#E2E8F0] hover:bg-[#FAFBFC]">
                          <td className={`${mono} whitespace-nowrap px-4 py-2.5 text-sm text-slate-600`}>{p.sku}</td>
                          <td className="px-3 py-2.5 text-[15px] font-medium text-slate-900">{p.name} <span className="font-normal text-slate-500">{p.size}</span></td>
                          <td className="px-3 py-2.5"><StockBadge p={p} /></td>
                          <td className={`${mono} px-3 py-2.5 text-right text-sm`}>{p.perCarton}</td>
                          <td className={`${mono} px-3 py-2.5 text-right text-sm`}>{rm(cartonNet(p, Math.max(n, 1)))}{tierPct(p, n) > 0 && <span className="ml-1 text-xs text-[#007A68]">−{tierPct(p, n)}%</span>}</td>
                          <td className="px-3 py-2 text-right"><input aria-label={`Cartons of ${p.name}`} inputMode="numeric" disabled={out} placeholder="0" value={n || ""} onChange={(e) => { const v = Math.min(p.stock, Number(e.target.value.replace(/\D/g, "")) || 0); setQuick((s) => { const x = { ...s }; if (v) x[p.sku] = v; else delete x[p.sku]; return x; }); }} className={`${mono} h-9 w-20 rounded-[6px] border border-[#E2E8F0] bg-white px-2 text-right text-sm outline-none focus:border-[#D9232E] focus:ring-2 focus:ring-[#D9232E]/25 disabled:bg-slate-100`} /></td>
                          <td className={`${mono} whitespace-nowrap px-4 py-2.5 text-right text-sm ${n ? "font-semibold text-slate-900" : "text-slate-300"}`}>{n ? rm(lineTotal(p, n)) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between border-t border-[#E2E8F0] bg-[#F4F6F9] px-4 py-3 text-sm"><span className="text-slate-600">{quickCartons} carton{quickCartons === 1 ? "" : "s"} entered</span><span className={`${mono} text-base font-semibold text-slate-900`}>{rm(quickTotal)}</span></div>
            </section>
          )}
          {tab === "orders" && (
            <section className="rounded-[6px] border border-[#E2E8F0] bg-white">
              <div className="border-b border-[#E2E8F0] px-4 py-3 text-sm text-slate-600">Your recent orders. Reorder adds the same cartons to your cart, skipping anything out of stock.</div>
              <ul className="divide-y divide-[#E2E8F0]">
                {orders.length === 0 && <li className="px-4 py-6 text-center text-slate-500">No orders yet. Your first order will appear here.</li>}
                {orders.map((o) => (
                  <li key={o.ref} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
                    <div className="min-w-[150px]"><div className={`${mono} text-sm font-medium text-slate-900`}>{o.ref}</div><div className="text-xs text-slate-500">{o.date}</div></div>
                    <div className="min-w-0 flex-1 text-sm text-slate-600">{o.lines.map((l) => `${l.n} × ${l.name}`).join(" · ")}</div>
                    <span className={`rounded-[4px] px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${o.status === "Delivered" ? "bg-[#00A88F]/10 text-[#007A68] ring-[#00A88F]/30" : o.status === "Cancelled" ? "bg-slate-100 text-slate-500 ring-slate-300" : "bg-amber-50 text-amber-800 ring-amber-300"}`}>{o.status}</span>
                    <span className={`${mono} w-28 text-right text-sm font-semibold`}>{rm(o.total)}</span>
                    <button onClick={() => reorder(o)} className="inline-flex items-center gap-1.5 rounded-[6px] border border-[#D9232E] px-3 py-1.5 text-sm font-semibold text-[#D9232E] hover:bg-[#D9232E] hover:text-white"><Repeat size={15} /> Reorder</button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>

      {/* Mobile categories */}
      {filtersOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setFiltersOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[85vw] overflow-y-auto bg-white p-3 shadow-xl">
            <div className="mb-3 flex items-center justify-between px-1"><span className={`${head} flex items-center gap-2 font-bold`}><SlidersHorizontal size={18} /> Categories</span><button aria-label="Close" onClick={() => setFiltersOpen(false)} className="rounded p-1.5 hover:bg-[#F4F6F9]"><X size={20} /></button></div>
            {Sidebar}
          </div>
        </div>
      )}

      {/* Cart drawer */}
      {cartOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setCartOpen(false)} />
          <aside role="dialog" aria-modal="true" aria-label="Wholesale cart" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] px-4 py-3">
              <h2 className={`${head} text-lg font-bold`}>Wholesale cart <span className={`${mono} text-sm font-medium text-slate-500`}>{cartons} ctn</span></h2>
              <button aria-label="Close cart" onClick={() => { setCartOpen(false); setPlaced(null); }} className="rounded p-1.5 hover:bg-[#F4F6F9]"><X size={20} /></button>
            </div>
            {placed ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <CheckCircle2 size={48} color={MINT} />
                <h3 className={`${head} text-xl font-bold`}>Order placed</h3>
                <p className="text-slate-600">{placed.cartons} cartons · <span className={mono}>{rm(placed.total)}</span></p>
                <p className={`${mono} rounded-[6px] bg-[#F4F6F9] px-3 py-1.5 text-sm`}>{placed.ref}</p>
                <p className="max-w-xs text-sm text-slate-500">We will confirm and arrange delivery. You can follow its status under My orders.</p>
                <button onClick={() => { setPlaced(null); setCartOpen(false); }} className="mt-2 rounded-[6px] bg-[#D9232E] px-5 py-2.5 font-semibold text-white hover:bg-[#BF1D27]">Keep shopping</button>
              </div>
            ) : lines.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-slate-500"><PackageCheck size={44} className="text-slate-300" /><p className="font-medium text-slate-700">Your cart is empty</p><p className="text-sm">Add cartons from the catalog or use Quick order.</p><button onClick={() => setCartOpen(false)} className="mt-2 inline-flex items-center gap-1 font-semibold text-[#D9232E]">Browse products <ChevronRight size={16} /></button></div>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-[#E2E8F0] overflow-y-auto">
                  {lines.map(({ p, n }) => (
                    <li key={p.sku} className="flex gap-3 p-4">
                      <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[6px] bg-[#F4F6F9]"><ProductArt product={p} className="h-14 w-14" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className={`${mono} text-xs text-slate-500`}>{p.sku}</div><div className="text-[15px] font-semibold leading-snug text-slate-900">{p.name} <span className="font-normal text-slate-500">{p.size}</span></div></div><button aria-label={`Remove ${p.name}`} onClick={() => setLine(p, 0)} className="rounded p-1 text-slate-400 hover:text-[#D9232E]"><Trash2 size={16} /></button></div>
                        <div className={`${mono} mt-0.5 text-xs text-slate-500`}>{n * p.perCarton} units · {rm(cartonNet(p, n))} / carton{tierPct(p, n) > 0 && <span className="ml-1 text-[#007A68]">−{tierPct(p, n)}%</span>}</div>
                        <div className="mt-2 flex items-center justify-between"><Stepper small value={n} max={p.stock} label={`Cartons of ${p.name}`} onChange={(v) => setLine(p, v)} /><span className={`${mono} font-semibold text-slate-900`}>{rm(lineTotal(p, n))}</span></div>
                      </div>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-[#E2E8F0] bg-[#F4F6F9] p-4">
                  <dl className={`${mono} space-y-1 text-sm`}>
                    <div className="flex justify-between"><dt className="font-[family-name:var(--pt-body)] text-slate-500">Cartons / units</dt><dd>{cartons} / {units}</dd></div>
                    <div className="flex justify-between"><dt className="font-[family-name:var(--pt-body)] text-slate-500">Carton prices</dt><dd>{rm(gross)}</dd></div>
                    <div className="flex justify-between text-[#007A68]"><dt className="font-[family-name:var(--pt-body)]">Bulk discounts</dt><dd>−{rm(saving)}</dd></div>
                    <div className="flex justify-between border-t border-[#CBD5E1] pt-2 text-lg font-semibold text-slate-900"><dt className="font-[family-name:var(--pt-body)]">Order total</dt><dd>{rm(total)}</dd></div>
                  </dl>
                  <p className="mt-1 text-xs text-slate-500">Before tax. Delivery is scheduled after approval.</p>
                  <div className={`mt-3 rounded-[6px] px-3 py-2 text-sm ${over ? "bg-red-50 text-[#B4161F] ring-1 ring-[#D9232E]/30" : "bg-white text-slate-600 ring-1 ring-[#E2E8F0]"}`} role={over ? "alert" : undefined}>
                    {over ? <><b>Over your credit limit.</b> This order is {rm(total - available)} above the {rm(available)} you have available. Pay an invoice or reduce the order.</> : <>Credit after this order: <b className={mono}>{rm(available - total)}</b> of {rm(account.creditLimit)}</>}
                  </div>
                  {placeErr && <p role="alert" className="mt-3 rounded-[6px] bg-red-50 px-3 py-2 text-sm text-[#B4161F] ring-1 ring-[#D9232E]/30">{placeErr}</p>}
                  <button disabled={over || placing} onClick={() => void place()} className="mt-3 w-full rounded-[6px] bg-[#D9232E] px-4 py-3 text-base font-semibold text-white transition hover:bg-[#BF1D27] disabled:bg-slate-300">{placing ? "Placing order…" : "Place order"}</button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {toast && <div role="status" className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-[6px] bg-slate-900 px-4 py-2.5 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  );
}
