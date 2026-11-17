"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileUp, PackageOpen, Search, Trash2 } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { btnGhost, btnPrimary } from "@/components/finui";
import { useRole } from "@/components/role";
import { supabase } from "@/lib/supabase";
import { convert, IMPORT_HEADERS, parsePackList, parseSap, reconcile, type ImportRow, type Issue, type SapLine } from "@/lib/sapInvoice";

const rm = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ymd = (d: Date | null) => (d ? `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}` : "");
const dmy = (d: Date | null) => (d ? `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` : "");
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const dateTxt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) : "");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Made-up export in the SAP layout, so the screen can be tried without real data.
const SAMPLE_HEAD = ["Customer", "Customer Name", "SalesRep", "Document No.", "Document Date", "HDMS Order No", "Material", "Material Desc", "Conv", "Order Qty", "Sales Unit 1", "Order Qty in EA/IP", "Sales Unit 2", "List Price", "Net Val", "Scheme Discount"];
const SAMPLE: unknown[][] = [
  SAMPLE_HEAD,
  ["SAMPLE-C01", "Sample Mini Market", "SAMPLE-S01", "900S000102", "17.11.2026", "PO-55102", 90000012, "Toothpaste Fresh 175g", 72, 2, "CS", 36, "EA", 1752, 1576.8, -175.2],
  ["SAMPLE-C01", "Sample Mini Market", "SAMPLE-S01", "900S000102", "17.11.2026", "PO-55102", 90000031, "Mouthwash Mint 750ml", 12, 3, "CS", 0, null, 630, 630, 0],
  ["SAMPLE-C01", "Sample Mini Market", "SAMPLE-S01", "900S000102", "17.11.2026", "PO-55102", 90000044, "Toothbrush Soft Twin Pack", 36, 0, null, 12, "EA", 270, 243, -27],
  ["SAMPLE-C02", "Sample Pharmacy", "SAMPLE-S02", "900S000101", "17.11.2026", "900S000101", 90000020, "Dish Liquid Lime 900ml", 12, 5, "CS", 0, null, 540, 486, -54],
  ["SAMPLE-C02", "Sample Pharmacy", "SAMPLE-S02", "900S000101", "17.11.2026", "900S000101", 90000012, "Toothpaste Fresh 175g", 72, 0, null, 24, "EA", 194.67, 194.67, 0],
  ["SAMPLE-C02", "Sample Pharmacy", "SAMPLE-S02", "900S000101", "17.11.2026", "900S000101", 90000099, "Floor Cleaner Floral 2L", 0, 4, "CS", 0, null, 320, 320, 0],
];
// What the sample would look like with history: one invoice already imported, one price changed.
const SAMPLE_PACKS = ["90000044"];
const SAMPLE_PRIOR = new Map([["900S000101", { at: "2026-11-16T09:30:00Z", file: "Sample earlier file.xlsx" }]]);
const SAMPLE_LAST = new Map([["90000031", { price: 198, doc: "900S000088", date: "2026-11-10" }]]);

type Loaded = { name: string; lines: SapLine[]; sample: boolean };
type Prior = Map<string, { at: string; file: string }>;
type Last = Map<string, { price: number; doc: string; date: string | null }>;
type Batch = { id: number; file_name: string; made_at: string; made_by_name: string | null; invoices: number; lines: number; net_total: number; doc_from: string | null; doc_to: string | null };

export default function SapImport() {
  const { can } = useRole();
  const canUse = can("sap_import");
  const fileRef = useRef<HTMLInputElement>(null);
  const packRef = useRef<HTMLInputElement>(null);
  const [data, setData] = useState<Loaded | null>(null);
  const [savedPacks, setSavedPacks] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [doc, setDoc] = useState("");
  const [q, setQ] = useState("");
  const [allIssues, setAllIssues] = useState(false);
  const [skipPrior, setSkipPrior] = useState(true);
  const [checks, setChecks] = useState<{ for: Loaded; prior: Prior; last: Last } | null>(null);
  const [recorded, setRecorded] = useState<{ for: Loaded; id: number } | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);

  const loadSaved = useCallback(async () => {
    const [p, b] = await Promise.all([
      supabase.from("sap_pack_items").select("item_code").range(0, 4999),
      supabase.from("sap_import_batches").select("*").order("made_at", { ascending: false }).limit(15),
    ]);
    setSavedPacks((p.data ?? []).map((r) => r.item_code as string));
    setBatches((b.data ?? []) as Batch[]);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async load, state is set after the await
  useEffect(() => { void loadSaved(); }, [loadSaved]);

  // Look up what was imported before: the same invoices, and the last carton price of each item.
  useEffect(() => {
    if (!data || data.sample) return;
    let live = true;
    (async () => {
      const docs = [...new Set(data.lines.map((l) => l.docNo))];
      const items = [...new Set(data.lines.map((l) => String(l.material)))];
      const [d, p] = await Promise.all([
        supabase.from("sap_import_lines").select("doc_no, sap_import_batches(made_at, file_name)").in("doc_no", docs).limit(5000),
        supabase.rpc("sap_last_prices", { p_items: items }),
      ]);
      if (!live) return;
      const prior: Prior = new Map();
      for (const r of (d.data ?? []) as unknown as { doc_no: string; sap_import_batches: { made_at: string; file_name: string } | null }[]) {
        if (r.sap_import_batches && !prior.has(r.doc_no)) prior.set(r.doc_no, { at: r.sap_import_batches.made_at, file: r.sap_import_batches.file_name });
      }
      const last: Last = new Map();
      for (const r of (p.data ?? []) as { item_code: string; unit_price: number; doc_no: string; doc_date: string | null }[]) last.set(r.item_code, { price: Number(r.unit_price), doc: r.doc_no, date: r.doc_date });
      setChecks({ for: data, prior, last });
    })();
    return () => { live = false; };
  }, [data]);

  const packs = data?.sample ? SAMPLE_PACKS : savedPacks;
  const packSet = useMemo(() => new Set(packs), [packs]);
  const result = useMemo(() => (data ? convert(data.lines, packSet) : null), [data, packSet]);
  const totals = useMemo(() => (data && result ? reconcile(data.lines, result.rows) : []), [data, result]);
  const isRecorded = !!data && recorded?.for === data;
  // Checks against history are taken before this file is recorded, so it never warns about itself.
  const prior: Prior = data?.sample ? SAMPLE_PRIOR : checks?.for === data ? checks.prior : new Map();
  const last: Last = data?.sample ? SAMPLE_LAST : checks?.for === data ? checks.last : new Map();
  const checking = !!data && !data.sample && checks?.for !== data;

  const priceIssues: Issue[] = [];
  if (result) {
    const seen = new Set<string>();
    for (const r of result.rows) {
      const k = String(r.itemCode), was = last.get(k);
      if (!was || seen.has(k) || Math.abs(was.price - r.unitPrice) < 0.01) continue;
      seen.add(k);
      const pct = ((r.unitPrice - was.price) / was.price) * 100;
      priceIssues.push({ level: "warn", docNo: r.docNo, item: `${r.itemCode} ${r.desc}`, text: `Carton price RM ${rm(r.unitPrice)} is ${pct > 0 ? "up" : "down"} ${Math.abs(pct).toFixed(1)}% from RM ${rm(was.price)} last imported (${was.doc}${was.date ? `, ${dateTxt(was.date)}` : ""}).` });
    }
  }
  const priorDocs = totals.filter((t) => prior.has(t.docNo)).map((t) => t.docNo);
  const outRows = (result?.rows ?? []).filter((r) => !(skipPrior && prior.has(r.docNo)));

  async function sheetsOf(f: File) {
    const { default: readXlsxFile } = await import("read-excel-file/browser");
    return (await readXlsxFile(f)) as { sheet: string; data: unknown[][] }[];
  }

  async function readExport(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const sheets = await sheetsOf(f);
      let firstMissing: string[] = [];
      for (const s of sheets) {
        const { lines, missing } = parseSap(s.data);
        if (lines.length) { setData({ name: f.name, lines, sample: false }); setDoc(""); setQ(""); setSkipPrior(true); setBusy(false); return; }
        if (!firstMissing.length) firstMissing = missing;
      }
      setMsg({ ok: false, text: `This does not look like the SAP invoice export. Columns not found: ${firstMissing.join(", ")}.` });
    } catch {
      setMsg({ ok: false, text: "The file could not be read. Save it as .xlsx from Excel and try again." });
    }
    setBusy(false);
  }

  async function readPacks(f: File | undefined) {
    if (!f) return;
    setBusy(true); setMsg(null);
    try {
      const sheets = await sheetsOf(f);
      const s = sheets.find((x) => /uom|pack/i.test(x.sheet)) ?? sheets[0];
      const list = parsePackList(s.data);
      if (!list.length) setMsg({ ok: false, text: `No item codes found on sheet "${s.sheet}". It needs a column called SKU or Item code.` });
      else {
        const { data: n, error } = await supabase.rpc("sap_pack_replace", { p_items: list.map((x) => ({ item_code: x.code, description: x.desc })) });
        if (error) throw error;
        await loadSaved();
        setMsg({ ok: true, text: `Pack list saved: ${n} items from sheet "${s.sheet}". Everyone in finance now uses this list.` });
      }
    } catch (e) {
      setMsg({ ok: false, text: `The pack list was not saved. ${(e as { message?: string })?.message ?? ""}` });
    }
    setBusy(false);
  }

  function trySample() {
    setData({ name: "Sample export (made-up data)", lines: parseSap(SAMPLE).lines, sample: true });
    setDoc(""); setQ(""); setMsg(null); setSkipPrior(true);
  }

  async function download() {
    if (!result || !data || !outRows.length) return;
    setBusy(true); setMsg(null);
    // Record what goes into the file first, so the next upload can warn about these invoices.
    if (!data.sample && !isRecorded) {
      const { data: id, error } = await supabase.rpc("sap_import_record", {
        p_file: data.name,
        p_lines: outRows.map((r) => ({ doc_no: r.docNo, doc_date: iso(r.docDate), customer: r.code, item_code: String(r.itemCode), uom: r.uom, qty: r.qty, unit_price: r.unitPrice, amount: r.amount, discount: r.discount })),
      });
      if (error) { setMsg({ ok: false, text: `Nothing was downloaded: the import could not be recorded. ${error.message}` }); setBusy(false); return; }
      setRecorded({ for: data, id: id as number });
      void loadSaved();
    }
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const head = (t: string) => ({ value: t, fontWeight: "bold" as const });
    const rows = outRows.map((r) => [
      { value: r.code }, { value: r.customerName }, { value: r.agent }, { value: r.docNo },
      r.docDate ? { value: r.docDate, format: "dd/mm/yyyy" } : { value: "" },
      { value: r.docRef }, { value: r.itemCode }, { value: r.qty }, { value: r.uom },
      { value: r.unitPrice }, { value: r.amount }, { value: r.discount ? r.discount.toFixed(2) : "" }, { value: r.suomQty },
    ]);
    const first = outRows.find((r) => r.docDate)?.docDate ?? null;
    await writeExcelFile([{ sheet: "IMPORT", columns: [14, 36, 14, 14, 12, 18, 12, 10, 8, 12, 12, 10, 10].map((width) => ({ width })), data: [IMPORT_HEADERS.map(head), ...rows] }])
      .toFile(`Invoice import ${ymd(first) || "SAP"}.xlsx`);
    setBusy(false);
  }

  async function removeBatch(b: Batch) {
    if (!confirm(`Remove the record of "${b.file_name}" (${plural(b.invoices, "invoice", "invoices")})?\n\nThose invoices will no longer be flagged as already imported. Nothing in your accounting system changes.`)) return;
    const { error } = await supabase.from("sap_import_batches").delete().eq("id", b.id);
    setMsg(error ? { ok: false, text: `Not removed. ${error.message}` } : { ok: true, text: `Record of "${b.file_name}" removed.` });
    void loadSaved();
  }

  const errors = result?.issues.filter((i) => i.level === "error") ?? [];
  const warns = [...priceIssues, ...(result?.issues.filter((i) => i.level === "warn") ?? [])];
  const issues = [...errors, ...warns];
  const docs = totals.map((t) => t.docNo);
  const shown = (result?.rows ?? []).filter((r) => (!doc || r.docNo === doc) && (!q || `${r.itemCode} ${r.desc} ${r.customerName}`.toLowerCase().includes(q.toLowerCase())));
  const netTotal = totals.reduce((s, t) => s + t.sapNet, 0);
  const allMatch = totals.length > 0 && totals.every((t) => t.ok);
  const leftOut = (d: string) => errors.filter((e) => e.docNo === d).length;
  const splits = (result?.rows.filter((r) => r.split).length ?? 0) / 2;

  return (
    <>
      <PageHeader
        title="SAP invoice import"
        sub="Upload the invoice export from Colgate SAP. The app sorts it, works out carton prices, splits carton and loose quantities, checks every total, and gives you the file to import."
        right={result && data && <button onClick={download} disabled={busy || checking || !outRows.length || (!data.sample && !canUse)} className={`${btnPrimary} inline-flex items-center gap-2`}><Download size={18} /> {isRecorded ? "Download again" : `Download import file (${outRows.length} lines)`}</button>}
      />

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card title="SAP export">
          <p className="text-sm text-slate-600">The Excel file from SAP, exactly as exported. No sorting, deleting or formulas needed first.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={() => fileRef.current?.click()} disabled={busy} className={`${btnPrimary} inline-flex items-center gap-2`}><FileUp size={18} /> Choose SAP file</button>
            <button onClick={trySample} disabled={busy} className={btnGhost}>Try with sample data</button>
            {data && <span className="text-sm text-slate-600">Loaded: <b className="font-medium text-slate-800">{data.name}</b></span>}
          </div>
          <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { readExport(e.target.files?.[0]); e.target.value = ""; }} />
        </Card>
        <Card title="Items sold by the pack">
          <p className="text-sm text-slate-600">
            {packs.length ? <><b className="font-medium text-slate-800">{plural(packs.length, "item", "items")}</b> {packs.length === 1 ? "shows its" : "show their"} loose quantity as Pack instead of Unit.{data?.sample && " (sample list)"}</> : "No list yet, so every loose quantity shows as Unit."}
          </p>
          {canUse && <div className="mt-3 flex items-center gap-2">
            <button onClick={() => packRef.current?.click()} disabled={busy} className={`${btnGhost} inline-flex shrink-0 items-center gap-2 whitespace-nowrap`}><PackageOpen size={18} /> {packs.length ? "Replace list" : "Load list"}</button>
            <span className="text-xs text-slate-500">From the NEW UOM sheet (SKU column). Shared by everyone in finance.</span>
          </div>}
          <input ref={packRef} type="file" accept=".xlsx" className="hidden" onChange={(e) => { readPacks(e.target.files?.[0]); e.target.value = ""; }} />
        </Card>
      </div>

      {msg && <div className={`mt-4 rounded-md px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</div>}

      {!result && !msg && (
        <Card className="mt-4">
          <div className="py-8 text-center text-slate-500">Choose the SAP export to begin, or try the sample to see how it works.</div>
        </Card>
      )}

      {result && data && (
        <>
          <div className="mt-4">
            <KpiStrip>
              <Kpi label="Invoices" value={String(totals.length)} sub={`${data.lines.length} SAP lines`} />
              <Kpi label="Import lines" value={String(result.rows.length)} sub={splits ? `${plural(splits, "item", "items")} split into carton + loose` : "No carton + loose splits"} />
              <Kpi label="Net total" value={`RM ${rm(netTotal)}`} tone={allMatch ? "good" : "bad"} sub={allMatch ? "Every invoice matches SAP to the sen" : errors.length ? "Short by the lines left out" : "Some invoices do not match SAP"} />
              <Kpi label="Checks" value={checking ? "Checking…" : errors.length ? `${errors.length} to fix` : warns.length || priorDocs.length ? `${warns.length + priorDocs.length} to look at` : "All clear"} tone={checking ? "neutral" : errors.length ? "bad" : warns.length || priorDocs.length ? "warn" : "good"} sub={checking ? "Comparing with earlier imports" : errors.length ? "These lines are left out of the file" : warns.length || priorDocs.length ? "The file is ready; these are worth a look" : "Nothing unusual found"} />
            </KpiStrip>
          </div>

          {priorDocs.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p><b className="font-semibold">{plural(priorDocs.length, "invoice was", "invoices were")} imported before:</b> {priorDocs.slice(0, 6).map((d) => `${d} (${dateTxt(prior.get(d)!.at)})`).join(", ")}{priorDocs.length > 6 ? ` and ${priorDocs.length - 6} more` : ""}.</p>
              <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={skipPrior} disabled={isRecorded} onChange={(e) => setSkipPrior(e.target.checked)} className="h-4 w-4" /> Leave them out of this file, so they are not imported twice</label>
            </div>
          )}

          {issues.length > 0 && (
            <Card className="mt-4" title="Checks" right={issues.length > 8 && <button onClick={() => setAllIssues(!allIssues)} className="text-sm font-medium text-indigo-700 hover:underline">{allIssues ? "Show fewer" : `Show all ${issues.length}`}</button>}>
              <ul className="divide-y divide-slate-100">
                {(allIssues ? issues : issues.slice(0, 8)).map((i, n) => (
                  <li key={n} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
                    <Badge tone={i.level === "error" ? "red" : "amber"}>{i.level === "error" ? "Left out" : "Check"}</Badge>
                    <span className="text-sm text-slate-500">{i.docNo}</span>
                    <span className="min-w-0 flex-1 text-sm"><b className="font-medium text-slate-800">{i.item}</b> <span className="text-slate-600">{i.text}</span></span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="mt-4" title="Invoice totals" right={<span className="text-sm text-slate-500">SAP against the import file</span>}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Customer</Th><Th right>SAP net (RM)</Th><Th right>Import amount (RM)</Th><Th right>Scheme discount (RM)</Th><Th right>Lines</Th><Th /></tr></thead>
                <tbody>
                  {totals.map((t) => (
                    <tr key={t.docNo} className="border-b border-slate-100">
                      <Td first><button onClick={() => setDoc(doc === t.docNo ? "" : t.docNo)} className="font-medium text-indigo-700 hover:underline">{t.docNo}</button></Td>
                      <Td>{t.customer}</Td>
                      <Td right>{rm(t.sapNet)}</Td>
                      <Td right>{rm(t.outNet)}</Td>
                      <Td right>{t.outDisc ? rm(t.outDisc) : "–"}</Td>
                      <Td right>{t.lines}</Td>
                      <Td right>{prior.has(t.docNo) ? <span className="mr-1"><Badge tone="amber">{skipPrior ? "Left out: " : ""}imported {dateTxt(prior.get(t.docNo)!.at)}</Badge></span> : null}{t.ok ? <Badge tone="green">Matches</Badge> : leftOut(t.docNo) ? <Badge tone="red">{plural(leftOut(t.docNo), "line", "lines")} left out</Badge> : <Badge tone="red">Differs</Badge>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="mt-4" title="Import lines" right={
            <div className="flex flex-wrap items-center gap-2">
              <select value={doc} onChange={(e) => setDoc(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                <option value="">All invoices</option>
                {docs.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <label className="relative"><Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or customer" className="w-48 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm" /></label>
            </div>}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Date</Th><Th>Item</Th><Th right>Qty</Th><Th>UOM</Th><Th right>Carton price</Th><Th right>Discount</Th><Th right>Amount</Th><Th right>Per carton</Th></tr></thead>
                <tbody>
                  {shown.length === 0 && <tr><Td first className="text-slate-500">No lines match.</Td></tr>}
                  {shown.slice(0, 400).map((r: ImportRow, n) => (
                    <tr key={n} className={`border-b border-slate-100 ${r.split ? "bg-indigo-50/40" : ""}`}>
                      <Td first>{r.docNo}</Td>
                      <Td className="whitespace-nowrap">{dmy(r.docDate)}</Td>
                      <Td><span className="text-slate-500">{r.itemCode}</span> {r.desc}{r.split && <span className="ml-2"><Badge tone="blue">Split</Badge></span>}</Td>
                      <Td right>{r.qty}</Td>
                      <Td><Badge tone={r.uom === "Ctn" ? "grey" : r.uom === "Pack" ? "amber" : "blue"}>{r.uom}</Badge></Td>
                      <Td right><span title={String(r.unitPrice)}>{rm(r.unitPrice)}</span></Td>
                      <Td right>{r.discount ? rm(r.discount) : "–"}</Td>
                      <Td right className="font-medium">{rm(r.amount)}</Td>
                      <Td right>{r.suomQty}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {shown.length > 400 && <p className="mt-2 text-sm text-slate-500">Showing the first 400 of {shown.length} lines. The download has them all.</p>}
          </Card>
        </>
      )}
      {isRecorded && <p className="mt-4 text-sm text-emerald-700">Recorded in the import history. The next upload will warn about these invoices.</p>}

      {batches.length > 0 && (
        <Card className="mt-4" title="Import history" right={<span className="text-sm text-slate-500">Last {batches.length} files made</span>}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Made</Th><Th>SAP file</Th><Th>By</Th><Th>Invoice dates</Th><Th right>Invoices</Th><Th right>Lines</Th><Th right>Net (RM)</Th><Th /></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b border-slate-100">
                    <Td first className="whitespace-nowrap">{new Date(b.made_at).toLocaleString("en-MY", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</Td>
                    <Td>{b.file_name}</Td>
                    <Td>{b.made_by_name || "–"}</Td>
                    <Td className="whitespace-nowrap">{b.doc_from === b.doc_to ? dateTxt(b.doc_from) : `${dateTxt(b.doc_from)} – ${dateTxt(b.doc_to)}`}</Td>
                    <Td right>{b.invoices}</Td>
                    <Td right>{b.lines}</Td>
                    <Td right>{rm(Number(b.net_total))}</Td>
                    <Td right>{canUse && <button onClick={() => removeBatch(b)} title="Remove this record" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></button>}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
