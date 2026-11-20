"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Achievement, AgingProfile, ChannelMix, CumulativeSales, MonthlyTrend, OverdueVsOwed } from "@/components/charts";
import { CheckCircle2, Circle } from "lucide-react";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { Badge, Card, Kpi, PageHeader, RoadBar } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { buildDaily, fmt, MONTHS, NOV, pct, rm, rmK, sumStats, type DailyRow } from "@/lib/mock";
import { useDelivery } from "@/lib/delivery/store";

const PANELS = ["Sales vs target", "Coverage (RL / Active / ERC)", "Collection", "Deliveries", "Claims"];

export default function Dashboard() {
  const { filterSalesman, can, verified, toggleVerified } = useRole();
  const { salesmen, customers, claims, mtdDay, asAt } = useData();
  const [dailyRows, setDailyRows] = useState<DailyRow[]>([]);
  // Deliveries come from the delivery tracking (only for people who may see Logistics).
  const { jobs } = useDelivery(false, !filterSalesman && can("page_logistics"));
  const [mi, setMi] = useState(NOV);
  const [pickSm, setPickSm] = useState("all");
  const sel = filterSalesman ?? (pickSm === "all" ? null : pickSm);
  useEffect(() => {
    let active = true;
    void supabase.rpc("sales_daily", { p_rep: sel }).then(({ data }) => { if (active) setDailyRows((data ?? []) as DailyRow[]); });
    return () => { active = false; };
  }, [sel]);
  const list = sel ? salesmen.filter((s) => s.code === sel) : salesmen;
  const dupNames = new Set(salesmen.map((s) => s.name).filter((n, i, a) => a.indexOf(n) !== i));
  const label = (s: { name: string; code: string }) => (dupNames.has(s.name) ? `${s.name} (${s.code.slice(-5)})` : s.name);
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
  const lateOf = (c: { aging: number[] }) => c.aging[1] + c.aging[2] + c.aging[3] + c.aging[4];
  const overdueBySalesman = (() => {
    const codes = new Set(list.map((s) => s.code));
    const rows = list.map((s) => { const mine = custs.filter((c) => c.salesman === s.code); return { name: label(s), owed: mine.reduce((a, c) => a + c.outstanding, 0), overdue: mine.reduce((a, c) => a + lateOf(c), 0) }; });
    // Customers whose salesman is not on the list still count, so this chart adds up to the totals above.
    const rest = custs.filter((c) => !codes.has(c.salesman));
    if (!sel && rest.length) rows.push({ name: "Other customers (no current salesman)", owed: rest.reduce((a, c) => a + c.outstanding, 0), overdue: rest.reduce((a, c) => a + lateOf(c), 0) });
    return rows;
  })();
  const jn = (st: string) => jobs.filter((j) => j.status === st).length;
  const del = { toPick: jn("Invoiced"), toLoad: jn("Picked"), out: jn("Loaded"), pod: jn("Delivered"), f: jn("Failed") };
  const myClaims = sel ? claims.filter((c) => c.salesman === (first?.name ?? "")) : claims;
  const pendingClaims = myClaims.filter((c) => c.status === "Pending supervisor");
  const daily = buildDaily(dailyRows, sumStats(list, NOV).target, mtdDay);
  const salesPct = pct(st.sales, st.target);
  const showLogistics = !filterSalesman && can("page_logistics");
  // Jan–Oct only: Nov is a part-month and would look like a false collapse.
  const trend = MONTHS.slice(0, NOV).map((m, i) => { const t = sumStats(list, i); return { month: m, sales: t.sales, target: t.target }; });
  const bySalesman = list.map((s) => ({ name: label(s), sales: s.stats[mi].sales, target: s.stats[mi].target }));
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
  const toDeliver = del.toPick + del.toLoad + del.out;
  const few = (names: string[], n = 3) => (names.length <= n ? names.join(", ") : `${names.slice(0, n).join(", ")} and ${names.length - n} more`);
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const attention: { tone: "red" | "amber" | "blue"; tag: string; head: string; detail?: string; href: string }[] = [
    ...(behind.length ? [{ tone: "red" as const, tag: "Sales", head: `${behind.length} of ${list.length} salesmen are below 90% of target.`, detail: few(behind.map(label)), href: "/sales" }] : []),
    ...(lowCover.length ? [{ tone: "amber" as const, tag: "Coverage", head: `${plural(lowCover.length, "salesman", "salesmen")} reached fewer than 60% of their accounts.`, detail: few(lowCover.map((s) => `${label(s)} (${s.stats[mi].erc}%)`)), href: "/sales" }] : []),
    ...(late90.length ? [{ tone: "amber" as const, tag: "Collection", head: `${plural(late90.length, "customer has", "customers have")} invoices over 90 days late.`, detail: `${rmK(overdue90)} in all.`, href: "/followup" }] : []),
    ...(pendingClaims.length ? [{ tone: "blue" as const, tag: "Claims", head: `${plural(pendingClaims.length, "claim is", "claims are")} waiting for the supervisor.`, detail: `${rm(pendingClaims.reduce((s, c) => s + c.amount, 0))} in all.`, href: "/claims" }] : []),
    ...(waitingColgate.length ? [{ tone: "blue" as const, tag: "Colgate", head: `${plural(waitingColgate.length, "claim is", "claims are")} waiting for Colgate's final approval.`, detail: `${rm(waitingColgate.reduce((s, c) => s + c.amount, 0))} in all.`, href: "/claims" }] : []),
    ...(showLogistics && (toDeliver > 0 || del.f > 0 || del.pod > 0) ? [{ tone: "amber" as const, tag: "Delivery", head: `${plural(toDeliver, "invoice", "invoices")} still to deliver.`, detail: `${plural(del.f, "failed delivery", "failed deliveries")} to reschedule, ${plural(del.pod, "POD", "PODs")} missing.`, href: "/logistics" }] : []),
  ];
  const monthLabel = isNov ? `Nov 2026 MTD (1–${mtdDay} Nov)` : `${MONTHS[mi]} 2026`;

  return (
    <>
      <PageHeader
        title={filterSalesman ? `My dashboard · ${(first?.name ?? "")}` : "Company dashboard"}
        sub={isNov ? `${monthLabel}. Targets are pro-rated to the days so far.` : `${monthLabel}, from your coverage and net sales report.`}
        right={
          <div className="flex flex-wrap gap-2">
            <select className={sel2} value={mi} onChange={(e) => setMi(Number(e.target.value))} aria-label="Month">
              {MONTHS.map((m, i) => <option key={m} value={i}>{i === NOV ? "Nov (MTD)" : `${m} 2026`}</option>)}
            </select>
            {!filterSalesman && (
              <select className={sel2} value={pickSm} onChange={(e) => setPickSm(e.target.value)} aria-label="Salesman">
                <option value="all">All salesmen</option>
                {salesmen.map((s) => <option key={s.code} value={s.code}>{label(s)}</option>)}
              </select>
            )}
          </div>
        }
      />

      <section aria-label="What needs attention" className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-[15px] font-semibold text-slate-900">{attention.length ? "What needs attention today" : "Nothing needs attention right now"}</h2>
          {attention.length > 0 && <span className="text-xs text-slate-500">{attention.length} item{attention.length === 1 ? "" : "s"}</span>}
        </div>
        {attention.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {attention.map((a) => (
              <li key={a.tag} className="grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[96px_1fr_auto] sm:px-5">
                <span className="pt-0.5"><Badge tone={a.tone}>{a.tag}</Badge></span>
                <span className="col-span-2 row-start-2 min-w-0 text-[15px] leading-snug text-slate-700 sm:col-span-1 sm:col-start-2 sm:row-start-1"><b className="font-semibold text-slate-900">{a.head}</b>{a.detail ? <span className="text-slate-500"> {a.detail}</span> : null}</span>
                <Link href={a.href} className="col-start-2 row-start-1 whitespace-nowrap pt-0.5 text-sm font-medium text-indigo-700 hover:underline sm:col-start-3">View</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-5">
        <div className="flex flex-col justify-between border-b border-slate-200 p-5 sm:p-6 lg:col-span-2 lg:border-b-0 lg:border-r">
          <div>
            <div className="text-sm font-medium text-slate-500">{isNov ? "Net sales so far this month" : `Net sales in ${MONTHS[mi]}`}</div>
            <div className="mt-1 font-display text-[60px] font-semibold leading-none tracking-tight text-slate-900 sm:text-[72px]">{rmK(st.sales)}</div>
          </div>
          <div className="mt-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className={`font-semibold ${salesPct >= 100 ? "text-emerald-700" : salesPct >= 85 ? "text-amber-700" : "text-rose-700"}`}>{salesPct}% of {isNov ? "target to date" : "target"}</span>
              <span className="tabular-nums text-slate-500">Target {rmK(st.target)}</span>
            </div>
            <RoadBar pct={salesPct} className="mt-2" />
          </div>
        </div>
        <div className="grid grid-cols-2 lg:col-span-3 [&>*]:border-slate-200 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(even)]:border-l">
          <Kpi label="Accounts that bought (ERC)" value={`${st.erc}%`} sub={`${fmt(st.active)} of ${fmt(st.rl)} registered accounts`} tone={st.erc >= 70 ? "good" : st.erc >= 50 ? "warn" : "bad"} pct={st.erc} />
          <Kpi label={`Total owed to us${asAt ? ` · aging ${asAt.slice(8)}/${asAt.slice(5, 7)}` : ""}`} value={rmK(owed)} sub={`${rmK(owed - overdueAll)} not yet due`} />
          <Kpi label="Total overdue" value={rmK(overdueAll)} sub={`${overduePct}% of total owed · ${rmK(overdue90)} over 90 days`} tone={overduePct >= 60 ? "bad" : overduePct >= 40 ? "warn" : "good"} pct={overduePct} />
          {showLogistics ? (
            <Kpi label="Out for delivery" value={`${del.out}`} sub={`${del.toPick} to pick, ${del.toLoad} to load, ${del.pod} POD missing, ${del.f} failed`} tone={del.pod + del.f > 0 ? "warn" : "good"} />
          ) : (
            <Kpi label="Claims awaiting approval" value={`${pendingClaims.length}`} sub={rm(pendingClaims.reduce((s, c) => s + c.amount, 0))} tone={pendingClaims.length ? "warn" : "good"} />
          )}
        </div>
      </section>

      <Section title="Sales" sub={isNov ? "How the month is going against target, and where sales come from." : `How ${MONTHS[mi]} went against target.`} />
      <div className="grid gap-5 lg:grid-cols-5">
        {isNov
          ? <Card title="Sales against target pace" className="lg:col-span-3"><CumulativeSales data={daily} /></Card>
          : <Card title="Monthly net sales against target (Jan–Oct)" className="lg:col-span-3"><MonthlyTrend data={trend} /></Card>}
        <Card title={`Achievement by salesman · ${isNov ? "to date" : MONTHS[mi]}`} className="lg:col-span-2"><Achievement data={bySalesman} /></Card>
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        {isNov && <Card title="Monthly net sales against target (Jan–Oct)" className="lg:col-span-3"><MonthlyTrend data={trend} /></Card>}
        <Card title="Sales mix by channel · this year" className={isNov ? "lg:col-span-2" : "lg:col-span-5"} right={<span className="text-xs text-slate-500">Share of net sales</span>}><ChannelMix data={channelMix} /></Card>
      </div>

      <Section title="Money owed to us" sub={`From the aging report${asAt ? ` as at ${asAt.slice(8)}/${asAt.slice(5, 7)}/${asAt.slice(0, 4)}` : ""}.`} right={<Link href="/followup" className="text-sm font-medium text-indigo-700 hover:underline">Collection follow-up</Link>} />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card title="By how late" className="lg:col-span-2">
          <AgingProfile buckets={agingTotals} compact />
          {late90.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <div className="mb-2 text-sm font-semibold text-slate-700">Largest amounts over 90 days</div>
              <ol className="space-y-1.5 text-sm">
                {late90.slice(0, 5).map((c) => (
                  <li key={c.code} className="flex items-baseline justify-between gap-3"><span className="truncate text-slate-700">{c.name}</span><span className="shrink-0 font-medium tabular-nums text-slate-900">{rm(c.aging[4])}</span></li>
                ))}
              </ol>
              {late90.length > 5 && <Link href="/followup" className="mt-2 inline-block text-sm font-medium text-indigo-700 hover:underline">See all {late90.length} in Collection follow-up</Link>}
            </div>
          )}
        </Card>
        <Card title="Overdue versus total owed, by salesman" className="lg:col-span-3"><OverdueVsOwed data={overdueBySalesman} /></Card>
      </div>

      <Section title="Team" sub={`Salesman results for ${monthLabel}, and today's checks.`} />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Salesman performance" className="lg:col-span-2" right={<Link href="/sales" className="text-sm font-medium text-indigo-700 hover:underline">Sales &amp; KPI</Link>}>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full">
              <thead className="border-b border-slate-200">
                <tr className="text-left text-[13px] font-semibold text-slate-500">
                  <th className="px-4 py-2.5 sm:pl-5">Salesman</th><th className="px-3 py-2.5 text-right">Net sales</th><th className="px-3 py-2.5">Against target</th><th className="px-3 py-2.5 text-right">RL</th><th className="px-3 py-2.5 text-right">Active</th><th className="px-4 py-2.5 text-right sm:pr-5">ERC</th>
                </tr>
              </thead>
              <tbody>
                {[...list].sort((a, b) => pct(b.stats[mi].sales, b.stats[mi].target) - pct(a.stats[mi].sales, a.stats[mi].target)).map((s) => {
                  const x = s.stats[mi];
                  const p = pct(x.sales, x.target);
                  return (
                    <tr key={s.code} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-2.5 sm:pl-5"><div className="text-[15px] font-medium text-slate-900">{s.name}</div><div className="text-xs text-slate-500">{s.code}{s.area ? ` · ${s.area}` : ""}</div></td>
                      <td className="px-3 py-2.5 text-right text-[15px] tabular-nums text-slate-800">{rm(x.sales)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${Math.min(100, p)}%` }} /></div>
                          <span className={`w-11 text-right text-sm font-medium tabular-nums ${p >= 100 ? "text-emerald-700" : p >= 85 ? "text-amber-700" : "text-rose-700"}`}>{p}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-[15px] tabular-nums text-slate-700">{x.rl}</td>
                      <td className="px-3 py-2.5 text-right text-[15px] tabular-nums text-slate-700">{x.active}</td>
                      <td className={`px-4 py-2.5 text-right text-[15px] font-medium tabular-nums sm:pr-5 ${x.erc >= 70 ? "text-emerald-700" : x.erc >= 50 ? "text-amber-700" : "text-rose-700"}`}>{x.erc}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-5">
          {!filterSalesman && (
            <Card title="Daily verification" right={<Badge tone={doneCount === PANELS.length ? "green" : "amber"}>{doneCount}/{PANELS.length} verified</Badge>}>
              <ul className="space-y-2.5 text-[15px]">
                {PANELS.map((p) => (
                  <li key={p}>
                    {can("verify_daily") ? (
                      <button onClick={() => toggleVerified(p)} className="flex w-full items-center gap-2.5 text-left text-slate-700 hover:text-indigo-700">
                        {verified[p] ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-slate-400" />}{p}
                      </button>
                    ) : (
                      <span className="flex items-center gap-2.5 text-slate-600">{verified[p] ? <CheckCircle2 size={17} className="text-emerald-600" /> : <Circle size={17} className="text-slate-300" />}{p}</span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-slate-500">{can("verify_daily") ? "Tick each panel after checking it against the source report." : "Only people with the verification permission can tick these."}</p>
            </Card>
          )}
          <Card title="Items to follow up">
            <ul className="divide-y divide-slate-100 text-sm">
              {late90.slice(0, 2).map((c) => (
                <li key={c.code} className="grid grid-cols-[72px_1fr] items-start gap-3 py-2.5 first:pt-0 last:pb-0"><span className="pt-0.5"><Badge tone="amber">Collect</Badge></span><span className="text-slate-700"><b className="font-medium text-slate-900">{c.name}</b> has {rm(c.aging[4])} more than 90 days late.</span></li>
              ))}
              {pendingClaims.slice(0, 2).map((c) => (
                <li key={c.id} className="grid grid-cols-[72px_1fr] items-start gap-3 py-2.5 first:pt-0 last:pb-0"><span className="pt-0.5"><Badge tone="blue">Claim</Badge></span><span className="text-slate-700"><b className="font-medium text-slate-900">{c.id}</b> ({rm(c.amount)}) waiting for the supervisor since {c.submitted}.</span></li>
              ))}
              {showLogistics && jobs.filter((j) => j.status === "Failed" || j.status === "Delivered").slice(0, 2).map((p) => (
                <li key={p.docNo} className="grid grid-cols-[72px_1fr] items-start gap-3 py-2.5 first:pt-0 last:pb-0"><span className="pt-0.5"><Badge tone="grey">Delivery</Badge></span><span className="text-slate-700"><b className="font-medium text-slate-900">{p.docNo}</b> · {p.customerName}: {p.status === "Failed" ? "delivery failed, plan again" : "delivered, POD not scanned yet"}.</span></li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}

function Section({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-9 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}
