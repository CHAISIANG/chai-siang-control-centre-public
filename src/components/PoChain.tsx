"use client";
import { Check } from "lucide-react";
import { stageOf, STAGES, type Po } from "@/lib/po";

/** Five dots: PO received, order keyed, invoiced, delivered, closed. */
export function Chain({ po }: { po: Po }) {
  const at = STAGES.findIndex((s) => s.key === stageOf(po));
  return (
    <div className="flex items-center gap-1" aria-label={`Stage: ${STAGES[at].label}`}>
      {STAGES.map((s, i) => (
        <span key={s.key} title={s.label} className={`grid h-5 w-5 place-items-center rounded-full text-white ${i <= at ? (i === at && at < 4 ? "bg-indigo-600" : "bg-emerald-600") : "bg-slate-200"}`}>
          {i <= at && (i < at || at === 4) ? <Check size={12} /> : null}
        </span>
      ))}
      <span className="ml-2 text-sm text-slate-600">{STAGES[at].label}</span>
    </div>
  );
}
