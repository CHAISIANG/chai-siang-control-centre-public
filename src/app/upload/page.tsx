"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, Trash2, X } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { btnGhost, btnPrimary } from "@/components/finui";
import { useData } from "@/components/data";
import { useRole } from "@/components/role";
import { NOV, sumStats } from "@/lib/mock";
import { uploadReports, type UploadResult } from "@/lib/reportsUpload";
import { agingAsAt, crossChecks, detectReport, KIND_LABEL, parseAging, parseCoverage, parseCustomers, parseProducts, type Aging, type Coverage, type CustomerReport, type Kind, type ProductSales, type Row } from "@/lib/reports";

const KINDS: Kind[] = ["aging", "coverage", "products", "customers"];
const LOG_NAME: Record<Kind, string> = { aging: "Aging", coverage: "Coverage and Net Sales", products: "Sales by Products and Sales Rep", customers: "Net Sales by Customer" };
const rm = (n: number) => "RM " + Math.round(n).toLocaleString("en-MY");
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const todayMYT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const dayOf = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date(iso));
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

type Loaded = { aging?: Aging; coverage?: Coverage; products?: ProductSales; customers?: CustomerReport };
type Seen = { name: string; kind: Kind | null; rows: number; error?: string };

export default function UploadPage() {
  const { uploads, asAt, customers, salesmen, reload } = useData();
  const { can } = useRole();
  const [data, setData] = useState<Loaded>({});
  const [files, setFiles] = useState<Seen[]>([]);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<UploadResult[] | null>(null);

  async function read(list: FileList | File[] | null) {
    const arr = list ? Array.from(list) : [];
    if (!arr.length) return;
    setBusy(true);
    const next: Loaded = { ...data };
    const seen: Seen[] = [];
    for (const f of arr) {
      if (!/\.xlsx$/i.test(f.name)) { seen.push({ name: f.name, kind: null, rows: 0, error: "Use an Excel .xlsx file." }); continue; }
      try {
        const rows = (await readSheet(f)) as Row[];
        const kind = detectReport(rows);
        if (!kind) { seen.push({ name: f.name, kind: null, rows: rows.length, error: "This is not one of the four reports." }); continue; }
        if (kind === "aging") next.aging = parseAging(rows);
        if (kind === "coverage") next.coverage = parseCoverage(rows);
        if (kind === "products") next.products = parseProducts(rows);
        if (kind === "customers") next.customers = parseCustomers(rows);
        seen.push({ name: f.name, kind, rows: rows.length });
      } catch (e) {
        seen.push({ name: f.name, kind: null, rows: 0, error: e instanceof Error ? e.message : "The file could not be read." });
      }
    }
    setData(next);
    setFiles((old) => [...old.filter((o) => !seen.some((s) => s.kind && s.kind === o.kind)), ...seen]);
    setBusy(false);
  }

  const loaded = KINDS.filter((k) => data[k]);
  const checks = useMemo(() => crossChecks(data), [data]);
  const newAsAt = data.aging ? agingAsAt(data.aging) : "";

  // What the system holds today, worked out from what is already on screen.
  const now = useMemo(() => {
    const novSales = sumStats(salesmen, NOV).sales;
    return {
      owed: customers.reduce((s, c) => s + c.outstanding, 0), owing: customers.filter((c) => c.outstanding > 0).length,
      nov: novSales, ytd: salesmen.reduce((s, sm) => s + sm.stats.reduce((a, st) => a + st.sales, 0), 0), salesmen: salesmen.length,
      custYtd: customers.reduce((s, c) => s + c.ytdSales, 0),
    };
  }, [customers, salesmen]);

  const today = todayMYT();
  const fresh = KINDS.map((k) => {
    const last = uploads.find((u) => u.report === LOG_NAME[k]);
    return { k, last, ok: !!last && dayOf(last.uploaded_at) === today };
  });

  const changes: { what: string; now: string; next: string; same: boolean }[] = [];
  if (data.aging) changes.push({ what: "Owed to us (open invoices)", now: `${rm(now.owed)} from ${now.owing} customers`, next: `${rm(data.aging.sum)} from ${new Set(data.aging.invoices.map((i) => i.custCode)).size} customers · as at ${dmy(newAsAt)}`, same: Math.round(now.owed) === Math.round(data.aging.sum) });
  if (data.coverage?.total) changes.push({ what: "November sales and coverage", now: `${rm(now.nov)} · ${now.salesmen} salesmen`, next: `${rm(data.coverage.total.sales[10] ?? 0)} · ${data.coverage.reps.length} salesmen`, same: Math.round(now.nov) === Math.round(data.coverage.total.sales[10] ?? 0) });
  if (data.coverage?.total) changes.push({ what: "Sales this year", now: rm(now.ytd), next: rm(data.coverage.total.ytd.sales ?? 0), same: Math.round(now.ytd) === Math.round(data.coverage.total.ytd.sales ?? 0) });
  if (data.products) changes.push({ what: "Invoice lines by product", now: `${rm(now.nov)} net so far this month`, next: `${data.products.lines.length.toLocaleString()} lines, ${rm(data.products.net)} net, ${dmy(data.products.lines.map((l) => l.date).sort()[0])} to ${dmy(data.products.lines.map((l) => l.date).sort().pop() ?? "")}`, same: Math.round(now.nov) === Math.round(data.products.net) });
  if (data.customers) changes.push({ what: "Sales by customer", now: rm(now.custYtd), next: `${rm(data.customers.sum)} · ${data.customers.customers.filter((c) => c.ytd !== 0).length} customers bought`, same: Math.round(now.custYtd) === Math.round(data.customers.sum) });

  const allowed = can("page_upload");
  // A report whose own totals do not add up is probably damaged: do not load it. Other differences are warnings.
  const blocking = checks.filter((c) => !c.ok && (c.title === "Aging adds up" || c.title === "Product report adds up"));
  const warnings = checks.filter((c) => !c.ok && !blocking.includes(c));
  const names = Object.fromEntries(files.filter((f) => f.kind).map((f) => [f.kind as Kind, f.name])) as Partial<Record<Kind, string>>;

  async function load() {
    setLoading(true); setResults(null);
    const r = await uploadReports(data, names, today);
    setResults(r); setLoading(false); setConfirming(false); setAck(false);
    if (r.some((x) => x.ok)) { reload(); }
    if (r.every((x) => x.ok)) { setData({}); setFiles([]); }
  }

  return (
    <>
      <PageHeader title="Upload your daily reports" sub="Attach the Excel reports you export each day. The system reads them here, shows what will change, and updates the dashboard after you confirm." />

      <Card title="Is the data up to date?" right={<span className="text-sm text-slate-500">Today is {dmy(today)}</span>}>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {fresh.map(({ k, last, ok }) => (
            <li key={k} className={`rounded-lg border p-3 ${ok ? "border-emerald-200 bg-emerald-50/60" : "border-amber-300 bg-amber-50/60"}`}>
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-slate-900">{KIND_LABEL[k]}</span><Badge tone={ok ? "green" : "amber"}>{ok ? "Updated today" : last ? "Not updated today" : "Never loaded"}</Badge></div>
              <div className="mt-1 text-sm text-slate-600">{last ? `Last loaded ${when(last.uploaded_at)}${k === "aging" && asAt ? ` · data as at ${dmy(asAt)}` : ""}` : "No file has been loaded yet."}</div>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Attach files" className="mt-4">
        {!allowed ? <p className="text-slate-600">Your role cannot upload reports. Ask your administrator.</p> : (
          <div className="space-y-3">
            <label
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); void read(e.dataTransfer.files); }}
              className={`flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed px-4 py-8 text-center ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50 hover:bg-slate-100"}`}>
              {busy ? <Loader2 size={30} className="animate-spin text-indigo-600" /> : <FileSpreadsheet size={30} className="text-indigo-600" />}
              <span className="text-base font-medium text-slate-800">{busy ? "Reading…" : "Choose your Excel files, or drag them here"}</span>
              <span className="text-sm text-slate-500">You can attach one report or all four together. The system works out which report each file is.</span>
              <input type="file" multiple accept=".xlsx" className="sr-only" onChange={(e) => { void read(e.target.files); e.target.value = ""; }} />
            </label>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {KINDS.map((k) => {
                const f = files.find((x) => x.kind === k);
                return <li key={k} className="flex items-center gap-2 text-[15px]">{f ? <Check size={16} className="text-emerald-600" /> : <X size={16} className="text-slate-300" />}<span className={f ? "text-slate-800" : "text-slate-400"}>{KIND_LABEL[k]}</span>{f && <span className="truncate text-sm text-slate-500">· {f.name}</span>}</li>;
              })}
            </ul>
            {files.filter((f) => f.error).map((f) => <p key={f.name} role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{f.name}: {f.error}</p>)}
          </div>
        )}
      </Card>

      {loaded.length > 0 && allowed && (
        <>
          <Card title="What the files contain" className="mt-4">
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Report</Th><Th right>Rows</Th><Th>Key numbers</Th><Th>Left out</Th></tr></thead>
              <tbody>
                {data.aging && <tr className="border-b border-slate-100"><Td first className="font-medium">{KIND_LABEL.aging}</Td><Td right>{data.aging.invoices.length.toLocaleString()}</Td><Td className="!whitespace-normal">{rm(data.aging.sum)} owed · as at {dmy(newAsAt)}</Td><Td>–</Td></tr>}
                {data.coverage && <tr className="border-b border-slate-100"><Td first className="font-medium">{KIND_LABEL.coverage}</Td><Td right>{data.coverage.reps.length} salesmen</Td><Td className="!whitespace-normal">{rm(data.coverage.total?.sales[10] ?? 0)} in November · {rm(data.coverage.total?.ytd.sales ?? 0)} this year</Td><Td className="!whitespace-normal">{data.coverage.skipped.length ? `${data.coverage.skipped.length} salesmen on the never-load list` : "–"}</Td></tr>}
                {data.products && <tr className="border-b border-slate-100"><Td first className="font-medium">{KIND_LABEL.products}</Td><Td right>{data.products.lines.length.toLocaleString()}</Td><Td className="!whitespace-normal">{rm(data.products.net)} net · {new Set(data.products.lines.map((l) => l.invoice)).size} invoices</Td><Td>{data.products.skippedLines ? `${data.products.skippedLines} lines` : "–"}</Td></tr>}
                {data.customers && <tr className="border-b border-slate-100"><Td first className="font-medium">{KIND_LABEL.customers}</Td><Td right>{data.customers.customers.length.toLocaleString()}</Td><Td className="!whitespace-normal">{rm(data.customers.sum)} this year · {data.customers.customers.filter((c) => c.ytd !== 0).length} customers bought</Td><Td>–</Td></tr>}
              </tbody>
            </table></div>
          </Card>

          <Card title="What will change in the system" className="mt-4" right={<span className="text-sm text-slate-500">Compared with what the system shows now</span>}>
            <div className="overflow-x-auto"><table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Figure</Th><Th>Now</Th><Th>After loading</Th><Th /></tr></thead>
              <tbody>{changes.map((c) => <tr key={c.what} className="border-b border-slate-100"><Td first className="font-medium">{c.what}</Td><Td className="!whitespace-normal">{c.now}</Td><Td className="!whitespace-normal">{c.next}</Td><Td>{c.same ? <Badge tone="grey">Same</Badge> : <Badge tone="blue">Changes</Badge>}</Td></tr>)}</tbody>
            </table></div>
            <p className="mt-3 text-sm text-slate-500">Each report replaces its own figures: the open invoices and sales by customer are replaced in full, the invoice lines are replaced for the dates the file covers, and the coverage report updates each month it contains. Reports you do not attach stay as they are.</p>
          </Card>

          <Card title="Do the reports agree?" className="mt-4" right={<span className="text-sm text-slate-500">{checks.filter((c) => c.ok).length} of {checks.length} checks pass</span>}>
            {checks.length === 0 ? <p className="text-slate-500">Attach more than one report to compare them. Each report is still checked against its own totals.</p> : (
              <ul className="divide-y divide-slate-100">
                {checks.map((c) => (
                  <li key={c.title} className="flex gap-3 py-2.5">
                    {c.ok ? <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />}
                    <div><div className="font-medium text-slate-900">{c.title}</div><div className="text-[15px] text-slate-600">{c.detail}</div></div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {blocking.length > 0 && <p role="alert" className="mt-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800">Cannot load: {blocking.map((c) => c.title.toLowerCase()).join(" and ")} failed, so the file may be damaged. Export it again from your system and attach the new file.</p>}
          {!confirming ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button onClick={() => setConfirming(true)} disabled={blocking.length > 0 || loading} className={`${btnPrimary} inline-flex items-center gap-2`}>Load into the system</button>
              <button onClick={() => { setData({}); setFiles([]); setResults(null); }} className={`${btnGhost} inline-flex items-center gap-2`}><Trash2 size={16} /> Clear</button>
            </div>
          ) : (
            <div className="mt-4 space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
              <div className="font-medium text-slate-900">Replace the figures listed above with these files?</div>
              <p className="text-sm text-slate-600">The dashboard and the other screens will show the new figures straight away. Each report loads in one step: if something goes wrong, that report keeps its old figures.</p>
              {warnings.length > 0 && <label className="flex items-start gap-2 text-sm text-amber-900"><input type="checkbox" className="mt-0.5 h-4 w-4" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have read the {warnings.length} warning{warnings.length === 1 ? "" : "s"} above and still want to load.</label>}
              <div className="flex flex-wrap gap-3">
                <button onClick={() => void load()} disabled={loading || (warnings.length > 0 && !ack)} className={`${btnPrimary} inline-flex items-center gap-2`}>{loading && <Loader2 size={16} className="animate-spin" />}{loading ? "Loading…" : "Yes, load now"}</button>
                <button onClick={() => { setConfirming(false); setAck(false); }} disabled={loading} className={btnGhost}>Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {results && (
        <Card title="Result" className="mt-4">
          <ul className="space-y-1.5">
            {results.map((r) => (
              <li key={r.kind} className="flex items-start gap-2 text-[15px]">
                {r.ok ? <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <X size={18} className="mt-0.5 shrink-0 text-rose-600" />}
                <span><b>{KIND_LABEL[r.kind]}:</b> {r.ok ? r.message : `not loaded. ${r.message}`}</span>
              </li>
            ))}
          </ul>
          {results.every((r) => r.ok) && <p className="mt-3 text-sm text-emerald-800">Done. The dashboard now shows the new figures.</p>}
          {results.some((r) => !r.ok) && <p className="mt-3 text-sm text-rose-800">Reports marked &quot;not loaded&quot; kept their old figures. Fix the problem and attach them again.</p>}
        </Card>
      )}

      <Card title="Upload history" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Report</Th><Th>File</Th><Th>Loaded</Th><Th right>Rows</Th><Th>Status</Th></tr></thead>
            <tbody>
              {uploads.length === 0 && <tr><Td first className="text-slate-500">No reports have been loaded yet.</Td></tr>}
              {uploads.map((u, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <Td first><b>{u.report}</b></Td><Td>{u.file_name ?? "–"}</Td><Td>{when(u.uploaded_at)}</Td><Td right>{u.row_count ? u.row_count.toLocaleString() : "–"}</Td>
                  <Td><Badge tone={u.status === "OK" ? "green" : u.status === "Late" ? "amber" : "red"}>{u.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-slate-500">Want to look at a set of files without loading them? Use the <Link href="/test-run" className="font-medium text-indigo-700 underline">Real data test run</Link>.</p>
      </Card>
    </>
  );
}
