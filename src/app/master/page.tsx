"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Download, FileSpreadsheet, Pencil, Plus, X } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { useRole } from "@/components/role";
import { supabase } from "@/lib/supabase";

// Master data: one clean record per item, customer group and supplier. Every PO, invoice, stock record and claim will use these codes.

type Saved = { code: string; description: string | null; barcode: string | null; category: string | null; brand: string | null; pack_size: string | null; pcs_per_carton: number | null; carton_price: number | null; batch_tracked: boolean; shelf_life_days: number | null; active: boolean };
type Sold = { code: string; desc: string; cartons: number; net: number };
type Cust = { code: string; name: string; channel: string | null; route_name: string | null; salesman_code: string | null };
type Group = { customer_code: string; class: string | null; group_name: string | null; region: string | null };
type Supplier = { code: string; name: string; payment_terms: string | null; contact_person: string | null; email: string | null; claims_email: string | null; active: boolean };

const rm = (n: number) => "RM " + Math.round(n).toLocaleString("en-MY");
const num = (n: number) => n.toLocaleString("en-MY");

// A first guess from the product name, only to save typing. It stays a suggestion until someone confirms it.
const GUESS: [RegExp, string][] = [
  [/TOOTHPASTE|T\/PASTE|\bPASTE\b/i, "Toothpaste"],
  [/BRUSH/i, "Toothbrush"],
  [/MOUTHWASH|PLAX|RINSE/i, "Mouthwash"],
  [/SOAP|SHOWER|SHAMPOO|BODY WASH|HAND WASH|PROTEX|PALMOLIVE/i, "Personal care"],
  [/DISH|FLOOR|SOFTLAN|AJAX|FABRIC|CLEANER|LAUNDRY/i, "Home care"],
];
const guessCategory = (d: string) => GUESS.find(([re]) => re.test(d))?.[1] ?? "";
const guessBrand = (d: string) => (d.trim().split(/\s+/)[0] ?? "").toUpperCase();
const nz = (s: string | null | undefined) => { const t = (s ?? "").trim(); return t === "" ? null : t; };

async function pageAll<T>(table: string, cols: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return out;
}
async function upsertAll(table: string, rows: object[], conflict: string) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict: conflict });
    if (error) throw error;
  }
}

const head = (t: string) => ({ value: t, fontWeight: "bold" as const, backgroundColor: "#e9eded" });
const todo = (t: string) => ({ value: t, fontWeight: "bold" as const, backgroundColor: "#fff3bf" }); // yellow = to be filled in
const cellStr = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const toNum = (v: unknown) => { const s = cellStr(v).replace(/,/g, ""); return s === "" ? null : Number(s); };
const yes = (v: unknown) => /^(y|yes|1|true)$/i.test(cellStr(v));

/** Read the header row and give back each data row as {header: value}. */
function tableOf(rows: unknown[][]) {
  const hi = rows.findIndex((r) => r.some((c) => cellStr(c) !== ""));
  if (hi < 0) return { heads: [] as string[], data: [] as Record<string, unknown>[] };
  const heads = rows[hi].map((c) => cellStr(c).toLowerCase());
  const data = rows.slice(hi + 1).filter((r) => r.some((c) => cellStr(c) !== "")).map((r) => Object.fromEntries(heads.map((h, i) => [h, r[i]])));
  return { heads, data };
}
const pick = (r: Record<string, unknown>, ...names: string[]) => { for (const n of names) if (n in r) return r[n]; return undefined; };

type Tab = "items" | "customers" | "suppliers" | "links";
type Preview = { kind: "items" | "customers" | "suppliers"; rows: object[]; conflict: string; table: string; errors: string[]; warnings: string[]; file: string };

export default function MasterData() {
  const { can } = useRole();
  const manage = can("master_manage");
  const [tab, setTab] = useState<Tab>("items");
  const [sold, setSold] = useState<Sold[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [shown, setShown] = useState(50);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [edit, setEdit] = useState<Saved | null>(null);
  const [editSup, setEditSup] = useState<Supplier | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadKind, setUploadKind] = useState<Preview["kind"]>("items");

  const load = useCallback(async () => {
    const [lines, cs, sv, gr, su] = await Promise.all([
      pageAll<{ product_code: string; product_desc: string | null; qty_cs: number | null; net: number | null }>("sales_lines", "product_code, product_desc, qty_cs, net", "id"),
      pageAll<Cust>("customers", "code, name, channel, route_name, salesman_code", "code"),
      pageAll<Saved>("item_master", "*", "code"),
      pageAll<Group>("customer_groups", "*", "customer_code"),
      pageAll<Supplier>("suppliers", "*", "code"),
    ]);
    const m = new Map<string, Sold>();
    for (const l of lines) {
      const cur = m.get(l.product_code) ?? { code: l.product_code, desc: l.product_desc ?? "", cartons: 0, net: 0 };
      cur.cartons += Number(l.qty_cs ?? 0); cur.net += Number(l.net ?? 0);
      if (!cur.desc && l.product_desc) cur.desc = l.product_desc;
      m.set(l.product_code, cur);
    }
    setSold([...m.values()].sort((a, b) => b.net - a.net));
    setCusts(cs); setSaved(sv); setGroups(gr); setSuppliers(su);
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const savedBy = useMemo(() => new Map(saved.map((s) => [s.code, s])), [saved]);
  const groupBy = useMemo(() => new Map(groups.map((g) => [g.customer_code, g])), [groups]);

  // One row per item: sold items plus any items added by hand, with the saved details laid over the guesses.
  const items = useMemo(() => {
    const codes = new Set<string>([...sold.map((s) => s.code), ...saved.map((s) => s.code)]);
    const soldBy = new Map(sold.map((s) => [s.code, s]));
    return [...codes].map((code) => {
      const s = soldBy.get(code), v = savedBy.get(code);
      const desc = v?.description || s?.desc || "";
      return { code, desc, cartons: s?.cartons ?? 0, net: s?.net ?? 0, saved: v, category: v?.category ?? "", guess: guessCategory(desc), brand: v?.brand || guessBrand(desc) };
    }).sort((a, b) => b.net - a.net || a.code.localeCompare(b.code));
  }, [sold, saved, savedBy]);

  const confirmed = items.filter((i) => i.category).length;
  const guessedOnly = items.filter((i) => !i.category && i.guess);
  const detailed = items.filter((i) => i.saved?.barcode && i.saved.pcs_per_carton).length;
  const rows = useMemo(() => { const k = q.trim().toLowerCase(); return k ? items.filter((i) => i.code.toLowerCase().includes(k) || i.desc.toLowerCase().includes(k)) : items; }, [items, q]);
  const custRows = useMemo(() => { const k = q.trim().toLowerCase(); return k ? custs.filter((c) => c.code.toLowerCase().includes(k) || c.name.toLowerCase().includes(k) || (c.channel ?? "").toLowerCase().includes(k)) : custs; }, [custs, q]);
  const channels = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of custs) m.set(c.channel ?? "(no channel)", (m.get(c.channel ?? "(no channel)") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [custs]);

  const fail = (e: unknown) => setMsg({ ok: false, text: e instanceof Error ? e.message : (e as { message?: string })?.message ?? "Could not save." });

  // ---------- items ----------
  const blankItem = (code: string, description: string): Saved => ({ code, description, barcode: null, category: null, brand: null, pack_size: null, pcs_per_carton: null, carton_price: null, batch_tracked: true, shelf_life_days: null, active: true });

  async function confirmGuesses() {
    setBusy(true); setMsg(null);
    try {
      const rowsToSave = guessedOnly.map((i) => ({ ...(i.saved ?? blankItem(i.code, i.desc)), description: i.desc, category: i.guess, brand: i.saved?.brand || i.brand }));
      await upsertAll("item_master", rowsToSave, "code");
      await load();
      setMsg({ ok: true, text: `${rowsToSave.length} categories confirmed and saved.` });
    } catch (e) { fail(e); }
    setBusy(false);
  }

  async function saveItem() {
    if (!edit) return;
    setBusy(true); setMsg(null);
    try {
      const row = { ...edit, barcode: nz(edit.barcode), category: nz(edit.category), brand: nz(edit.brand), pack_size: nz(edit.pack_size), description: nz(edit.description) };
      const { error } = await supabase.from("item_master").upsert(row, { onConflict: "code" });
      if (error) throw error;
      await load(); setEdit(null); setMsg({ ok: true, text: `${row.code} saved.` });
    } catch (e) { fail(e); }
    setBusy(false);
  }

  // ---------- customers ----------
  async function saveGroup(code: string, patch: Partial<Group>) {
    setMsg(null);
    const cur = groupBy.get(code) ?? { customer_code: code, class: null, group_name: null, region: null };
    const row = { ...cur, ...patch };
    const { error } = await supabase.from("customer_groups").upsert(row, { onConflict: "customer_code" });
    if (error) { fail(error); return; }
    setGroups((p) => [...p.filter((g) => g.customer_code !== code), row]);
  }

  // ---------- suppliers ----------
  async function saveSupplier() {
    if (!editSup) return;
    setBusy(true); setMsg(null);
    try {
      if (!editSup.code.trim() || !editSup.name.trim()) throw new Error("Supplier code and name are required.");
      const row = { ...editSup, code: editSup.code.trim(), name: editSup.name.trim(), payment_terms: nz(editSup.payment_terms), contact_person: nz(editSup.contact_person), email: nz(editSup.email), claims_email: nz(editSup.claims_email) };
      const { error } = await supabase.from("suppliers").upsert(row, { onConflict: "code" });
      if (error) throw error;
      await load(); setEditSup(null); setMsg({ ok: true, text: `${row.name} saved.` });
    } catch (e) { fail(e); }
    setBusy(false);
  }

  // ---------- templates ----------
  async function itemTemplate() {
    setBusy(true);
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    await writeExcelFile([
      { sheet: "Item master", columns: [{ width: 16 }, { width: 40 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 14 }, { width: 18 }, { width: 14 }],
        data: [
          [head("Item code"), head("Description"), todo("Barcode"), todo("Category"), todo("Brand"), todo("Pack size"), todo("Pieces per carton"), todo("Carton price (RM)"), todo("Batch tracked (Y/N)"), todo("Shelf life (days)")],
          ...items.map((i) => [{ value: i.code }, { value: i.desc }, { value: i.saved?.barcode ?? "" }, { value: i.category || i.guess }, { value: i.brand }, { value: i.saved?.pack_size ?? "" }, { value: i.saved?.pcs_per_carton ?? "" }, { value: i.saved?.carton_price ?? "" }, { value: i.saved ? (i.saved.batch_tracked ? "Y" : "N") : "Y" }, { value: i.saved?.shelf_life_days ?? "" }]),
        ] },
      { sheet: "Read me", columns: [{ width: 90 }], data: [
        [head("How to fill this in")],
        [{ value: "Grey headings (Item code, Description) come from your sales reports. Do not change the item codes." }],
        [{ value: "Yellow headings are for you to fill in. Category and Brand are first guesses from the product name: correct them where wrong." }],
        [{ value: "A blank cell leaves what is already saved as it is. It never clears anything." }],
        [{ value: "Batch tracked: Y if the item has a batch code and expiry date to record in the warehouse." }],
        [{ value: "Save the file, then use Upload filled template on the Master data page. You see a check before anything is saved." }],
      ] },
    ]).toFile("item-master-template.xlsx");
    setBusy(false);
  }
  async function customerTemplate() {
    setBusy(true);
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    await writeExcelFile([
      { sheet: "Customer groups", columns: [{ width: 16 }, { width: 36 }, { width: 22 }, { width: 22 }, { width: 14 }, { width: 22 }, { width: 22 }, { width: 18 }],
        data: [
          [head("Customer code"), head("Customer name"), head("Channel (from report)"), head("Route (from report)"), head("Salesman"), todo("Customer class (A/B/C)"), todo("Group / chain name"), todo("Region")],
          ...custs.map((c) => { const g = groupBy.get(c.code); return [{ value: c.code }, { value: c.name }, { value: c.channel ?? "" }, { value: c.route_name ?? "" }, { value: c.salesman_code ?? "" }, { value: g?.class ?? "" }, { value: g?.group_name ?? "" }, { value: g?.region ?? "" }]; }),
        ] },
    ]).toFile("customer-groups-template.xlsx");
    setBusy(false);
  }
  async function supplierTemplate() {
    setBusy(true);
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    await writeExcelFile([
      { sheet: "Suppliers", columns: [{ width: 16 }, { width: 36 }, { width: 18 }, { width: 22 }, { width: 28 }, { width: 28 }],
        data: [
          [todo("Supplier code"), todo("Supplier name"), todo("Payment terms"), todo("Contact person"), todo("Email"), todo("Claims contact email")],
          ...(suppliers.length ? suppliers.map((s) => [{ value: s.code }, { value: s.name }, { value: s.payment_terms ?? "" }, { value: s.contact_person ?? "" }, { value: s.email ?? "" }, { value: s.claims_email ?? "" }]) : [[{ value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }, { value: "" }]]),
        ] },
    ]).toFile("supplier-template.xlsx");
    setBusy(false);
  }

  // ---------- upload with a check before saving ----------
  function startUpload(kind: Preview["kind"]) { setUploadKind(kind); setMsg(null); fileRef.current?.click(); }

  async function readFile(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const { heads, data } = tableOf((await readSheet(f)) as unknown[][]);
      const errors: string[] = [], warnings: string[] = [];
      let out: object[] = [], conflict = "", table = "";
      if (uploadKind === "items") {
        table = "item_master"; conflict = "code";
        if (!heads.includes("item code")) errors.push("The column \"Item code\" was not found. Use the downloaded template.");
        const seen = new Map<string, string>(); // barcode -> item code
        for (const [b, s] of savedBy) if (s.barcode) seen.set(s.barcode, b);
        data.forEach((r, i) => {
          const line = i + 2, code = cellStr(pick(r, "item code"));
          if (!code) { errors.push(`Row ${line}: item code is empty.`); return; }
          const cur = savedBy.get(code) ?? blankItem(code, items.find((x) => x.code === code)?.desc ?? "");
          const next: Saved = { ...cur };
          const set = <K extends keyof Saved>(k: K, v: Saved[K] | null | undefined) => { if (v !== null && v !== undefined && !(typeof v === "string" && v === "")) next[k] = v as Saved[K]; };
          set("description", cellStr(pick(r, "description")));
          const bc = cellStr(pick(r, "barcode")); set("barcode", bc);
          set("category", cellStr(pick(r, "category"))); set("brand", cellStr(pick(r, "brand"))); set("pack_size", cellStr(pick(r, "pack size")));
          for (const [k, names, int] of [["pcs_per_carton", ["pieces per carton"], true], ["carton_price", ["carton price (rm)", "carton price"], false], ["shelf_life_days", ["shelf life (days)", "shelf life"], true]] as const) {
            const v = toNum(pick(r, ...names));
            if (v === null) continue;
            if (!Number.isFinite(v) || v < 0 || (int && !Number.isInteger(v)) || (k !== "carton_price" && v === 0)) { errors.push(`Row ${line} (${code}): ${names[0]} must be a ${int ? "whole " : ""}number above zero.`); continue; }
            (next as unknown as Record<string, number>)[k] = v;
          }
          const bt = cellStr(pick(r, "batch tracked (y/n)", "batch tracked"));
          if (bt !== "") next.batch_tracked = yes(bt);
          if (next.barcode) {
            const owner = seen.get(next.barcode);
            if (owner && owner !== code) errors.push(`Row ${line} (${code}): barcode ${next.barcode} is already used by ${owner}.`);
            seen.set(next.barcode, code);
          }
          if (!items.some((x) => x.code === code)) warnings.push(`${code} is not in your sales reports yet. It will be added as a new item.`);
          out.push(next);
        });
      } else if (uploadKind === "customers") {
        table = "customer_groups"; conflict = "customer_code";
        if (!heads.includes("customer code")) errors.push("The column \"Customer code\" was not found. Use the downloaded template.");
        const known = new Set(custs.map((c) => c.code));
        data.forEach((r, i) => {
          const line = i + 2, code = cellStr(pick(r, "customer code"));
          if (!code) { errors.push(`Row ${line}: customer code is empty.`); return; }
          if (!known.has(code)) { warnings.push(`${code} is not in the customer report. Skipped.`); return; }
          const cur = groupBy.get(code) ?? { customer_code: code, class: null, group_name: null, region: null };
          const cls = cellStr(pick(r, "customer class (a/b/c)", "customer class", "class")).toUpperCase();
          if (cls !== "" && !["A", "B", "C"].includes(cls)) errors.push(`Row ${line} (${code}): class must be A, B or C.`);
          out.push({ ...cur, class: cls || cur.class, group_name: nz(cellStr(pick(r, "group / chain name", "group"))) ?? cur.group_name, region: nz(cellStr(pick(r, "region"))) ?? cur.region });
        });
        out = out.filter((r) => { const g = r as Group; const c = groupBy.get(g.customer_code); return !c || c.class !== g.class || c.group_name !== g.group_name || c.region !== g.region; });
      } else {
        table = "suppliers"; conflict = "code";
        if (!heads.includes("supplier code")) errors.push("The column \"Supplier code\" was not found. Use the downloaded template.");
        data.forEach((r, i) => {
          const line = i + 2, code = cellStr(pick(r, "supplier code")), name = cellStr(pick(r, "supplier name"));
          if (!code && !name) return;
          const cur = suppliers.find((s) => s.code === code);
          if (!code || (!name && !cur)) { errors.push(`Row ${line}: supplier code and name are both needed.`); return; }
          out.push({ code, name: name || cur!.name, payment_terms: nz(cellStr(pick(r, "payment terms"))) ?? cur?.payment_terms ?? null, contact_person: nz(cellStr(pick(r, "contact person"))) ?? cur?.contact_person ?? null, email: nz(cellStr(pick(r, "email"))) ?? cur?.email ?? null, claims_email: nz(cellStr(pick(r, "claims contact email"))) ?? cur?.claims_email ?? null, active: cur?.active ?? true });
        });
      }
      setPreview({ kind: uploadKind, rows: out, conflict, table, errors, warnings: warnings.slice(0, 8), file: f.name });
    } catch (e) { fail(e); }
    if (fileRef.current) fileRef.current.value = "";
    setBusy(false);
  }

  async function applyUpload() {
    if (!preview || preview.errors.length) return;
    setBusy(true); setMsg(null);
    try {
      await upsertAll(preview.table, preview.rows, preview.conflict);
      await load();
      setMsg({ ok: true, text: `${preview.rows.length} records saved from ${preview.file}.` });
      setPreview(null);
    } catch (e) { fail(e); }
    setBusy(false);
  }

  const tabBtn = (k: Tab, label: string) => (
    <button key={k} onClick={() => { setTab(k); setQ(""); setShown(50); setMsg(null); setPreview(null); }} className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset ${tab === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>{label}</button>
  );
  const dl = "inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40";
  const primary = "inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40";
  const inp = "mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";
  const uploadBar = (kind: Preview["kind"], tpl: () => Promise<void>) => (
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || loading} onClick={() => void tpl()} className={dl}><Download size={15} /> Download template</button>
      {manage && <button disabled={busy || loading} onClick={() => startUpload(kind)} className={primary}><FileSpreadsheet size={15} /> Upload filled template</button>}
    </div>
  );

  return (
    <>
      <PageHeader title="Master data" sub="One clean list of items, customer groups and suppliers. Every PO, invoice, stock record and claim will use these same codes." />
      <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => void readFile(e.target.files?.[0])} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabBtn("items", "Items")}{tabBtn("customers", "Customer groups")}{tabBtn("suppliers", "Suppliers")}{tabBtn("links", "How records link")}
      </div>
      {msg && <p role={msg.ok ? "status" : "alert"} className={`mb-3 rounded px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}

      {preview && (
        <Card title={`Check before saving: ${preview.file}`} className="mb-4">
          <p className="text-sm text-slate-700">{preview.rows.length} records will be saved. A blank cell never clears what is already saved.</p>
          {preview.errors.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-rose-800">{preview.errors.slice(0, 10).map((e) => <li key={e}>{e}</li>)}{preview.errors.length > 10 && <li>…and {preview.errors.length - 10} more</li>}</ul>}
          {preview.warnings.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-amber-800">{preview.warnings.map((e) => <li key={e}>{e}</li>)}</ul>}
          <div className="mt-3 flex gap-2">
            <button disabled={busy || preview.errors.length > 0 || !preview.rows.length} onClick={() => void applyUpload()} className={primary}><Check size={15} /> {busy ? "Saving…" : "Save these records"}</button>
            <button onClick={() => setPreview(null)} className={dl}>Cancel</button>
          </div>
          {preview.errors.length > 0 && <p className="mt-2 text-xs text-slate-500">Fix the rows above in the file and upload it again. Nothing was saved.</p>}
        </Card>
      )}

      {tab === "items" && (
        <div className="space-y-4">
          <KpiStrip cols="lg:grid-cols-4">
            <Kpi label="Items" value={loading ? "…" : num(items.length)} sub="From sales reports and added by hand" />
            <Kpi label="Category confirmed" value={loading ? "…" : num(confirmed)} sub={`${num(guessedOnly.length)} more guessed, to confirm`} tone={guessedOnly.length ? "warn" : "good"} />
            <Kpi label="With barcode and carton size" value={loading ? "…" : num(detailed)} sub="Fill in the template" tone={detailed ? "good" : "bad"} />
            <Kpi label="Without a category" value={loading ? "…" : num(items.length - confirmed - guessedOnly.length)} sub="Need your help" tone="warn" />
          </KpiStrip>
          <Card title="Item master" right={uploadBar("items", itemTemplate)}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <input value={q} onChange={(e) => { setQ(e.target.value); setShown(50); }} placeholder="Search item code or name" className="w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm" />
              {manage && guessedOnly.length > 0 && <button disabled={busy} onClick={() => void confirmGuesses()} className={dl}><Check size={15} /> Confirm {guessedOnly.length} guessed categories</button>}
              {manage && <button onClick={() => setEdit(blankItem("", ""))} className={dl}><Plus size={15} /> Add item</button>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Item code</Th><Th>Description</Th><Th>Category</Th><Th>Brand</Th><Th right>Cartons sold</Th><Th right>Net sales</Th><Th>Barcode</Th><Th right>Pcs / ctn</Th><Th>Batch</Th>{manage && <Th> </Th>}</tr></thead>
                <tbody>
                  {rows.slice(0, shown).map((i) => (
                    <tr key={i.code} className={`border-b border-slate-100 last:border-0 ${i.saved?.active === false ? "opacity-50" : ""}`}>
                      <Td first><b>{i.code}</b></Td>
                      <Td>{i.desc}</Td>
                      <Td>{i.category ? i.category : i.guess ? <span title="Guessed from the name. Confirm it to save.">{i.guess} <span className="text-xs text-slate-400">(guess)</span></span> : <span className="text-slate-400">Not set</span>}</Td>
                      <Td><span className="text-slate-500">{i.brand}</span></Td>
                      <Td right>{num(Math.round(i.cartons))}</Td>
                      <Td right>{rm(i.net)}</Td>
                      <Td>{i.saved?.barcode ?? <span className="text-slate-400">to fill</span>}</Td>
                      <Td right>{i.saved?.pcs_per_carton ?? <span className="text-slate-400">to fill</span>}</Td>
                      <Td>{i.saved ? (i.saved.batch_tracked ? <Badge tone="blue">Tracked</Badge> : <Badge tone="grey">No</Badge>) : <span className="text-slate-400">to fill</span>}</Td>
                      {manage && <Td><button aria-label={`Edit ${i.code}`} onClick={() => setEdit(i.saved ?? { ...blankItem(i.code, i.desc), category: i.guess || null, brand: i.brand || null })} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button></Td>}
                    </tr>
                  ))}
                  {!rows.length && <tr><Td>{loading ? "Loading items…" : "No items match."}</Td></tr>}
                </tbody>
              </table>
            </div>
            {rows.length > shown && <button onClick={() => setShown(shown + 100)} className="mt-3 text-sm font-medium text-indigo-700 hover:underline">Show more ({rows.length - shown} left)</button>}
          </Card>
        </div>
      )}

      {tab === "customers" && (
        <div className="space-y-4">
          <KpiStrip cols="lg:grid-cols-3">
            <Kpi label="Customers" value={loading ? "…" : num(custs.length)} sub="From your customer report" />
            <Kpi label="Channels in the report" value={loading ? "…" : num(channels.length)} sub="Already there" tone="good" />
            <Kpi label="With a class" value={loading ? "…" : num(groups.filter((g) => g.class).length)} sub={`${num(groups.filter((g) => g.group_name).length)} with a group or chain`} tone={groups.length ? "good" : "bad"} />
          </KpiStrip>
          <Card title="Customer class and group" right={uploadBar("customers", customerTemplate)}>
            <p className="mb-3 text-sm text-slate-600">Class (A, B, C) ranks customers by importance. Group or chain links outlets of the same owner, so a promotion or credit limit can be seen across all of them.</p>
            <input value={q} onChange={(e) => { setQ(e.target.value); setShown(50); }} placeholder="Search customer code, name or channel" className="mb-3 w-full max-w-sm rounded-md border border-slate-300 px-3 py-2 text-sm" />
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th>Channel</Th><Th>Route</Th><Th>Class</Th><Th>Group or chain</Th><Th>Region</Th></tr></thead>
                <tbody>
                  {custRows.slice(0, shown).map((c) => {
                    const g = groupBy.get(c.code);
                    return (
                      <tr key={c.code} className="border-b border-slate-100 last:border-0">
                        <Td first><b>{c.name}</b><div className="text-xs text-slate-500">{c.code}</div></Td>
                        <Td>{c.channel ?? "—"}</Td><Td>{c.route_name ?? "—"}</Td>
                        <Td>{manage ? (
                          <select aria-label={`Class for ${c.name}`} value={g?.class ?? ""} onChange={(e) => void saveGroup(c.code, { class: e.target.value || null })} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-sm"><option value="">—</option><option>A</option><option>B</option><option>C</option></select>
                        ) : (g?.class ?? "—")}</Td>
                        <Td>{manage ? <input aria-label={`Group for ${c.name}`} defaultValue={g?.group_name ?? ""} onBlur={(e) => { if ((e.target.value.trim() || null) !== (g?.group_name ?? null)) void saveGroup(c.code, { group_name: e.target.value.trim() || null }); }} className="w-40 rounded-md border border-slate-300 px-1.5 py-1 text-sm" /> : (g?.group_name ?? "—")}</Td>
                        <Td>{manage ? <input aria-label={`Region for ${c.name}`} defaultValue={g?.region ?? ""} onBlur={(e) => { if ((e.target.value.trim() || null) !== (g?.region ?? null)) void saveGroup(c.code, { region: e.target.value.trim() || null }); }} className="w-32 rounded-md border border-slate-300 px-1.5 py-1 text-sm" /> : (g?.region ?? "—")}</Td>
                      </tr>
                    );
                  })}
                  {!custRows.length && <tr><Td>{loading ? "Loading customers…" : "No customers match."}</Td></tr>}
                </tbody>
              </table>
            </div>
            {custRows.length > shown && <button onClick={() => setShown(shown + 100)} className="mt-3 text-sm font-medium text-indigo-700 hover:underline">Show more ({custRows.length - shown} left)</button>}
          </Card>
        </div>
      )}

      {tab === "suppliers" && (
        <Card title="Suppliers" right={<div className="flex flex-wrap gap-2">{uploadBar("suppliers", supplierTemplate)}{manage && <button onClick={() => setEditSup({ code: "", name: "", payment_terms: null, contact_person: null, email: null, claims_email: null, active: true })} className={dl}><Plus size={15} /> Add supplier</button>}</div>}>
          <p className="mb-3 text-sm text-slate-600">One record per supplier you buy from. Your main one is the principal (Colgate). Purchase orders, goods received and claim settlements will all point to it.</p>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Code</Th><Th>Name</Th><Th>Payment terms</Th><Th>Contact</Th><Th>Email</Th><Th>Claims email</Th>{manage && <Th> </Th>}</tr></thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr key={s.code} className="border-b border-slate-100 last:border-0">
                    <Td first><b>{s.code}</b></Td><Td>{s.name}</Td><Td>{s.payment_terms ?? "—"}</Td><Td>{s.contact_person ?? "—"}</Td><Td>{s.email ?? "—"}</Td><Td>{s.claims_email ?? "—"}</Td>
                    {manage && <Td><button aria-label={`Edit ${s.name}`} onClick={() => setEditSup(s)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Pencil size={15} /></button></Td>}
                  </tr>
                ))}
                {!suppliers.length && <tr><Td>{loading ? "Loading…" : "No suppliers yet. Add Colgate first."}</Td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {tab === "links" && (
        <Card title="How records link together">
          <p className="mb-3 text-sm text-slate-600">Each record carries the code of the one before it, so you can follow any transaction from start to end, across departments.</p>
          <ul className="space-y-2 text-sm">
            {[
              ["Customer code", "Customer PO, invoice, delivery, payment, claim", "Have", "green"],
              ["Item code", "PO line, invoice line, claim line, stock and batch", "Item master is now here", "green"],
              ["Salesman code", "Customer, claim, daily report", "Have", "green"],
              ["Invoice number", "PO, delivery proof, payment, credit note", "Partly: payment link is next", "amber"],
              ["Supplier code", "Purchase order, goods received, supplier invoice", "Supplier record is now here", "green"],
              ["Batch code", "Goods received, stock count, delivery, recall trace", "Next stage", "grey"],
              ["Claim number", "Sales that justify it, Colgate credit note", "Partly: approval flow is built", "amber"],
            ].map(([k, v, s, t]) => (
              <li key={k} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                <span><b>{k}</b> <span className="text-slate-600">links: {v}</span></span>
                <Badge tone={t as "green" | "amber" | "grey"}>{s}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {edit && (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-900/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Edit item">
          <div className="mx-auto max-w-2xl rounded-xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">{savedBy.has(edit.code) || sold.some((s) => s.code === edit.code) ? `Item ${edit.code}` : "New item"}</h2><button onClick={() => setEdit(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Item code<input className={inp} value={edit.code} disabled={savedBy.has(edit.code) || sold.some((s) => s.code === edit.code)} onChange={(e) => setEdit({ ...edit, code: e.target.value.trim() })} /></label>
              <label className="text-xs font-medium text-slate-600">Description<input className={inp} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-600">Category<input list="cats" className={inp} value={edit.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })} /></label>
              <datalist id="cats">{["Toothpaste", "Toothbrush", "Mouthwash", "Personal care", "Home care"].map((c) => <option key={c} value={c} />)}</datalist>
              <label className="text-xs font-medium text-slate-600">Brand<input className={inp} value={edit.brand ?? ""} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-600">Barcode<input className={inp} value={edit.barcode ?? ""} onChange={(e) => setEdit({ ...edit, barcode: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-600">Pack size<input className={inp} value={edit.pack_size ?? ""} onChange={(e) => setEdit({ ...edit, pack_size: e.target.value })} placeholder="e.g. 150g" /></label>
              <label className="text-xs font-medium text-slate-600">Pieces per carton<input className={inp} inputMode="numeric" value={edit.pcs_per_carton ?? ""} onChange={(e) => setEdit({ ...edit, pcs_per_carton: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label className="text-xs font-medium text-slate-600">Carton price (RM)<input className={inp} inputMode="decimal" value={edit.carton_price ?? ""} onChange={(e) => setEdit({ ...edit, carton_price: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label className="text-xs font-medium text-slate-600">Shelf life (days)<input className={inp} inputMode="numeric" value={edit.shelf_life_days ?? ""} onChange={(e) => setEdit({ ...edit, shelf_life_days: e.target.value === "" ? null : Number(e.target.value) })} /></label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={edit.batch_tracked} onChange={(e) => setEdit({ ...edit, batch_tracked: e.target.checked })} /> Has batch code and expiry date</label>
              <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active (still sold)</label>
            </div>
            <div className="mt-4 flex gap-2">
              <button disabled={busy || !edit.code} onClick={() => void saveItem()} className={primary}>{busy ? "Saving…" : "Save item"}</button>
              <button onClick={() => setEdit(null)} className={dl}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {editSup && (
        <div className="fixed inset-0 z-50 overflow-auto bg-slate-900/60 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Edit supplier">
          <div className="mx-auto max-w-2xl rounded-xl bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">Supplier</h2><button onClick={() => setEditSup(null)} aria-label="Close" className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-medium text-slate-600">Supplier code<input className={inp} value={editSup.code} disabled={suppliers.some((s) => s.code === editSup.code)} onChange={(e) => setEditSup({ ...editSup, code: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-600">Supplier name<input className={inp} value={editSup.name} onChange={(e) => setEditSup({ ...editSup, name: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-600">Payment terms<input className={inp} value={editSup.payment_terms ?? ""} onChange={(e) => setEditSup({ ...editSup, payment_terms: e.target.value })} placeholder="e.g. 30 days" /></label>
              <label className="text-xs font-medium text-slate-600">Contact person<input className={inp} value={editSup.contact_person ?? ""} onChange={(e) => setEditSup({ ...editSup, contact_person: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-600">Email<input className={inp} value={editSup.email ?? ""} onChange={(e) => setEditSup({ ...editSup, email: e.target.value })} /></label>
              <label className="text-xs font-medium text-slate-600">Claims contact email<input className={inp} value={editSup.claims_email ?? ""} onChange={(e) => setEditSup({ ...editSup, claims_email: e.target.value })} /></label>
            </div>
            <div className="mt-4 flex gap-2">
              <button disabled={busy} onClick={() => void saveSupplier()} className={primary}>{busy ? "Saving…" : "Save supplier"}</button>
              <button onClick={() => setEditSup(null)} className={dl}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
