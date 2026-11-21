// Invoice tracker: everything about one invoice in one place, from the SAP import to the scanned proof of delivery.
// Each person sees only what their role allows (the database decides); a missing part simply shows as not available.
import { supabase } from "@/lib/supabase";
import type { DeliveryException, DeliveryJob, JobEvent, Status, Vehicle } from "@/lib/delivery/rules";
import { SAMPLE_EXCEPTIONS, SAMPLE_JOBS } from "@/lib/delivery/sample";

export type Tracked = {
  job: DeliveryJob;
  importedFrom?: { file: string; at: string } | null;   // null: not visible to this person
  credit?: { status: "Waiting" | "Approved" | "Rejected"; by?: string; note?: string } | null;
  owed?: number | null;                                  // outstanding in the latest aging; undefined: not in the aging
  exceptions: DeliveryException[];
};

const myt = (d: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d)).replace(",", "");

/** Sample mode for the preview page: the made-up delivery jobs. */
export function sampleSearch(q: string): Tracked[] {
  const k = q.trim().toLowerCase();
  return SAMPLE_JOBS.filter((j) => !k || `${j.docNo} ${j.customerName} ${j.customer}`.toLowerCase().includes(k)).slice(0, 30).map((job) => ({
    job, importedFrom: { file: "Sample export.xlsx", at: `${job.docDate} 09:00` },
    credit: job.docNo === "S900203" ? { status: "Approved", by: "Sample Finance", note: "Cheque received" } : undefined,
    owed: job.status === "Completed" ? undefined : job.amount, exceptions: SAMPLE_EXCEPTIONS.filter((e) => e.docNo === job.docNo),
  }));
}

type JobRow = { doc_no: string; doc_date: string | null; customer: string; customer_name: string | null; agent: string | null; amount: number | string; doc_case: "DO" | "NO_DO"; status: Status; vehicle: Vehicle | null; route: string | null; pod_path: string | null; pod_file: string | null; fail_reason: string | null; batch_id: number | null; delivery_events: { id: number; at: string; status: Status; by_name: string | null; note: string | null }[] };

/** Live: find invoices by number or customer and gather what this person may see about each. */
export async function liveSearch(q: string): Promise<{ list: Tracked[]; error: string | null }> {
  const k = q.trim().replace(/[%,()]/g, " ");
  if (k.length < 2) return { list: [], error: null };
  const j = await supabase.from("delivery_jobs")
    .select("doc_no, doc_date, customer, customer_name, agent, amount, doc_case, status, vehicle, route, pod_path, pod_file, fail_reason, batch_id, delivery_events(id, at, status, by_name, note)")
    .or(`doc_no.ilike.%${k}%,customer_name.ilike.%${k}%,customer.ilike.%${k}%`).order("doc_date", { ascending: false }).limit(30);
  if (j.error) return { list: [], error: j.error.message };
  const rows = (j.data ?? []) as unknown as JobRow[];
  if (!rows.length) return { list: [], error: null };
  const docs = rows.map((r) => r.doc_no), batches = [...new Set(rows.map((r) => r.batch_id).filter((b): b is number => b != null))];
  const [b, c, a, e] = await Promise.all([
    batches.length ? supabase.from("sap_import_batches").select("id, file_name, made_at").in("id", batches) : Promise.resolve({ data: [], error: null }),
    supabase.from("credit_approvals").select("doc_no, status, decided_by_name, decision_note, asked_at").in("doc_no", docs).order("asked_at"),
    supabase.from("ar_invoices").select("doc_no, outstanding").in("doc_no", docs),
    supabase.from("delivery_exceptions").select("id, doc_no, kind, detail, qty, note_no, status, by_name, at, resolution, resolved_at").in("doc_no", docs),
  ]);
  const batch = new Map(((b.data ?? []) as { id: number; file_name: string; made_at: string }[]).map((x) => [x.id, x]));
  const credit = new Map<string, Tracked["credit"]>();
  for (const x of (c.data ?? []) as { doc_no: string; status: "Waiting" | "Approved" | "Rejected"; decided_by_name: string | null; decision_note: string | null }[]) credit.set(x.doc_no, { status: x.status, by: x.decided_by_name ?? undefined, note: x.decision_note ?? undefined });
  const owed = new Map(((a.data ?? []) as { doc_no: string; outstanding: number | string }[]).map((x) => [x.doc_no, Number(x.outstanding)]));
  const exc = ((e.data ?? []) as { id: string; doc_no: string; kind: DeliveryException["kind"]; detail: string; qty: number | null; note_no: string | null; status: "Open" | "Resolved"; by_name: string | null; at: string; resolution: string | null; resolved_at: string | null }[])
    .map((x): DeliveryException => ({ id: x.id, docNo: x.doc_no, kind: x.kind, detail: x.detail, qty: x.qty ?? undefined, noteNo: x.note_no ?? undefined, status: x.status, by: x.by_name ?? "", at: x.at, resolution: x.resolution ?? undefined, resolvedAt: x.resolved_at ?? undefined }));
  return {
    error: null,
    list: rows.map((r): Tracked => {
      const events: JobEvent[] = [...(r.delivery_events ?? [])].sort((x, y) => x.id - y.id).map((x) => ({ at: myt(x.at), status: x.status, by: x.by_name ?? "", note: x.note ?? undefined }));
      const bt = r.batch_id != null ? batch.get(r.batch_id) : undefined;
      return {
        job: { docNo: r.doc_no, docDate: r.doc_date ?? "", customer: r.customer, customerName: r.customer_name ?? r.customer, agent: r.agent ?? "", amount: Number(r.amount), docCase: r.doc_case, status: r.status, vehicle: r.vehicle ?? undefined, route: r.route ?? undefined, podFile: r.pod_file ?? undefined, podPath: r.pod_path ?? undefined, failReason: r.fail_reason ?? undefined, events },
        importedFrom: bt ? { file: bt.file_name, at: myt(bt.made_at) } : b.error ? null : null,
        credit: c.error ? null : credit.get(r.doc_no),
        owed: a.error ? null : owed.get(r.doc_no),
        exceptions: exc.filter((x) => x.docNo === r.doc_no),
      };
    }),
  };
}
