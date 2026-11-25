"use client";
import { useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Plate, Td, Th } from "@/components/ui";
import { useRole } from "@/components/role";
import Link from "next/link";
import { pct } from "@/lib/mock";
import { STATUSES, statusTone, vehicleText, type Status } from "@/lib/delivery/rules";
import { useDelivery, useDeliverySample } from "@/lib/delivery/store";
import { canLoad, cleanPlate, conditionTone, useFleet, warnings } from "@/lib/fleet";
import { useT } from "@/lib/i18n";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Where a lorry is today, worked out from its deliveries and its condition. */
type Where = "Out delivering" | "Back, POD missing" | "Free" | "Not available";
const WHERE: Where[] = ["Out delivering", "Back, POD missing", "Free", "Not available"];
const whereStyle: Record<Where, { ring: string; sub: string }> = {
  "Out delivering": { ring: "border-l-emerald-600", sub: "Invoices still to deliver" },
  "Back, POD missing": { ring: "border-l-amber-500", sub: "Delivered, scans to upload" },
  Free: { ring: "border-l-sky-600", sub: "Ready to load" },
  "Not available": { ring: "border-l-rose-600", sub: "In workshop or off road" },
};

export default function Logistics() {
  const { t } = useT();
  const { can } = useRole();
  const sample = useDeliverySample();
  const { jobs } = useDelivery(sample, can("page_logistics"));
  const { lorries } = useFleet(sample);
  const [filter, setFilter] = useState<Where | "All">("All");

  // Deliveries come from the delivery tracking, not from a sample.
  const todayMYT = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
  const dayDiff = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 86400000);
  const n = (st: Status) => jobs.filter((j) => j.status === st).length;
  const stageMax = Math.max(1, ...STATUSES.filter((st) => st !== "Failed").map(n));
  const last = (j: (typeof jobs)[number]) => (j.events[j.events.length - 1]?.at ?? "").slice(0, 10);
  const trips = useMemo(() => {
    const m = new Map<string, { who: string; routes: Set<string>; total: number; done: number; failed: number }>();
    for (const j of jobs) {
      if (!j.vehicle) continue;
      if (j.status === "Completed" && dayDiff(todayMYT, last(j)) > 1) continue;
      const k = vehicleText(j.vehicle) || "-";
      const g = m.get(k) ?? { who: k, routes: new Set<string>(), total: 0, done: 0, failed: 0 };
      if (j.route) g.routes.add(j.route);
      g.total++; if (j.status === "Delivered" || j.status === "Completed") g.done++; if (j.status === "Failed") g.failed++;
      m.set(k, g);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);
  const NEXT: Record<Status, string> = { Invoiced: "Pick it", Picked: "Load it", Loaded: "Out for delivery", Delivered: "Scan the POD", Completed: "", Failed: "Plan again" };
  const pending = jobs.filter((j) => j.status !== "Completed").map((j) => ({ ...j, age: Math.max(0, dayDiff(todayMYT, j.docDate || todayMYT)) })).sort((a, b) => b.age - a.age).slice(0, 25);
  // each lorry on the list with what is on it right now (loaded, or delivered with the scan still to upload)
  const board = lorries.map((l) => {
    const on = jobs.filter((j) => j.vehicle?.kind === "own" && cleanPlate(j.vehicle.lorryNo ?? "") === l.no && (j.status === "Loaded" || j.status === "Delivered"));
    const loaded = on.filter((j) => j.status === "Loaded").length, podMissing = on.filter((j) => j.status === "Delivered").length;
    const where: Where = !canLoad(l.condition) ? "Not available" : loaded ? "Out delivering" : podMissing ? "Back, POD missing" : "Free";
    const drivers = [...new Set(on.map((j) => j.vehicle?.driver).filter(Boolean))], routes = [...new Set(on.map((j) => j.route).filter(Boolean))];
    const assistants = [...new Set(on.map((j) => j.vehicle?.assistant).filter(Boolean))];
    return { l, where, loaded, podMissing, amount: on.reduce((t, j) => t + j.amount, 0), driver: drivers.join(", ") || l.driver, assistant: assistants.join(", "), route: routes.join(", "), papers: warnings(l).filter((w) => w.state === "expired") };
  }).sort((a, b) => WHERE.indexOf(a.where) - WHERE.indexOf(b.where) || b.loaded - a.loaded || a.l.no.localeCompare(b.l.no));
  const third = jobs.filter((j) => j.vehicle?.kind === "third" && (j.status === "Loaded" || j.status === "Delivered"));
  const count = (w: Where) => board.filter((b) => b.where === w).length;
  const shown = board.filter((b) => filter === "All" || b.where === filter);

  return (
    <>
      <PageHeader title="Logistics · Daily Delivery Status" sub="Lorries, drivers and every invoice from picking to a scanned proof of delivery." right={<div className="flex flex-wrap gap-3 text-sm"><Link href="/logistics/deliveries" className="text-indigo-600 hover:underline">{t("Deliveries")}</Link><Link href="/logistics/exceptions" className="text-indigo-600 hover:underline">{t("Exceptions")}</Link><Link href="/logistics/damaged" className="text-indigo-600 hover:underline">{t("Damaged stock")}</Link><Link href="/logistics/sop" className="text-indigo-600 hover:underline">{t("Warehouse SOP")}</Link></div>} />

      {/* Lorries today: from the lorry list and the deliveries */}
      <Card title="Lorries today" right={<div className="flex gap-3 text-sm"><Link href="/logistics/deliveries" className="text-indigo-600 hover:underline">{t("Load a lorry")}</Link><Link href="/logistics/lorries" className="text-indigo-600 hover:underline">{t("Manage lorries")} ({lorries.length})</Link></div>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(["All", ...WHERE] as const).map((w) => {
            const c = w === "All" ? board.length : count(w);
            const active = filter === w;
            return (
              <button key={w} onClick={() => setFilter(w)} className={`rounded-lg border p-3 text-left ${active ? "border-slate-900 bg-signal-soft" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="text-sm text-slate-500">{t(w === "All" ? "All lorries" : w)}</div>
                <div className="font-display text-[34px] font-semibold leading-tight text-slate-900">{c}</div>
                <div className="text-sm text-slate-500">{t(w === "All" ? "on the lorry list" : whereStyle[w].sub)}</div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {shown.map((b) => (
            <Link key={b.l.no} href="/logistics/deliveries" className={`block rounded-lg border border-slate-200 border-l-4 bg-white p-3 hover:bg-slate-50 ${whereStyle[b.where].ring}`}>
              <div className="flex items-center justify-between gap-2">
                <Plate>{b.l.no}</Plate>
                <Badge tone={conditionTone(b.l.condition)}>{b.l.condition}</Badge>
              </div>
              <div className="mt-1 text-sm font-medium text-slate-800">{t(b.where)}</div>
              <div className="text-sm text-slate-600">{b.driver || t("No driver set")}{b.assistant ? ` + ${b.assistant}` : ""}{b.route ? ` · ${b.route}` : ""}</div>
              <div className="text-xs text-slate-400">{b.l.size}{b.l.pallets != null ? `, ${b.l.pallets} ${t("pallets")}` : ""}</div>
              {(b.loaded > 0 || b.podMissing > 0) && <div className="mt-2 text-sm text-slate-700">{b.loaded} {t("out")} · {b.podMissing} {t("POD missing")} · RM {money(b.amount)}</div>}
              {b.where === "Not available" && b.l.notes && <div className="mt-1 text-xs text-rose-700">{b.l.notes}</div>}
              {b.papers.length > 0 && <div className="mt-1 flex items-center gap-1 text-xs text-rose-700"><TriangleAlert size={12} />{b.papers.map((w) => `${t(w.label)} ${t("expired")}`).join(", ")}</div>}
            </Link>
          ))}
          {third.length > 0 && (filter === "All" || filter === "Out delivering") && (
            <div className="rounded-lg border border-slate-200 border-l-4 border-l-violet-500 bg-white p-3">
              <div className="font-medium text-slate-900">{t("3rd-party transporters")}</div>
              <div className="mt-1 text-sm text-slate-700">{third.filter((j) => j.status === "Loaded").length} {t("out")} · {third.filter((j) => j.status === "Delivered").length} {t("POD missing")}</div>
              <div className="text-sm text-slate-600">{[...new Set(third.map((j) => j.vehicle?.transporter).filter(Boolean))].join(", ")}</div>
            </div>
          )}
          {!lorries.length && <p className="col-span-full py-6 text-center text-sm text-slate-500">{t("No lorries on the list yet.")} <Link href="/logistics/lorries" className="text-indigo-600 hover:underline">{t("Add them on the Lorries page.")}</Link></p>}
          {lorries.length > 0 && !shown.length && <p className="col-span-full py-6 text-center text-sm text-slate-400">{t("No lorries here right now.")}</p>}
        </div>
      </Card>

      {/* Delivery summary */}
      {sample && <p className="mt-5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{t("Sample deliveries, not real.")}</p>}
      <div className="mt-5">
        <KpiStrip cols="lg:grid-cols-5">
          <Kpi label="To pick" value={`${n("Invoiced")}`} sub="Invoiced, not picked" tone={n("Invoiced") ? "warn" : "good"} />
          <Kpi label="To load" value={`${n("Picked")}`} sub="Picked and checked" />
          <Kpi label="Out for delivery" value={`${n("Loaded")}`} sub="Loaded" />
          <Kpi label="POD missing" value={`${n("Delivered")}`} sub="Delivered, not scanned" tone={n("Delivered") ? "bad" : "good"} />
          <Kpi label="Failed, to reschedule" value={`${n("Failed")}`} tone={n("Failed") ? "bad" : "good"} />
        </KpiStrip>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card title="Status by step" className="lg:col-span-1">
          <ul className="space-y-3">
            {STATUSES.filter((st) => st !== "Failed").map((st) => (
              <li key={st}>
                <div className="mb-1 flex justify-between text-xs text-slate-600"><span>{t(st === "Delivered" ? "Delivered, POD missing" : st)}</span><b>{n(st)}</b></div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-indigo-500" style={{ width: `${pct(n(st), stageMax)}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Driver / route progress" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th>Driver / lorry or transporter</Th><Th>Route</Th><Th right>Total</Th><Th right>Done</Th><Th right>Failed</Th><Th>Progress</Th></tr></thead>
              <tbody>
                {trips.length === 0 && <tr><Td first className="text-slate-500">{t("No loaded invoices yet.")}</Td></tr>}
                {trips.map((d) => (
                  <tr key={d.who} className="border-b border-slate-100 last:border-0">
                    <Td><b>{d.who}</b></Td><Td>{[...d.routes].join(", ") || "-"}</Td>
                    <Td right>{d.total}</Td><Td right>{d.done}</Td><Td right className={d.failed ? "font-medium text-rose-600" : ""}>{d.failed}</Td>
                    <Td><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${pct(d.done, d.total)}%` }} /></div><span className="text-xs text-slate-500">{pct(d.done, d.total)}%</span></div></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Pending invoices: next action" className="mt-5" right={<Link href="/logistics/deliveries" className="text-sm text-indigo-600 hover:underline">{t("All deliveries")}</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th>Invoice</Th><Th>Customer</Th><Th>Driver / lorry</Th><Th>Status</Th><Th>Next</Th><Th right>Age</Th></tr></thead>
            <tbody>
              {pending.length === 0 && <tr><Td first className="text-slate-500">{t("Nothing pending.")}</Td></tr>}
              {pending.map((p) => (
                <tr key={p.docNo} className="border-b border-slate-100 last:border-0">
                  <Td><b>{p.docNo}</b></Td><Td>{p.customerName}</Td><Td>{vehicleText(p.vehicle) || "-"}</Td>
                  <Td><Badge tone={statusTone(p.status)}>{p.status === "Delivered" ? "POD missing" : p.status}</Badge></Td>
                  <Td>{t(NEXT[p.status])}</Td>
                  <Td right>{p.age === 0 ? t("Today") : `${p.age} ${t(p.age === 1 ? "day" : "days")}`}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
