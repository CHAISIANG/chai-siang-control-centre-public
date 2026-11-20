import { Badge } from "@/components/ui";

export type PerfRow = { name: string; sales: number; target: number };
const rm = (n: number) => "RM " + Math.round(n).toLocaleString("en-MY");
const ach = (r: PerfRow) => (r.target ? (r.sales / r.target) * 100 : 0);
const tone = (a: number) => (a >= 100 ? "bg-emerald-500" : a >= 80 ? "bg-amber-400" : "bg-rose-500");
const SCALE = 120; // the bar runs from 0% to 120% of target; the line marks 100%

/** Net sales against target for each salesman in the chosen month, best first. */
export function SalesPerformance({ rows }: { rows: PerfRow[] }) {
  const sorted = [...rows].sort((a, b) => ach(b) - ach(a));
  const total = rows.reduce((s, r) => ({ sales: s.sales + r.sales, target: s.target + r.target }), { sales: 0, target: 0 });
  const t = ach({ name: "", ...total });
  if (!rows.length) return <p className="text-sm text-slate-500">No sales figures for this month yet.</p>;
  return (
    <div>
      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
        <div className="flex items-baseline justify-between gap-2"><span className="text-sm text-slate-600">All salesmen</span><b className="text-lg text-slate-900">{t.toFixed(1)}%</b></div>
        <div className="text-xs text-slate-500">{rm(total.sales)} of {rm(total.target)} target</div>
      </div>
      <ul className="space-y-3">
        {sorted.map((r) => {
          const a = ach(r);
          return (
            <li key={r.name}>
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium text-slate-800">{r.name}</span>
                <Badge tone={a >= 100 ? "green" : a >= 80 ? "amber" : "red"}>{a.toFixed(1)}%</Badge>
              </div>
              <div className="relative mt-1 h-2.5 w-full rounded-full bg-slate-100" role="img" aria-label={`${r.name}: ${a.toFixed(1)}% of target`}>
                <div className={`h-full rounded-full ${tone(a)}`} style={{ width: `${Math.min(a, SCALE) / SCALE * 100}%` }} />
                <div className="absolute -top-0.5 h-3.5 w-px bg-slate-500" style={{ left: `${(100 / SCALE) * 100}%` }} title="Target" />
              </div>
              <div className="mt-0.5 text-xs text-slate-500">{rm(r.sales)} of {rm(r.target)}</div>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-xs text-slate-500">The line marks 100% of target.</p>
    </div>
  );
}
