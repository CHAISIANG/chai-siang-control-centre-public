"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Achievement, AgingProfile, ChannelMix, CumulativeSales, MonthlyTrend, OverdueVsOwed } from "@/components/charts";
import { CheckCircle2, Circle } from "lucide-react";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { Badge, Card, Kpi, PageHeader, RoadBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { buildDaily, drivers, fmt, getPendingInvoices, MONTHS, NOV, pct, rm, rmK, sumStats, type DailyRow } from "@/lib/mock";

const PANELS = ["Sales vs target", "Coverage (RL / Active / ERC)", "Collection", "Deliveries", "Claims"];

export default function Dashboard() {
  const { filterSalesman, can, verified, toggleVerified } = useRole();
  const { salesmen, customers, claims, mtdDay, asAt } = useData();
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  const pendingInvoices = useMemo(() => getPendingInvoices(customers), [customers]);
  const [mi, setMi] = useState(NOV);
  const [pickSm, setPickSm] = useState("all");
  const sel = filterSalesman ?? (pickSm === "all" ? null : pickSm);
  useEffect(() => {
    let active = true;
    void supabase.rpc("sales_daily", { p_rep: sel }).then(({ data }) => { if (active) setDailyRows((data ?? []) as DailyRow[]); });
    return () => { active = false; };
  }, [sel]);
  const list = sel ? salesmen.filter((s) => s.code === sel) : salesmen;
  const first = list[0];
  const st = sumStats(list, mi);
  const isNov = mi === NOV;
  const custs = sel ? customers.filter((c) => c.salesman === sel) : customers;
  const late90 = custs.filter((c) => c.aging[4] > 0).sort((a, b) => b.aging[4] - a.aging[4]);
  const overdue90 = custs.reduce((s, c) => s + c.aging[4], 0);
  const owed = custs.reduce((s, c) => s + c.outstanding, 0);
  // Everything past its due date: the aging buckets after "not due".
  const overdueAll = custs.reduce((s, c) => s + c.aging[1] + c.aging[2] + c.aging[3] + c.aging[4], 0);
  const overduePct = owed ? Math.round((overdueAll / owed) * 100) : 0;
  const overdueBySalesman = list.map((s) => { const mine = custs.filter((c) => c.salesman === s.code); return { name: s.name, owed: mine.reduce((a, c) => a + c.outstanding, 0), overdue: mine.reduce((a, c) => a + c.aging[1] + c.aging[2] + c.aging[3] + c.aging[4], 0) }; });
  const del = drivers.reduce((a, d) => ({ t: a.t + d.total, d: a.d + d.delivered, f: a.f + d.failed }), { t: 0, d: 0, f: 0 });
  const myClaims = sel ? claims.filter((c) => c.salesman === (first?.name ?? "")) : claims;
  const pendingClaims = myClaims.filter((c) => c.status === "Pending supervisor");
  const daily = buildDaily(dailyRows, sumStats(list, NOV).target, mtdDay);
  const salesPct = pct(st.sales, st.target);
  const showLogistics = !filterSalesman && can("page_logistics");
  // Jan–Oct only: Nov is a part-month and would look like a false collapse.
  const trend = MONTHS.slice(0, NOV).map((m, i) => { const t = sumStats(list, i); return { month: m, sales: t.sales, target: t.target }; });
  const bySalesman = list.map((s) => ({ name: s.name, sales: s.stats[mi].sales, target: s.stats[mi].target }));
  const channelMix = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of custs) m.set(c.channel || "No channel", (m.get(c.channel || "No channel") ?? 0) + c.ytdSales);
    return [...m.entries()].map(([channel, sales]) => ({ channel, sales }));
  }, [custs]);
  const agingTotals = custs.reduce((a, c) => a.map((v, i) => v + (c.aging[i] ?? 0)), [0, 0, 0, 0, 0]);
  const waitingColgate = myClaims.filter((c) => c.status === "Pending Colgate");
  const sel2 = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700";
  const doneCount = PANELS.filter((p) => verified[p]).length;
  const behind = list.filter((s) => pct(s.stats[mi].sales, s.stats[mi].target) < 90);
  const lowCover = list.filter((s) => s.stats[mi].erc < 60);
  const toDeliver = del.t - del.d - del.f;
  const attention: { tone: "red" | "amber" | "blue"; tag: string; text: string; href: string }[] = [
    ...(behind.length ? [{ tone: "red" as const, tag: "Sales", text: `${behind.length} of ${list.length} salesmen are below 90% of target: ${behind.map((s) => s.name).join(", ")}.`, href: "/sales" }] : []),
    ...(lowCover.length ? [{ tone: "amber" as const, tag: "Coverage", text: `${lowCover.length} salesmen reached fewer than 60% of their accounts: ${lowCover.map((s) => `${s.name} (${s.stats[mi].erc}%)`).join(", ")}.`, href: "/sales" }] : []),
    ...(late90.length ? [{ tone: "amber" as const, tag: "Collection", text: `${late90.length} customers have invoices more than 90 days late, ${rmK(overdue90)} in all. ${rmK(owed)} is owed to us.`, href: "/customers" }] : []),
    ...(pendingClaims.length ? [{ tone: "blue" as const, tag: "Claims", text: `${pendingClaims.length} claims (${rm(pendingClaims.reduce((s, c) => s + c.amount, 0))}) are waiting for the supervisor.`, href: "/claims" }] : []),
    ...(waitingColgate.length ? [{ tone: "blue" as const, tag: "Colgate", text: `${waitingColgate.length} claims (${rm(waitingColgate.reduce((s, c) => s + c.amount, 0))}) are waiting for Colgate's final approval.`, href: "/claims" }] : []),
    ...(showLogistics && (toDeliver > 0 || del.f > 0) ? [{ tone: "amber" as const, tag: "Delivery", text: `${toDeliver} invoices still to deliver today and ${del.f} failed deliveries to reschedule.`, href: "/logistics" }] : []),
  ];
  const monthLabel = isNov ? `Nov 2026 MTD (1–${mtdDay} Nov)` : `${MONTHS[mi]} 2026`;

  return (
    <>
      <PageHeader
        title={filterSalesman ? `My Dashboard · ${(first?.name ?? "")}` : "Company Dashboard"}
        sub={isNov ? `${monthLabel}, from your coverage and sales reports. November is compared with its target to date (the month's target spread over the days so far).` : `${monthLabel}, from your coverage and net sales report.`}
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

      <section aria-label="What needs attention" className="mb-5 rounded-xl border border-slate-200 border-l-4 border-l-signal bg-white px-5 py-4 shadow-sm">
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

      <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-5">
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
          <Kpi label={`Total owed to us${asAt ? ` (aging ${asAt.slice(8)}/${asAt.slice(5, 7)})` : ""}`} value={rmK(owed)} sub={`${rmK(owed - overdueAll)} not yet due`} />
          <Kpi label="Total overdue" value={rmK(overdueAll)} sub={`${overduePct}% of the ${rmK(owed)} owed · ${rmK(overdue90)} is over 90 days`} tone={overduePct >= 60 ? "bad" : overduePct >= 40 ? "warn" : "good"} pct={overduePct} />
          {showLogistics ? (
            <Kpi label="Delivered today (sample)" value={`${del.d} of ${del.t}`} sub={`${del.t - del.d - del.f} pending, ${del.f} failed`} tone={pct(del.d, del.t) >= 80 ? "good" : "warn"} pct={pct(del.d, del.t)} />
          ) : (
            <Kpi label="Claims awaiting approval" value={`${pendingClaims.length}`} sub={rm(pendingClaims.reduce((s, c) => s + c.amount, 0))} tone={pendingClaims.length ? "warn" : "good"} />
          )}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {isNov
          ? <Card title="November so far: sales against target pace"><CumulativeSales data={daily} /></Card>
          : <Card title={`Achievement by salesman · ${MONTHS[mi]}`}><Achievement data={bySalesman} /></Card>}
        <Card title="Monthly net sales against target (Jan–Oct)"><MonthlyTrend data={trend} /></Card>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {isNov && <Card title="Achievement by salesman · November to date"><Achievement data={bySalesman} /></Card>}
        <Card title="Sales mix by channel · this year" right={<span className="text-xs text-slate-500">Share of net sales</span>}><ChannelMix data={channelMix} /></Card>
        {!isNov && <Card title="What customers owe, by how late"><AgingProfile buckets={agingTotals} /></Card>}
      </div>
      <Card title="Overdue versus total owed, by salesman" className="mt-5"><OverdueVsOwed data={overdueBySalesman} /></Card>
      {isNov && <Card title={`What customers owe, by how late${asAt ? ` · aging ${asAt.slice(8)}/${asAt.slice(5, 7)}` : ""}`} className="mt-5"><AgingProfile buckets={agingTotals} /></Card>}

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
              {late90.slice(0, 2).map((c) => (
                <li key={c.code} className="flex gap-2"><Badge tone="amber">Collect</Badge><span><b>{c.name}</b> has {rm(c.aging[4])} more than 90 days late.</span></li>
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
