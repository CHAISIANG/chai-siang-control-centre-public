"use client";
import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/components/role";
import { btnGhost, btnPrimary, Field, inputCls, Modal } from "@/components/finui";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { fmtDate, money } from "@/lib/finance";

type Status = "Pending approval" | "Approved" | "Out for delivery" | "Delivered" | "Cancelled";
type OrderRow = { id: string; ref: string; user_id: string; status: Status; total: string | number; created_at: string; portal_order_lines: { name: string; cartons: number }[] };
type AccountRow = { user_id: string; code: string; company_name: string; tier: string; credit_limit: string | number; outstanding: string | number; active: boolean };
type ProductRow = { sku: string; name: string; size: string; category: string; per_carton: number; unit_price: string | number; stock: number; active: boolean };

const NEXT: Record<Status, { to: Status; label: string }[]> = {
  "Pending approval": [{ to: "Approved", label: "Approve" }, { to: "Cancelled", label: "Cancel" }],
  Approved: [{ to: "Out for delivery", label: "Out for delivery" }, { to: "Cancelled", label: "Cancel" }],
  "Out for delivery": [{ to: "Delivered", label: "Mark delivered" }],
  Delivered: [], Cancelled: [],
};
const TONE: Record<Status, "amber" | "blue" | "green" | "grey" | "red"> = { "Pending approval": "amber", Approved: "blue", "Out for delivery": "blue", Delivered: "green", Cancelled: "grey" };
const CATS = ["Toothpaste", "Toothbrushes", "Mouthwash", "Personal Care", "Home Care"];
const ART: Record<string, string> = { Toothpaste: "tube", Toothbrushes: "brush", Mouthwash: "bottle", "Personal Care": "pump", "Home Care": "bottle" };

function genPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const a = new Uint32Array(12);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
}

export default function Distributors() {
  const { realCan } = useRole();
  const canManage = realCan("portal_manage");
  const [tab, setTab] = useState<"orders" | "accounts" | "products">("orders");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<Status | "">("");
  const [modal, setModal] = useState<null | "newAccount" | { account: AccountRow } | "newProduct">(null);

  const load = useCallback(async () => {
    const [o, a, p] = await Promise.all([
      supabase.from("portal_orders").select("id, ref, user_id, status, total, created_at, portal_order_lines(name, cartons)").order("created_at", { ascending: false }).limit(200),
      supabase.from("portal_accounts").select("*").order("company_name"),
      supabase.from("portal_products").select("sku, name, size, category, per_carton, unit_price, stock, active").order("sort"),
    ]);
    setErr(o.error?.message ?? a.error?.message ?? p.error?.message ?? null);
    setOrders((o.data ?? []) as unknown as OrderRow[]);
    setAccounts((a.data ?? []) as AccountRow[]);
    setProducts((p.data ?? []) as ProductRow[]);
    setLoading(false);
  }, []);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const company = (uid: string) => accounts.find((a) => a.user_id === uid)?.company_name ?? "—";
  async function move(o: OrderRow, to: Status) {
    if (to === "Cancelled" && !confirm(`Cancel ${o.ref}? Its cartons go back into stock.`)) return;
    setErr(null);
    const { error } = await supabase.rpc("portal_set_order_status", { p_id: o.id, p_status: to });
    if (error) setErr(error.message);
    await load();
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  const shown = orders.filter((o) => !statusFilter || o.status === statusFilter);
  const waiting = orders.filter((o) => o.status === "Pending approval").length;
  const tabBtn = (k: typeof tab, label: string) => (
    <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-3.5 py-1.5 text-base font-medium ${tab === k ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}{k === "orders" && waiting > 0 ? ` (${waiting} waiting)` : ""}</button>
  );

  return (
    <>
      <PageHeader title="Distributor orders" sub="Orders placed in the distributor portal, the distributors who can order, and the products they see." />
      <div role="tablist" className="mb-4 inline-flex gap-1 rounded-lg border border-slate-200 bg-white p-1">{tabBtn("orders", "Orders")}{tabBtn("accounts", "Distributors")}{tabBtn("products", "Products")}</div>
      {err && <p role="alert" className="mb-4 rounded bg-rose-50 px-3 py-2 text-rose-800">{err}</p>}

      {tab === "orders" && (
        <Card right={<select aria-label="Status" className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as Status | "")}><option value="">All statuses</option>{(Object.keys(NEXT) as Status[]).map((s) => <option key={s}>{s}</option>)}</select>}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Order</Th><Th>Distributor</Th><Th>Date</Th><Th>Items</Th><Th right>Total</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {shown.length === 0 && <tr><Td first className="text-slate-500">No orders yet.</Td></tr>}
                {shown.map((o) => (
                  <tr key={o.id} className="border-b border-slate-100">
                    <Td first className="font-medium text-slate-900">{o.ref}</Td>
                    <Td>{company(o.user_id)}</Td>
                    <Td>{fmtDate(o.created_at.slice(0, 10))}</Td>
                    <Td className="max-w-xs truncate text-sm text-slate-600" >{o.portal_order_lines.map((l) => `${l.cartons} × ${l.name}`).join(", ")}</Td>
                    <Td right>{money(Number(o.total))}</Td>
                    <Td><Badge tone={TONE[o.status]}>{o.status}</Badge></Td>
                    <Td right>{canManage && <span className="inline-flex gap-1.5">{NEXT[o.status].map((n) => <button key={n.to} onClick={() => void move(o, n.to)} className={`rounded-md border px-2.5 py-1 text-sm font-medium ${n.to === "Cancelled" ? "border-rose-300 text-rose-700 hover:bg-rose-50" : "border-slate-300 text-slate-700 hover:bg-slate-100"}`}>{n.label}</button>)}</span>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "accounts" && (
        <Card right={canManage ? <button className={btnPrimary + " !py-1.5 !text-sm"} onClick={() => setModal("newAccount")}>New distributor</button> : undefined}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>ID</Th><Th>Company</Th><Th>Tier</Th><Th right>Credit limit</Th><Th right>Owes (delivered)</Th><Th right>Open orders</Th><Th>Status</Th><Th /></tr></thead>
              <tbody>
                {accounts.length === 0 && <tr><Td first className="text-slate-500">No distributors yet. Add one to give them a login.</Td></tr>}
                {accounts.map((a) => {
                  const open = orders.filter((o) => o.user_id === a.user_id && ["Pending approval", "Approved", "Out for delivery"].includes(o.status)).reduce((s, o) => s + Number(o.total), 0);
                  return (
                    <tr key={a.user_id} className="border-b border-slate-100">
                      <Td first className="font-mono text-sm">{a.code}</Td><Td className="font-medium text-slate-900">{a.company_name}</Td><Td>{a.tier}</Td>
                      <Td right>{money(Number(a.credit_limit))}</Td><Td right>{money(Number(a.outstanding))}</Td><Td right>{money(open)}</Td>
                      <Td><Badge tone={a.active ? "green" : "grey"}>{a.active ? "Active" : "Switched off"}</Badge></Td>
                      <Td right>{canManage && <button className="text-sm font-medium text-indigo-600 hover:underline" onClick={() => setModal({ account: a })}>Edit</button>}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "products" && <ProductsTable products={products} canManage={canManage} onChanged={load} onAdd={() => setModal("newProduct")} setErr={setErr} />}

      {modal === "newAccount" && <AccountModal onClose={() => setModal(null)} onDone={load} />}
      {modal && typeof modal === "object" && "account" in modal && <AccountModal account={modal.account} onClose={() => setModal(null)} onDone={load} />}
      {modal === "newProduct" && <ProductModal onClose={() => setModal(null)} onDone={load} />}
    </>
  );
}

function ProductsTable({ products, canManage, onChanged, onAdd, setErr }: { products: ProductRow[]; canManage: boolean; onChanged: () => Promise<void>; onAdd: () => void; setErr: (e: string | null) => void }) {
  const [edit, setEdit] = useState<Record<string, { unit_price: string; stock: string }>>({});
  async function save(p: ProductRow) {
    const e = edit[p.sku];
    if (!e) return;
    const price = Number(e.unit_price), stock = Number(e.stock);
    if (!(price >= 0) || !Number.isInteger(stock) || stock < 0) return setErr("Price must be 0 or more, and stock a whole number of cartons.");
    setErr(null);
    const { error } = await supabase.from("portal_products").update({ unit_price: price, stock }).eq("sku", p.sku);
    if (error) setErr(error.message);
    setEdit((x) => { const n = { ...x }; delete n[p.sku]; return n; });
    await onChanged();
  }
  async function toggle(p: ProductRow) {
    const { error } = await supabase.from("portal_products").update({ active: !p.active }).eq("sku", p.sku);
    if (error) setErr(error.message);
    await onChanged();
  }
  const cell = "w-24 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm";
  return (
    <Card right={canManage ? <button className={btnPrimary + " !py-1.5 !text-sm"} onClick={onAdd}>Add product</button> : undefined}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200"><tr><Th first>SKU</Th><Th>Product</Th><Th right>Units / ctn</Th><Th right>Unit price (RM)</Th><Th right>Stock (cartons)</Th><Th>Shown</Th><Th /></tr></thead>
          <tbody>
            {products.map((p) => {
              const e = edit[p.sku];
              return (
                <tr key={p.sku} className="border-b border-slate-100">
                  <Td first className="font-mono text-sm">{p.sku}</Td>
                  <Td>{p.name} <span className="text-slate-500">{p.size}</span></Td>
                  <Td right>{p.per_carton}</Td>
                  <Td right>{canManage ? <input aria-label={`Unit price of ${p.sku}`} className={cell} inputMode="decimal" value={e?.unit_price ?? String(Number(p.unit_price))} onChange={(ev) => setEdit((x) => ({ ...x, [p.sku]: { unit_price: ev.target.value, stock: x[p.sku]?.stock ?? String(p.stock) } }))} /> : Number(p.unit_price).toFixed(2)}</Td>
                  <Td right>{canManage ? <input aria-label={`Stock of ${p.sku}`} className={cell} inputMode="numeric" value={e?.stock ?? String(p.stock)} onChange={(ev) => setEdit((x) => ({ ...x, [p.sku]: { unit_price: x[p.sku]?.unit_price ?? String(Number(p.unit_price)), stock: ev.target.value } }))} /> : p.stock}</Td>
                  <Td>{canManage ? <button onClick={() => void toggle(p)} className="text-sm font-medium text-indigo-600 hover:underline">{p.active ? "Shown" : "Hidden"}</button> : <Badge tone={p.active ? "green" : "grey"}>{p.active ? "Shown" : "Hidden"}</Badge>}</Td>
                  <Td right>{e && <button className={btnPrimary + " !px-3 !py-1 !text-sm"} onClick={() => void save(p)}>Save</button>}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-slate-500">Bulk-discount steps are 5+ cartons 2%, 10+ 4%, 20+ 6% for new products. Hidden products disappear from the distributor catalogue.</p>
    </Card>
  );
}

function AccountModal({ account, onClose, onDone }: { account?: AccountRow; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ company_name: account?.company_name ?? "", code: account?.code ?? "", email: "", password: genPassword(), tier: account?.tier ?? "Silver", credit_limit: String(Number(account?.credit_limit ?? 10000)), outstanding: String(Number(account?.outstanding ?? 0)), active: account?.active ?? true });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [made, setMade] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    if (account) {
      const { error } = await supabase.from("portal_accounts").update({ company_name: f.company_name.trim(), tier: f.tier, credit_limit: Number(f.credit_limit), outstanding: Number(f.outstanding), active: f.active }).eq("user_id", account.user_id);
      setBusy(false);
      if (error) return setErr(error.message);
      await onDone(); onClose(); return;
    }
    const { data, error } = await supabase.functions.invoke("admin-users", { body: { action: "create_distributor", email: f.email, password: f.password, company_name: f.company_name, code: f.code, tier: f.tier, credit_limit: Number(f.credit_limit), outstanding: Number(f.outstanding) } });
    setBusy(false);
    let msg = (data as { error?: string } | null)?.error;
    if (!msg && error) { try { msg = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error; } catch { /* use fallback */ } }
    if (msg || error) return setErr(msg ?? "Could not create the distributor.");
    await onDone();
    setMade(true);
  }

  if (made) {
    return (
      <Modal title="Distributor created" onClose={onClose}>
        <div className="space-y-3">
          <p className="text-slate-700">Give these sign-in details to {f.company_name}. The password is shown only now.</p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-slate-50 p-3 text-sm"><dt className="text-slate-500">Portal</dt><dd className="break-all">{typeof window !== "undefined" ? `${window.location.origin}/portal` : "/portal"}</dd><dt className="text-slate-500">Email</dt><dd>{f.email}</dd><dt className="text-slate-500">Password</dt><dd className="font-mono">{f.password}</dd></dl>
          <button className={btnPrimary} onClick={onClose}>Done</button>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title={account ? `Edit ${account.company_name}` : "New distributor"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Company name"><input className={inputCls} value={f.company_name} onChange={set("company_name")} required autoFocus /></Field>
        {!account && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Distributor ID"><input className={inputCls} value={f.code} onChange={set("code")} placeholder="DIST-10482" required /></Field>
              <Field label="Login email"><input type="email" className={inputCls} value={f.email} onChange={set("email")} required /></Field>
            </div>
            <Field label="Starting password (8+ characters)"><input className={inputCls + " font-mono"} value={f.password} onChange={set("password")} minLength={8} required /></Field>
          </>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tier"><select className={inputCls} value={f.tier} onChange={set("tier")}>{["Bronze", "Silver", "Gold", "Platinum"].map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Credit limit (RM)"><input type="number" min="0" step="0.01" className={inputCls} value={f.credit_limit} onChange={set("credit_limit")} required /></Field>
          <Field label="Owes now (RM)"><input type="number" min="0" step="0.01" className={inputCls} value={f.outstanding} onChange={set("outstanding")} required /></Field>
        </div>
        {account && <label className="flex items-center gap-2 text-base"><input type="checkbox" checked={f.active} onChange={set("active")} /> Can place orders</label>}
        <p className="text-sm text-slate-500">&ldquo;Owes now&rdquo; is what they owe for delivered orders. It counts against the credit limit together with orders still on the way.</p>
        {err && <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
        <div className="flex gap-3"><button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : account ? "Save changes" : "Create distributor"}</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}

function ProductModal({ onClose, onDone }: { onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ sku: "", barcode: "", name: "", size: "", category: CATS[0], per_carton: "24", unit_price: "", stock: "0" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.from("portal_products").insert({
      sku: f.sku.trim().toUpperCase(), barcode: f.barcode.trim(), name: f.name.trim(), size: f.size.trim(), category: f.category, per_carton: Number(f.per_carton), unit_price: Number(f.unit_price), stock: Number(f.stock),
      tiers: [{ min: 5, pct: 2 }, { min: 10, pct: 4 }, { min: 20, pct: 6 }], art: ART[f.category], sort: 1000,
    });
    setBusy(false);
    if (error) return setErr(error.code === "23505" ? "That SKU already exists." : error.message);
    await onDone(); onClose();
  }
  return (
    <Modal title="Add product" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU"><input className={inputCls} value={f.sku} onChange={set("sku")} required autoFocus /></Field>
          <Field label="Barcode"><input className={inputCls} value={f.barcode} onChange={set("barcode")} /></Field>
        </div>
        <Field label="Product name"><input className={inputCls} value={f.name} onChange={set("name")} required /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Size"><input className={inputCls} value={f.size} onChange={set("size")} placeholder="150g" /></Field>
          <Field label="Category"><select className={inputCls} value={f.category} onChange={set("category")}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Units per carton"><input type="number" min="1" className={inputCls} value={f.per_carton} onChange={set("per_carton")} required /></Field>
          <Field label="Unit price (RM)"><input type="number" min="0" step="0.01" className={inputCls} value={f.unit_price} onChange={set("unit_price")} required /></Field>
          <Field label="Stock (cartons)"><input type="number" min="0" className={inputCls} value={f.stock} onChange={set("stock")} required /></Field>
        </div>
        {err && <p role="alert" className="rounded bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
        <div className="flex gap-3"><button disabled={busy} className={btnPrimary}>{busy ? "Saving…" : "Add product"}</button><button type="button" onClick={onClose} className={btnGhost}>Cancel</button></div>
      </form>
    </Modal>
  );
}
