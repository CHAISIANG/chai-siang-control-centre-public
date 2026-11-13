"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCircle2, Circle } from "lucide-react";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { Badge, Card, Kpi, PageHeader, RoadBar } from "@/components/ui";
import { buildDailySales, DAYS_ELAPSED, drivers, fmt, getPendingInvoices, MONTHS, NOV, pct, rm, rmK, sumStats } from "@/lib/mock";

const PANELS = ["Sales vs target", "Coverage (RL / Active / ERC)", "Collection", "Deliveries", "Claims"];

export default function Dashboard() {
  const { filterSalesman, can, verified, toggleVerified } = useRole();
  const { salesmen, customers, claims } = useData();
  const dailySales = useMemo(() => buildDailySales(sumStats(salesmen, NOV)), [salesmen]);
  const pendingInvoices = useMemo(() => getPendingInvoices(customers), [customers]);
  const [mi, setMi] = useState(NOV);
  const [pickSm, setPickSm] = useState("all");
  const sel = filterSalesman ?? (pickSm === "all" ? null : pickSm);
  const list = sel ? salesmen.filter((s) => s.code === sel) : salesmen;
  const first = list[0];
  const st = sumStats(list, mi);
  const isNov = mi === NOV;
  const custs = sel ? customers.filter((c) => c.salesman === sel) : customers;
  const overLimit = custs.filter((c) => c.outstanding > c.creditLimit);
  const overdue90 = custs.reduce((s, c) => s + c.aging[4], 0);
  const del = drivers.reduce((a, d) => ({ t: a.t + d.total, d: a.d + d.delivered, f: a.f + d.failed }), { t: 0, d: 0, f: 0 });
  const myClaims = sel ? claims.filter((c) => c.salesman === (first?.name ?? "")) : claims;
  const pendingClaims = myClaims.filter((c) => c.status === "Pending supervisor");
  // Daily chart is stored for the whole company; scale it to the selected salesman's share.
  const share = sel ? st.sales / Math.max(1, sumStats(salesmen, NOV).sales) : 1;
  const daily = dailySales.map((d) => ({ ...d, sales: Math.round(d.sales * share), target: Math.round(d.target * (sel ? st.target / Math.max(1, sumStats(salesmen, NOV).target) : 1)) }));
  const salesPct = pct(st.sales, st.target);
  const showLogistics = !filterSalesman && can("page_logistics");
  // Jan–Oct only: Nov is a part-month and would look like a false collapse.
  const trend = MONTHS.slice(0, NOV).map((m, i) => { const t = sumStats(list, i); return { month: m, sales: t.sales, target: t.target }; });
  const bySalesman = list.map((s) => ({ name: s.name.split(" ")[0], sales: s.stats[mi].sales, target: s.stats[mi].target }));
  const sel2 = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700";
  const doneCount = PANELS.filter((p) => verified[p]).length;
  const behind = list.filter((s) => pct(s.stats[mi].sales, s.stats[mi].target) < 90);
  const lowCover = list.filter((s) => s.stats[mi].erc < 60);
  const toDeliver = del.t - del.d - del.f;
  const attention: { tone: "red" | "amber" | "blue"; tag: string; text: string; href: string }[] = [
    ...(behind.length ? [{ tone: "red" as const, tag: "Sales", text: `${behind.length} of ${list.length} salesmen are below 90% of target: ${behind.map((s) => s.name).join(", ")}.`, href: "/sales" }] : []),
    ...(lowCover.length ? [{ tone: "amber" as const, tag: "Coverage", text: `${lowCover.length} salesmen reached fewer than 60% of their accounts: ${lowCover.map((s) => `${s.name} (${s.stats[mi].erc}%)`).join(", ")}.`, href: "/sales" }] : []),
    ...(overLimit.length ? [{ tone: "amber" as const, tag: "Credit", text: `${overLimit.length} customers are over their credit limit. ${rmK(overdue90)} is overdue by 90+ days.`, href: "/customers" }] : []),
    ...(pendingClaims.length ? [{ tone: "blue" as const, tag: "Claims", text: `${pendingClaims.length} claims (${rm(pendingClaims.reduce((s, c) => s + c.amount, 0))}) are waiting for the supervisor.`, href: "/claims" }] : []),
    ...(showLogistics && (toDeliver > 0 || del.f > 0) ? [{ tone: "amber" as const, tag: "Delivery", text: `${toDeliver} invoices still to deliver today and ${del.f} failed deliveries to reschedule.`, href: "/logistics" }] : []),
  ];
  const monthLabel = isNov ? `Nov 2026 MTD (1–${DAYS_ELAPSED} Nov)` : `${MONTHS[mi]} 2026`;

  return (
    <>
      <PageHeader
        title={filterSalesman ? `My Dashboard · ${(first?.name ?? "")}` : "Company Dashboard"}
        sub={isNov ? `${monthLabel}. November is sample data; January to October come from your DA1 report.` : `${monthLabel}, from your DA1 report.`}
        right={
          <div className="flex flex-wrap gap-2">
            <select className={sel2} value={mi} onChange={(e) => setMi(Number(e.target.value))} aria-label="Month">
              {MONTHS.map((m, i) => <option key={m} value={i}>{i === NOV ? "Nov (MTD)" : `${m} 2026`}</option>)}
            </select>
            {!filterSalesman && (
              <select className={sel2} value={pickSm} onChange={(e) => setPickSm(e.target.value)} aria-label="Salesman">
                <option value="all">All salesmen</option>
                {salesmen.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            )}
          </div>
        }
      />

      <section aria-label="What needs attention" className="mb-5 rounded-xl border border-slate-200 border-l-4 border-l-signal bg-white px-4 py-3">
        <h2 className="font-display text-xl font-semibold text-slate-900">{attention.length ? "What needs attention today" : "Nothing needs attention right now"}</h2>
        {attention.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-100">
            {attention.map((a) => (
              <li key={a.tag} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="w-20 shrink-0"><Badge tone={a.tone}>{a.tag}</Badge></span>
                <span className="min-w-0 flex-1 basis-64 text-base text-slate-700">{a.text}</span>
                <Link href={a.href} className="text-base font-medium text-indigo-600 hover:underline">Open</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white lg:grid-cols-5">
        <div className="border-b border-slate-200 p-5 lg:col-span-2 lg:border-b-0 lg:border-r">
          <div className="text-sm text-slate-500">{isNov ? "Net sales so far this month" : `Net sales in ${MONTHS[mi]}`}</div>
          <div className="font-display text-[64px] font-semibold leading-none text-slate-900 sm:text-[76px]">{rmK(st.sales)}</div>
          <div className={`mt-2 text-[15px] font-medium ${salesPct >= 100 ? "text-emerald-700" : salesPct >= 85 ? "text-amber-700" : "text-rose-700"}`}>
            {salesPct}% of {isNov ? "target to date" : "target"} ({rmK(st.target)})
          </div>
          <RoadBar pct={salesPct} className="mt-3" />
        </div>
        <div className="grid grid-cols-2 lg:col-span-3 [&>*]:border-slate-200 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(even)]:border-l">
          <Kpi label="Accounts that bought (ERC)" value={`${st.erc}%`} sub={`${fmt(st.active)} of ${fmt(st.rl)} registered accounts`} tone={st.erc >= 70 ? "good" : st.erc >= 50 ? "warn" : "bad"} pct={st.erc} />
          <Kpi label="Collected (sample)" value={rmK(st.collected)} sub={`${pct(st.collected, st.sales)}% of sales`} tone={pct(st.collected, st.sales) >= 80 ? "good" : "warn"} pct={pct(st.collected, st.sales)} />
          <Kpi label="Over credit limit (sample)" value={`${overLimit.length} customers`} sub={`${rmK(overdue90)} overdue 90+ days`} tone={overLimit.length > 10 ? "bad" : "warn"} />
          {showLogistics ? (
            <Kpi label="Delivered today (sample)" value={`${del.d} of ${del.t}`} sub={`${del.t - del.d - del.f} pending, ${del.f} failed`} tone={pct(del.d, del.t) >= 80 ? "good" : "warn"} pct={pct(del.d, del.t)} />
          ) : (
            <Kpi label="Claims awaiting approval" value={`${pendingClaims.length}`} sub={rm(pendingClaims.reduce((s, c) => s + c.amount, 0))} tone={pendingClaims.length ? "warn" : "good"} />
          )}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {isNov ? (
          <Card title="Daily sales vs daily target (Nov, sample)">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8dedf" />
                  <XAxis dataKey="day" tick={{ fontSize: 13 }} />
                  <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
                  <Tooltip formatter={(v) => rm(Number(v))} />
                  <Legend />
                  <Bar dataKey="sales" name="Sales" fill="#1f5c8a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="#bfc8cb" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        ) : (
          <Card title={`Sales by salesman · ${MONTHS[mi]}`}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySalesman}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#d8dedf" />
                  <XAxis dataKey="name" tick={{ fontSize: 13 }} />
                  <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `${Math.round(v / 1000)}K`} />
                  <Tooltip formatter={(v) => rm(Number(v))} />
                  <Legend />
                  <Bar dataKey="sales" name="Net sales" fill="#1f5c8a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="target" name="Target" fill="#bfc8cb" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
        <Card title="Monthly net sales vs target (Jan–Oct real)">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#d8dedf" />
                <XAxis dataKey="month" tick={{ fontSize: 13 }} />
                <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} />
                <Tooltip formatter={(v) => rm(Number(v))} />
                <Legend />
                <Line type="monotone" dataKey="sales" name="Net sales" stroke="#1f5c8a" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="target" name="Target" stroke="#66737b" strokeDasharray="5 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title={`Salesman performance · ${monthLabel}`} className="lg:col-span-2" right={<Link href="/sales" className="text-xs text-indigo-600 hover:underline">Sales & KPI →</Link>}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[13px] font-medium text-slate-500">
                  <th className="px-2 py-2">Salesman</th><th className="px-2 py-2 text-right">Net sales</th><th className="px-2 py-2">vs target</th><th className="px-2 py-2 text-right">RL</th><th className="px-2 py-2 text-right">Active</th><th className="px-2 py-2 text-right">ERC</th>
                </tr>
              </thead>
              <tbody>
                {[...list].sort((a, b) => pct(b.stats[mi].sales, b.stats[mi].target) - pct(a.stats[mi].sales, a.stats[mi].target)).map((s) => {
                  const x = s.stats[mi];
                  const p = pct(x.sales, x.target);
                  return (
                    <tr key={s.code} className="border-b border-slate-100 last:border-0">
                      <td className="px-2 py-2 text-sm font-medium text-slate-800">{s.name}<div className="text-xs font-normal text-slate-400">{s.code} · {s.area}</div></td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums">{rm(x.sales)}</td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${p >= 100 ? "bg-emerald-500" : p >= 85 ? "bg-amber-500" : "bg-rose-500"}`} style={{ width: `${Math.min(100, p)}%` }} /></div>
                          <span className="text-xs tabular-nums text-slate-600">{p}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums">{x.rl}</td>
                      <td className="px-2 py-2 text-right text-sm tabular-nums">{x.active}</td>
                      <td className="px-2 py-2 text-right"><Badge tone={x.erc >= 70 ? "green" : x.erc >= 50 ? "amber" : "red"}>{x.erc}%</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-4">
          {!filterSalesman && (
            <Card title="Daily verification" right={<Badge tone={doneCount === PANELS.length ? "green" : "amber"}>{doneCount}/{PANELS.length} verified</Badge>}>
              <ul className="space-y-2 text-sm">
                {PANELS.map((p) => (
                  <li key={p}>
                    {can("verify_daily") ? (
                      <button onClick={() => toggleVerified(p)} className="flex w-full items-center gap-2 text-left hover:text-indigo-700">
                        {verified[p] ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-slate-400" />}{p}
                      </button>
                    ) : (
                      <span className="flex items-center gap-2 text-slate-600">{verified[p] ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Circle size={16} className="text-slate-300" />}{p}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-400">{can("verify_daily") ? "Tick each panel after checking it against the source report." : "Only people with the verification permission can tick these."}</p>
            </Card>
          )}
          <Card title="Items to follow up">
            <ul className="space-y-3 text-base">
              {overLimit.slice(0, 2).map((c) => (
                <li key={c.code} className="flex gap-2"><Badge tone="amber">Credit</Badge><span><b>{c.name}</b> over limit by {rm(c.outstanding - c.creditLimit)}.</span></li>
              ))}
              {pendingClaims.slice(0, 2).map((c) => (
                <li key={c.id} className="flex gap-2"><Badge tone="blue">Claim</Badge><span>{c.id} ({rm(c.amount)}) waiting supervisor since {c.submitted}.</span></li>
              ))}
              {showLogistics && pendingInvoices.filter((p) => p.age !== "Today").slice(0, 2).map((p) => (
                <li key={p.inv} className="flex gap-2"><Badge tone="amber">Delivery</Badge><span>{p.inv} · {p.customer}: {p.status}.</span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
