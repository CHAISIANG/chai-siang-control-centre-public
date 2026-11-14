"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, Check, FileSpreadsheet, Loader2, X } from "lucide-react";
import { readSheet } from "read-excel-file/browser";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import {
  AGE_BUCKETS, agentToSalesman, bucketIndex, crossChecks, custCodeOf, detectReport, KIND_LABEL, parseAging, parseCoverage, parseCustomers, parseProducts,
  type Aging, type Coverage, type CustomerReport, type Kind, type ProductSales, type Row,
} from "@/lib/reports";

const rm = (n: number) => "RM " + Math.round(n).toLocaleString("en-MY");
const rm2 = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pc = (n: number) => `${Math.round(n)}%`;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

type Data = { aging?: Aging; coverage?: Coverage; products?: ProductSales; customers?: CustomerReport };
type Tab = "overview" | "aging" | "sales" | "products" | "customers";

function groupBy<T, K>(list: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const t of list) { const k = key(t); const a = m.get(k); if (a) a.push(t); else m.set(k, [t]); }
  return m;
}
const sum = <T,>(list: T[], f: (t: T) => number) => list.reduce((s, t) => s + f(t), 0);
const Bar = ({ v, max, tone = "bg-indigo-500" }: { v: number; max: number; tone?: string }) => <div className="h-2 w-full min-w-16 overflow-hidden rounded-sm bg-slate-100"><div className={`h-full ${tone}`} style={{ width: `${max ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%` }} /></div>;

export default function TestRun() {
  const [data, setData] = useState<Data>({});
  const [files, setFiles] = useState<{ name: string; kind: Kind | null; rows: number; error?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("overview");

  async function load(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    const next: Data = { ...data };
    const seen: typeof files = [];
    for (const f of Array.from(list)) {
      try {
        const rows = (await readSheet(f)) as Row[];
        const kind = detectReport(rows);
        if (!kind) { seen.push({ name: f.name, kind: null, rows: rows.length, error: "This does not look like one of the four reports." }); continue; }
        if (kind === "aging") next.aging = parseAging(rows);
        if (kind === "coverage") next.coverage = parseCoverage(rows);
        if (kind === "products") next.products = parseProducts(rows);
        if (kind === "customers") next.customers = parseCustomers(rows);
        seen.push({ name: f.name, kind, rows: rows.length });
      } catch (e) {
        seen.push({ name: f.name, kind: null, rows: 0, error: e instanceof Error ? e.message : "The file could not be read." });
      }
    }
    setData(next); setFiles((old) => [...old.filter((o) => !seen.some((s) => s.kind && s.kind === o.kind)), ...seen]); setBusy(false);
  }

  const loaded = (["aging", "coverage", "products", "customers"] as Kind[]).filter((k) => data[k]);
  const checks = useMemo(() => crossChecks(data), [data]);
  const { aging, coverage, products, customers } = data;
  const repName = (code: string) => coverage?.reps.find((r) => r.code === code)?.name ?? "";

  // ----- derived numbers -----
  const day = useMemo(() => (products?.lines.length ? Math.max(...products.lines.map((l) => Number(l.date.slice(8, 10)))) : 13), [products]);
  const agingView = useMemo(() => {
    if (!aging) return null;
    const inv = aging.invoices;
    const buckets = AGE_BUCKETS.map((b, i) => { const l = inv.filter((x) => bucketIndex(x.age) === i); return { label: b.label, amount: sum(l, (x) => x.outstanding), n: l.length }; });
    const total = aging.sum, overdue = sum(inv.filter((x) => x.age > 0), (x) => x.outstanding), over60 = sum(inv.filter((x) => x.age > 60), (x) => x.outstanding);
    const agents = [...groupBy(inv, (x) => x.agent)].map(([a, l]) => ({ agent: a, name: repName(agentToSalesman(a)), total: sum(l, (x) => x.outstanding), overdue: sum(l.filter((x) => x.age > 0), (x) => x.outstanding), over60: sum(l.filter((x) => x.age > 60), (x) => x.outstanding), n: l.length })).sort((a, b) => b.total - a.total);
    const debtors = [...groupBy(inv, (x) => x.custCode)].map(([c, l]) => ({ code: c, name: l[0].customer, total: sum(l, (x) => x.outstanding), overdue: sum(l.filter((x) => x.age > 0), (x) => x.outstanding), over90: sum(l.filter((x) => x.age > 90), (x) => x.outstanding), oldest: Math.max(...l.map((x) => x.age)), n: l.length, agent: l[0].agent })).sort((a, b) => b.total - a.total);
    const oldest = [...inv].sort((a, b) => b.age - a.age).slice(0, 12);
    return { buckets, total, overdue, over60, agents, debtors, oldest, customers: debtors.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aging, coverage]);

  const salesView = useMemo(() => {
    if (!coverage?.total) return null;
    const rows = coverage.reps.map((r) => {
      const nov = r.sales[10] ?? 0, oct = r.sales[9] ?? 0, octT = r.target[9] ?? 0, projected = (nov / day) * 30;
      return { code: r.code, name: r.name, nov, oct, octT, projected, projPct: octT ? (projected / octT) * 100 : 0, ytd: r.ytd.sales ?? 0, ytdT: r.ytd.target ?? 0, active: r.active[10] ?? 0, rl: r.rl[10] ?? 0, erc: r.erc[10] ?? 0, ercOct: r.erc[9] ?? 0, calls: r.invoices[10] ?? 0 };
    }).sort((a, b) => b.nov - a.nov);
    const t = coverage.total;
    return { rows, nov: t.sales[10] ?? 0, oct: t.sales[9] ?? 0, octT: t.target[9] ?? 0, ytd: t.ytd.sales ?? 0, ytdT: t.ytd.target ?? 0, active: t.active[10] ?? 0, rl: t.rl[10] ?? 0, monthly: t.sales.slice(0, 11), monthlyT: t.target.slice(0, 11) };
  }, [coverage, day]);

  const productView = useMemo(() => {
    if (!products) return null;
    const L = products.lines;
    const prod = [...groupBy(L, (l) => l.product)].map(([c, l]) => ({ code: c, desc: l[0].desc, net: sum(l, (x) => x.net), gross: sum(l, (x) => x.gross), cs: sum(l, (x) => x.qtyCS), ea: sum(l, (x) => x.qtyEA), inv: new Set(l.map((x) => x.invoice)).size })).sort((a, b) => b.net - a.net);
    const reps = [...groupBy(L, (l) => l.rep)].map(([c, l]) => ({ code: c, name: l[0].repName, net: sum(l, (x) => x.net), gross: sum(l, (x) => x.gross), inv: new Set(l.map((x) => x.invoice)).size, cust: new Set(l.map((x) => x.custCode)).size })).sort((a, b) => b.net - a.net);
    const days = [...groupBy(L, (l) => l.date)].map(([d, l]) => ({ date: d, net: sum(l, (x) => x.net), inv: new Set(l.map((x) => x.invoice)).size })).sort((a, b) => a.date.localeCompare(b.date));
    const cust = [...groupBy(L, (l) => l.custCode)].map(([c, l]) => ({ code: c, name: l[0].customer, net: sum(l, (x) => x.net), inv: new Set(l.map((x) => x.invoice)).size })).sort((a, b) => b.net - a.net);
    const totalInv = new Set(L.map((l) => l.invoice)).size;
    return { prod, reps, days, cust, totalInv, net: products.net, gross: products.gross };
  }, [products]);

  const custView = useMemo(() => {
    if (!customers) return null;
    const owed = new Map<string, { total: number; over60: number }>();
    if (aging) for (const [c, l] of groupBy(aging.invoices, (x) => custCodeOf(x.custCode))) owed.set(c, { total: sum(l, (x) => x.outstanding), over60: sum(l.filter((x) => x.age > 60), (x) => x.outstanding) });
    const act = customers.customers.filter((c) => c.ytd !== 0);
    const top = [...act].sort((a, b) => b.ytd - a.ytd);
    const total = sum(act, (c) => c.ytd);
    const declining = act.filter((c) => c.pyAms > 0 && c.ytdAms < 0.7 * c.pyAms && c.pyAms - c.ytdAms > 2000).sort((a, b) => (b.pyAms - b.ytdAms) - (a.pyAms - a.ytdAms)).slice(0, 15);
    const stopped = act.filter((c) => c.months[8] === 0 && c.months[9] === 0 && c.months[10] === 0 && sum(c.months.slice(0, 8), (x) => x) > 20000).sort((a, b) => sum(b.months.slice(0, 8), (x) => x) - sum(a.months.slice(0, 8), (x) => x)).slice(0, 15);
    return { top, total, declining, stopped, owed, active: act.length, all: customers.customers.length, top10: sum(top.slice(0, 10), (c) => c.ytd) };
  }, [customers, aging]);

  const tabs: [Tab, string][] = [["overview", "Overview"], ["aging", "Who owes us"], ["sales", "Sales & coverage"], ["products", "Products & sales reps"], ["customers", "Customers"]];
  const need = (k: Kind) => <Card><p className="p-4 text-slate-500">Load the {KIND_LABEL[k]} report to see this.</p></Card>;

  return (
    <>
      <PageHeader title="Real data test run" sub="Your four weekly Excel reports, read in this browser only. Nothing is uploaded, saved or sent anywhere, and a refresh clears it." right={<Badge tone="amber">Test run</Badge>} />

      <Card title="Load the reports">
        <div className="space-y-3 p-4">
          <label className="flex cursor-pointer flex-col items-center gap-1 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:bg-slate-100">
            {busy ? <Loader2 size={26} className="animate-spin text-indigo-600" /> : <FileSpreadsheet size={26} className="text-indigo-600" />}
            <span className="text-base font-medium text-slate-800">{busy ? "Reading…" : "Choose the four Excel files (select all four at once)"}</span>
            <span className="text-sm text-slate-500">Aging, Coverage and Net sales, Sales by products and Sales Rep, Net Sales By Customer</span>
            <input type="file" multiple accept=".xlsx" className="sr-only" onChange={(e) => { void load(e.target.files); e.target.value = ""; }} />
          </label>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(["aging", "coverage", "products", "customers"] as Kind[]).map((k) => {
              const f = files.find((x) => x.kind === k);
              return <li key={k} className="flex items-center gap-2 text-[15px]">{f ? <Check size={16} className="text-emerald-600" /> : <X size={16} className="text-slate-300" />}<span className={f ? "text-slate-800" : "text-slate-400"}>{KIND_LABEL[k]}</span>{f && <span className="text-sm text-slate-500">· {f.name} · {f.rows.toLocaleString()} rows</span>}</li>;
            })}
          </ul>
          {files.filter((f) => f.error).map((f) => <p key={f.name} role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{f.name}: {f.error}</p>)}
        </div>
      </Card>

      {loaded.length > 0 && (
        <>
          <div className="mb-4 mt-4 inline-flex flex-wrap rounded-md border border-slate-300 bg-white p-0.5 text-base">
            {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded px-4 py-1.5 ${tab === k ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{l}</button>)}
          </div>

          {tab === "overview" && (
            <div className="space-y-4">
              <KpiStrip>
                <Kpi label="Net sales this year" value={salesView ? rm(salesView.ytd) : "–"} sub={salesView && salesView.ytdT ? `${pc((salesView.ytd / salesView.ytdT) * 100)} of the year's target so far` : "Load the coverage report"} />
                <Kpi label={`November so far (${day} days)`} value={salesView ? rm(salesView.nov) : products ? rm(products.net) : "–"} sub={salesView ? `On pace for ${rm((salesView.nov / day) * 30)}` : undefined} />
                <Kpi label="Owed to us" value={agingView ? rm(agingView.total) : "–"} tone={agingView && agingView.over60 > 0 ? "warn" : "neutral"} sub={agingView ? `${rm(agingView.over60)} is over 60 days late` : "Load the aging"} />
                <Kpi label="Customers that bought this year" value={custView ? custView.active.toLocaleString() : "–"} sub={salesView ? `${salesView.active} of ${salesView.rl} accounts active in November` : undefined} />
              </KpiStrip>
              <Card title="Do the four reports agree?" right={<span className="text-sm text-slate-500">{checks.filter((c) => c.ok).length} of {checks.length} checks pass</span>}>
                {checks.length === 0 ? <p className="p-4 text-slate-500">Load more reports to compare them.</p> : (
                  <ul className="divide-y divide-slate-100">
                    {checks.map((c) => (
                      <li key={c.title} className="flex gap-3 px-4 py-3">
                        {c.ok ? <Check size={18} className="mt-0.5 shrink-0 text-emerald-600" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />}
                        <div><div className="font-medium text-slate-900">{c.title}</div><div className="text-[15px] text-slate-600">{c.detail}</div></div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )}

          {tab === "aging" && (agingView ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">Open invoices as at the aging report date. Age is the number of days past the due date; zero or less means not due yet.</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {agingView.buckets.map((b, i) => (
                  <div key={b.label} className={`rounded-xl border p-3 ${i === 0 ? "border-emerald-200 bg-emerald-50" : i < 3 ? "border-amber-200 bg-amber-50" : "border-rose-200 bg-rose-50"}`}>
                    <div className="text-sm font-medium text-slate-700">{b.label}</div>
                    <div className="font-display text-xl font-semibold text-slate-900">{rm(b.amount)}</div>
                    <div className="text-sm text-slate-600">{b.n} invoices · {pc((b.amount / agingView.total) * 100)}</div>
                  </div>
                ))}
              </div>
              <Card title="By salesman" right={<span className="text-sm text-slate-500">Agent number in the aging = salesman code</span>}>
                <div className="overflow-x-auto"><table className="w-full">
                  <thead className="border-b border-slate-200"><tr><Th first>Agent</Th><Th>Salesman</Th><Th right>Owed</Th><Th right>Overdue</Th><Th right>Over 60 days</Th><Th right>Invoices</Th><Th>Share</Th></tr></thead>
                  <tbody>{agingView.agents.map((a) => (
                    <tr key={a.agent} className="border-b border-slate-100">
                      <Td first className="font-medium">{a.agent}</Td><Td>{a.name || <span className="text-amber-700">Not in coverage report</span>}</Td><Td right>{rm(a.total)}</Td><Td right>{rm(a.overdue)}</Td><Td right className={a.over60 > 0 ? "text-rose-700" : ""}>{rm(a.over60)}</Td><Td right>{a.n}</Td><Td className="min-w-32"><Bar v={a.total} max={agingView.agents[0].total} /></Td>
                    </tr>))}</tbody>
                </table></div>
              </Card>
              <Card title="Biggest balances" right={<span className="text-sm text-slate-500">{agingView.customers} customers owe us</span>}>
                <div className="overflow-x-auto"><table className="w-full">
                  <thead className="border-b border-slate-200"><tr><Th first>#</Th><Th>Customer</Th><Th>Agent</Th><Th right>Owed</Th><Th right>Overdue</Th><Th right>Over 90 days</Th><Th right>Oldest (days late)</Th></tr></thead>
                  <tbody>{agingView.debtors.slice(0, 15).map((d, i) => (
                    <tr key={d.code} className="border-b border-slate-100"><Td first className="text-slate-400">{i + 1}</Td><Td className="font-medium text-slate-900">{d.name}</Td><Td>{d.agent}</Td><Td right>{rm(d.total)}</Td><Td right>{rm(d.overdue)}</Td><Td right className={d.over90 > 0 ? "text-rose-700" : ""}>{rm(d.over90)}</Td><Td right className={d.oldest > 90 ? "text-rose-700" : ""}>{d.oldest > 0 ? d.oldest : "not due"}</Td></tr>))}</tbody>
                </table></div>
              </Card>
              <Card title="Oldest unpaid invoices" right={<span className="text-sm text-slate-500">Check these for write-off or legal action</span>}>
                <div className="overflow-x-auto"><table className="w-full">
                  <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Customer</Th><Th>Invoice date</Th><Th right>Days late</Th><Th right>Outstanding</Th><Th>Note</Th></tr></thead>
                  <tbody>{agingView.oldest.map((o) => <tr key={o.doc} className="border-b border-slate-100"><Td first className="font-medium">{o.doc}</Td><Td className="!whitespace-normal">{o.customer}</Td><Td>{o.date}</Td><Td right className="text-rose-700">{o.age}</Td><Td right>{rm2(o.outstanding)}</Td><Td className="!whitespace-normal text-sm text-slate-500">{o.note}</Td></tr>)}</tbody>
                </table></div>
              </Card>
            </div>
          ) : need("aging"))}

          {tab === "sales" && (salesView ? (
            <div className="space-y-4">
              <KpiStrip>
                <Kpi label={`November so far (${day} of 30 days)`} value={rm(salesView.nov)} sub={`Last month in full: ${rm(salesView.oct)}`} />
                <Kpi label="November on current pace" value={rm((salesView.nov / day) * 30)} tone={salesView.octT && (salesView.nov / day) * 30 >= salesView.octT ? "good" : "warn"} sub={salesView.octT ? `${pc(((salesView.nov / day) * 30 / salesView.octT) * 100)} of October's target` : undefined} />
                <Kpi label="Year to date vs target" value={salesView.ytdT ? pc((salesView.ytd / salesView.ytdT) * 100) : "–"} sub={`${rm(salesView.ytd)} of ${rm(salesView.ytdT)}`} />
                <Kpi label="Coverage in November" value={salesView.rl ? pc((salesView.active / salesView.rl) * 100) : "–"} sub={`${salesView.active} of ${salesView.rl} accounts have bought`} />
              </KpiStrip>
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">The coverage report has no November sales target (it shows 0), so November is compared with October&apos;s target. Add the November target to the report to compare properly.</p>
              <Card title="Net sales by month" right={<span className="text-sm text-slate-500">Bars are net sales; the tick is the target</span>}>
                <div className="grid grid-cols-6 gap-3 p-4 sm:grid-cols-11">
                  {salesView.monthly.map((s, i) => {
                    const max = Math.max(...salesView.monthly, ...salesView.monthlyT.map((t) => t ?? 0));
                    const t = salesView.monthlyT[i];
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 text-center">
                        <div className="relative flex h-28 w-full items-end rounded-sm bg-slate-50">
                          <div className={`w-full ${i === 10 ? "bg-amber-400" : "bg-indigo-500"}`} style={{ height: `${(s / max) * 100}%` }} />
                          {t ? <div className="absolute left-0 right-0 border-t-2 border-slate-800" style={{ bottom: `${(t / max) * 100}%` }} /> : null}
                        </div>
                        <div className="text-xs font-medium text-slate-700">{MONTH[i]}</div><div className="text-xs text-slate-500">{(s / 1e6).toFixed(2)}m</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
              <Card title="By salesman">
                <div className="overflow-x-auto"><table className="w-full">
                  <thead className="border-b border-slate-200"><tr><Th first>Salesman</Th><Th right>Nov so far</Th><Th right>Oct</Th><Th right>Nov pace</Th><Th right>Pace vs Oct target</Th><Th right>Active / accounts</Th><Th right>Coverage</Th><Th right>Year vs target</Th></tr></thead>
                  <tbody>{salesView.rows.map((r) => (
                    <tr key={r.code} className="border-b border-slate-100">
                      <Td first><div className="font-medium text-slate-900">{r.name}</div><div className="text-xs text-slate-500">{r.code}</div></Td>
                      <Td right>{rm(r.nov)}</Td><Td right>{rm(r.oct)}</Td><Td right>{rm(r.projected)}</Td>
                      <Td right className={r.octT ? (r.projPct >= 100 ? "text-emerald-700" : r.projPct >= 85 ? "text-amber-700" : "font-medium text-rose-700") : ""}>{r.octT ? pc(r.projPct) : "–"}</Td>
                      <Td right>{r.active} / {r.rl}</Td><Td right className={r.erc < 50 ? "text-rose-700" : ""}>{r.rl ? pc((r.active / r.rl) * 100) : "–"}</Td>
                      <Td right className={r.ytdT && r.ytd / r.ytdT < 0.9 ? "text-rose-700" : ""}>{r.ytdT ? pc((r.ytd / r.ytdT) * 100) : "–"}</Td>
                    </tr>))}</tbody>
                </table></div>
              </Card>
            </div>
          ) : need("coverage"))}

          {tab === "products" && (productView ? (
            <div className="space-y-4">
              <KpiStrip>
                <Kpi label="Net sales" value={rm(productView.net)} sub={`${productView.days.length} selling days`} />
                <Kpi label="Discounts given" value={rm(productView.gross - productView.net)} sub={`${pc(((productView.gross - productView.net) / productView.gross) * 100)} of gross sales`} />
                <Kpi label="Invoices" value={productView.totalInv.toLocaleString()} sub={`Average ${rm(productView.net / productView.totalInv)} each`} />
                <Kpi label="Products and customers" value={`${productView.prod.length} / ${productView.cust.length}`} sub="Products sold / customers invoiced" />
              </KpiStrip>
              <Card title="Net sales by day">
                <div className="grid grid-cols-4 gap-3 p-4 sm:grid-cols-8 lg:grid-cols-12">
                  {productView.days.map((d) => { const max = Math.max(...productView.days.map((x) => x.net)); return (
                    <div key={d.date} className="flex flex-col items-center gap-1 text-center"><div className="flex h-24 w-full items-end rounded-sm bg-slate-50"><div className="w-full bg-indigo-500" style={{ height: `${(d.net / max) * 100}%` }} /></div><div className="text-xs font-medium text-slate-700">{d.date.slice(8)} Nov</div><div className="text-xs text-slate-500">{rm(d.net)}</div></div>); })}
                </div>
              </Card>
              <Card title="By sales rep"><div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Sales rep</Th><Th right>Net sales</Th><Th right>Discount</Th><Th right>Invoices</Th><Th right>Customers</Th><Th>Share</Th></tr></thead>
                <tbody>{productView.reps.map((r) => <tr key={r.code} className="border-b border-slate-100"><Td first><div className="font-medium text-slate-900">{r.name}</div><div className="text-xs text-slate-500">{r.code}</div></Td><Td right>{rm(r.net)}</Td><Td right>{pc(((r.gross - r.net) / r.gross) * 100)}</Td><Td right>{r.inv}</Td><Td right>{r.cust}</Td><Td className="min-w-32"><Bar v={r.net} max={productView.reps[0].net} /></Td></tr>)}</tbody>
              </table></div></Card>
              <Card title="Top 15 products"><div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Product</Th><Th right>Net sales</Th><Th right>Cartons</Th><Th right>Units</Th><Th right>Discount</Th><Th right>Invoices</Th><Th>Share</Th></tr></thead>
                <tbody>{productView.prod.slice(0, 15).map((p) => <tr key={p.code} className="border-b border-slate-100"><Td first className="!whitespace-normal"><div className="font-medium text-slate-900">{p.desc}</div><div className="text-xs text-slate-500">{p.code}</div></Td><Td right>{rm(p.net)}</Td><Td right>{p.cs.toLocaleString()}</Td><Td right>{p.ea.toLocaleString()}</Td><Td right>{p.gross ? pc(((p.gross - p.net) / p.gross) * 100) : "–"}</Td><Td right>{p.inv}</Td><Td className="min-w-28"><Bar v={p.net} max={productView.prod[0].net} /></Td></tr>)}</tbody>
              </table></div></Card>
              <Card title="Top 10 customers this month"><div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th right>Net sales</Th><Th right>Invoices</Th></tr></thead>
                <tbody>{productView.cust.slice(0, 10).map((c) => <tr key={c.code} className="border-b border-slate-100"><Td first className="!whitespace-normal font-medium text-slate-900">{c.name}</Td><Td right>{rm(c.net)}</Td><Td right>{c.inv}</Td></tr>)}</tbody>
              </table></div></Card>
            </div>
          ) : need("products"))}

          {tab === "customers" && (custView ? (
            <div className="space-y-4">
              <KpiStrip>
                <Kpi label="Customers that bought" value={custView.active.toLocaleString()} sub={`of ${custView.all.toLocaleString()} on the list`} />
                <Kpi label="Net sales this year" value={rm(custView.total)} />
                <Kpi label="Top 10 customers" value={pc((custView.top10 / custView.total) * 100)} sub="of all sales: how much rests on a few names" tone={custView.top10 / custView.total > 0.4 ? "warn" : "neutral"} />
                <Kpi label="Stopped buying" value={String(custView.stopped.length)} sub="no sales Sep, Oct or Nov (top 15 listed)" tone={custView.stopped.length ? "warn" : "good"} />
              </KpiStrip>
              <Card title="Top 15 customers this year"><div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th right>This year</Th><Th right>Nov so far</Th><Th right>Monthly avg vs last year</Th><Th right>Owes us</Th><Th right>Over 60 days</Th></tr></thead>
                <tbody>{custView.top.slice(0, 15).map((c) => { const o = custView.owed.get(c.code); const chg = c.pyAms ? ((c.ytdAms - c.pyAms) / c.pyAms) * 100 : null; return (
                  <tr key={c.code} className="border-b border-slate-100"><Td first className="!whitespace-normal"><div className="font-medium text-slate-900">{c.name}</div><div className="text-xs text-slate-500">{c.code}</div></Td><Td right>{rm(c.ytd)}</Td><Td right>{rm(c.months[10])}</Td><Td right className={chg !== null && chg < -20 ? "text-rose-700" : chg !== null && chg > 0 ? "text-emerald-700" : ""}>{chg === null ? "new" : `${chg > 0 ? "+" : ""}${Math.round(chg)}%`}</Td><Td right>{o ? rm(o.total) : "–"}</Td><Td right className={o && o.over60 > 0 ? "text-rose-700" : ""}>{o ? rm(o.over60) : "–"}</Td></tr>); })}</tbody>
              </table></div></Card>
              <Card title="Buying less than last year" right={<span className="text-sm text-slate-500">Monthly average at least 30% down</span>}><div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th right>Avg a month last year</Th><Th right>Avg a month now</Th><Th right>Lost a month</Th></tr></thead>
                <tbody>{custView.declining.map((c) => <tr key={c.code} className="border-b border-slate-100"><Td first className="!whitespace-normal font-medium text-slate-900">{c.name}</Td><Td right>{rm(c.pyAms)}</Td><Td right>{rm(c.ytdAms)}</Td><Td right className="text-rose-700">{rm(c.pyAms - c.ytdAms)}</Td></tr>)}</tbody>
              </table></div></Card>
              <Card title="Stopped buying" right={<span className="text-sm text-slate-500">Bought earlier this year, nothing in Sep, Oct or Nov</span>}><div className="overflow-x-auto"><table className="w-full">
                <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th right>Bought Jan to Aug</Th><Th right>Still owes us</Th></tr></thead>
                <tbody>{custView.stopped.map((c) => { const o = custView.owed.get(c.code); return <tr key={c.code} className="border-b border-slate-100"><Td first className="!whitespace-normal font-medium text-slate-900">{c.name}</Td><Td right>{rm(sum(c.months.slice(0, 8), (x) => x))}</Td><Td right>{o ? rm(o.total) : "–"}</Td></tr>; })}</tbody>
              </table></div></Card>
            </div>
          ) : need("customers"))}
        </>
      )}
      {loaded.length === 0 && <p className="mt-4 text-sm text-slate-500">Load the files above to see the numbers.</p>}
    </>
  );
}
