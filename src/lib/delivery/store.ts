"use client";
// One shared store for the delivery screens, so a job moves from screen to screen as it is picked, loaded, delivered and scanned.
// Live mode (inside the app) reads the database and acts through the delivery_* functions, which check every step again.
// Sample mode (the preview page) keeps made-up data in this browser with a reset.
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { docFromFileName, EXC_KINDS, CAUSES, DECISIONS, type Cause, type DamagedItem, type DeliveryException, type DeliveryJob, type Decision, type DocCase, type ExcKind, type Status, type Vehicle } from "./rules";
import { SAMPLE_DAMAGED, SAMPLE_EXCEPTIONS, SAMPLE_JOBS } from "./sample";

export type DeliveryState = { jobs: DeliveryJob[]; exceptions: DeliveryException[]; damaged: DamagedItem[]; loading?: boolean };
export type Result = { ok: true; text: string; extra?: string[] } | { ok: false; text: string };

/** The preview page wraps its screens in this, so they use sample data instead of the database. */
const SampleMode = createContext(false);
export function DeliverySample({ children }: { children: ReactNode }) { return createElement(SampleMode.Provider, { value: true }, children); }
export function useDeliverySample() { return useContext(SampleMode); }

const KEY = "cssb.delivery.sample.v1";
const myt = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(",", "");
const stamp = () => myt(new Date());
const day = () => stamp().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 9);
const seed = (): DeliveryState => ({ jobs: structuredClone(SAMPLE_JOBS), exceptions: structuredClone(SAMPLE_EXCEPTIONS), damaged: structuredClone(SAMPLE_DAMAGED) });
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
const fail = (text: string): Result => ({ ok: false, text });
const dbFail = (e: { message?: string } | null | undefined): Result => fail((e?.message ?? "Something went wrong. Try again.").replace(/^.*?ERROR:\s*/, ""));
const plural = (n: number, a: string, b: string) => `${n} ${n === 1 ? a : b}`;

// ---------- sample: this browser only ----------
let sample: DeliveryState = seed();
let sampleLoaded = false;
function loadSample() {
  if (sampleLoaded || typeof window === "undefined") return;
  sampleLoaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s?.jobs) sample = s; } } catch { /* start from the sample */ }
}
function setSample(next: DeliveryState) {
  sample = next;
  try { localStorage.setItem(KEY, JSON.stringify(sample)); } catch { /* ignore */ }
  ping();
}
export function resetDelivery() { setSample(seed()); }

// ---------- live: the database ----------
let live: DeliveryState = { jobs: [], exceptions: [], damaged: [], loading: true };
let liveStarted = false;
type EventRow = { id: number; at: string; status: Status; by_name: string | null; note: string | null };
type JobRow = { doc_no: string; doc_date: string | null; customer: string; customer_name: string | null; agent: string | null; amount: number | string; doc_case: DocCase; status: Status; vehicle: Vehicle | null; route: string | null; pod_path: string | null; pod_file: string | null; fail_reason: string | null; delivery_events: EventRow[] };
type ExcRow = { id: string; doc_no: string; kind: ExcKind; detail: string; qty: number | null; note_no: string | null; status: "Open" | "Resolved"; by_name: string | null; at: string; resolution: string | null; resolved_at: string | null };
type DmgRow = { id: string; found_on: string; item_code: string; description: string | null; qty: number | string; uom: string; zone: string; cause: Cause; photo_path: string | null; by_name: string | null; decision: Decision | null; decided_by: string | null; decided_on: string | null; note: string | null };

export async function reloadDelivery() {
  const [j, e, d] = await Promise.all([
    supabase.from("delivery_jobs").select("doc_no, doc_date, customer, customer_name, agent, amount, doc_case, status, vehicle, route, pod_path, pod_file, fail_reason, delivery_events(id, at, status, by_name, note)").order("doc_date", { ascending: false }).limit(3000),
    supabase.from("delivery_exceptions").select("id, doc_no, kind, detail, qty, note_no, status, by_name, at, resolution, resolved_at").order("at", { ascending: false }).limit(1000),
    supabase.from("damaged_stock").select("id, found_on, item_code, description, qty, uom, zone, cause, photo_path, by_name, decision, decided_by, decided_on, note").order("found_on", { ascending: false }).limit(1000),
  ]);
  live = {
    jobs: ((j.data ?? []) as unknown as JobRow[]).map((r): DeliveryJob => ({
      docNo: r.doc_no, docDate: r.doc_date ?? "", customer: r.customer, customerName: r.customer_name ?? r.customer, agent: r.agent ?? "", amount: Number(r.amount),
      docCase: r.doc_case, status: r.status, vehicle: r.vehicle ?? undefined, route: r.route ?? undefined, podFile: r.pod_file ?? undefined, podPath: r.pod_path ?? undefined, failReason: r.fail_reason ?? undefined,
      events: [...(r.delivery_events ?? [])].sort((a, b) => a.id - b.id).map((x) => ({ at: myt(new Date(x.at)), status: x.status, by: x.by_name ?? "", note: x.note ?? undefined })),
    })),
    exceptions: ((e.data ?? []) as ExcRow[]).map((r): DeliveryException => ({ id: r.id, docNo: r.doc_no, kind: r.kind, detail: r.detail, qty: r.qty == null ? undefined : Number(r.qty), noteNo: r.note_no ?? undefined, status: r.status, by: r.by_name ?? "", at: r.at, resolution: r.resolution ?? undefined, resolvedAt: r.resolved_at ?? undefined })),
    damaged: ((d.data ?? []) as DmgRow[]).map((r): DamagedItem => ({ id: r.id, foundOn: r.found_on, itemCode: r.item_code, description: r.description ?? "", qty: Number(r.qty), uom: r.uom, zone: r.zone, cause: r.cause, photo: r.photo_path ? r.photo_path.split("/").pop() : undefined, by: r.by_name ?? "", decision: r.decision ?? undefined, decidedBy: r.decided_by ?? undefined, decidedOn: r.decided_on ?? undefined, note: r.note ?? undefined })),
  };
  ping();
}
function startLive() {
  if (liveStarted || typeof window === "undefined") return;
  liveStarted = true;
  void reloadDelivery();
  // someone else moves an invoice: every screen follows
  supabase.channel(`delivery-${uid()}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "delivery_jobs" }, () => void reloadDelivery())
    .on("postgres_changes", { event: "*", schema: "public", table: "delivery_exceptions" }, () => void reloadDelivery())
    .on("postgres_changes", { event: "*", schema: "public", table: "damaged_stock" }, () => void reloadDelivery())
    .subscribe();
}

const SERVER = seed();
const SERVER_LIVE: DeliveryState = { jobs: [], exceptions: [], damaged: [], loading: true };
const NONE: DeliveryState = { jobs: [], exceptions: [], damaged: [] };
/** `enabled` is false for people who may not see Logistics: nothing is loaded for them. */
export function useDelivery(useSample: boolean, enabled = true): DeliveryState {
  return useSyncExternalStore(
    (f) => { if (useSample) loadSample(); else if (enabled) startLive(); subs.add(f); return () => subs.delete(f); },
    () => { if (useSample) { loadSample(); return sample; } return enabled ? live : NONE; },
    () => (useSample ? SERVER : enabled ? SERVER_LIVE : NONE),
  );
}

const cur = (useSample: boolean) => (useSample ? sample : live);
const report = (verb: string, r: { done: number; skipped: string[] }): Result =>
  r.done ? { ok: true, text: `${plural(r.done, "invoice", "invoices")} ${verb}.${r.skipped.length ? ` ${r.skipped.length} skipped.` : ""}`, extra: r.skipped } : fail(r.skipped[0] ?? "Nothing to do.");

/** Move jobs one step in the sample. Each job must be in the right status for the step; others are skipped and named. */
function moveSample(docs: string[], from: Status, to: Status, by: string, patch: (j: DeliveryJob) => Partial<DeliveryJob>, note?: string): { done: number; skipped: string[] } {
  let done = 0; const skipped: string[] = [];
  const jobs = sample.jobs.map((j) => {
    if (!docs.includes(j.docNo)) return j;
    if (j.status !== from) { skipped.push(`${j.docNo} is ${j.status}, not ${from}`); return j; }
    done++;
    return { ...j, ...patch(j), status: to, events: [...j.events, { at: stamp(), status: to, by, note }] };
  });
  if (done) setSample({ ...sample, jobs });
  return { done, skipped };
}
/** Ask the database to move jobs; it answers with how many moved and which were skipped. */
async function moveLive(fn: string, args: Record<string, unknown>, verb: string): Promise<Result> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return dbFail(error);
  await reloadDelivery();
  return report(verb, data as { done: number; skipped: string[] });
}

export async function markPicked(useSample: boolean, docs: string[], by: string): Promise<Result> {
  if (!useSample) return moveLive("delivery_pick", { p_docs: docs }, "marked Picked");
  if (!by.trim()) return fail("Enter who checked the picking.");
  return report("marked Picked", moveSample(docs, "Invoiced", "Picked", by.trim(), () => ({}), "Second check signed"));
}
export async function markLoaded(useSample: boolean, docs: string[], vehicle: Vehicle, route: string, by: string): Promise<Result> {
  if (!route.trim()) return fail("Enter the route.");
  if (vehicle.kind === "own" && (!vehicle.lorryNo?.trim() || !vehicle.driver?.trim())) return fail("Enter the lorry number and the driver.");
  if (vehicle.kind === "third" && !vehicle.transporter?.trim()) return fail("Enter the transporter.");
  if (!useSample) return moveLive("delivery_load", { p_docs: docs, p_vehicle: vehicle, p_route: route.trim() }, "marked Loaded");
  return report("marked Loaded", moveSample(docs, "Picked", "Loaded", by, () => ({ vehicle, route: route.trim(), failReason: undefined }), "Manifest signed"));
}
export async function markDelivered(useSample: boolean, docs: string[], by: string): Promise<Result> {
  if (!useSample) return moveLive("delivery_deliver", { p_docs: docs }, "marked Delivered");
  return report("marked Delivered", moveSample(docs, "Loaded", "Delivered", by, () => ({}), "Signed document received"));
}
export async function markFailed(useSample: boolean, doc: string, reason: string, by: string): Promise<Result> {
  if (!reason.trim()) return fail("Give the reason the delivery failed.");
  if (!useSample) return moveLive("delivery_fail", { p_doc: doc, p_reason: reason.trim() }, "marked Failed");
  return report("marked Failed", moveSample([doc], "Loaded", "Failed", by, () => ({ failReason: reason.trim() }), reason.trim()));
}
export async function replan(useSample: boolean, doc: string, by: string): Promise<Result> {
  if (!useSample) return moveLive("delivery_replan", { p_doc: doc }, "sent back to Picked for a new plan");
  return report("sent back to Picked for a new plan", moveSample([doc], "Failed", "Picked", by, () => ({ failReason: undefined }), "Re-planned"));
}
export async function setDocCase(useSample: boolean, doc: string, c: DocCase): Promise<Result> {
  const done: Result = { ok: true, text: `${doc} is now ${c === "DO" ? "with DO" : "no DO"}.` };
  if (!useSample) {
    const { error } = await supabase.rpc("delivery_set_case", { p_doc: doc, p_case: c });
    await reloadDelivery();
    return error ? dbFail(error) : done;
  }
  const j = sample.jobs.find((x) => x.docNo === doc);
  if (!j) return fail("Invoice not found.");
  if (j.status !== "Invoiced") return fail("The document type can only change before picking.");
  setSample({ ...sample, jobs: sample.jobs.map((x) => (x.docNo === doc ? { ...x, docCase: c } : x)) });
  return done;
}

/** Attach scanned PODs. Each file is matched to an invoice by the number in its name; only Delivered invoices can be completed. */
export async function attachPods(useSample: boolean, files: File[], by: string): Promise<Result> {
  let done = 0; const problems: string[] = [];
  let jobs = cur(useSample).jobs;
  for (const file of files) {
    const f = file.name;
    const doc = docFromFileName(f);
    if (!doc) { problems.push(`${f}: no invoice number in the file name`); continue; }
    const j = jobs.find((x) => x.docNo === doc);
    if (!j) { problems.push(`${f}: invoice ${doc} is not in the delivery list`); continue; }
    if (j.status === "Completed") { problems.push(`${f}: ${doc} already has a POD`); continue; }
    if (j.status !== "Delivered") { problems.push(`${f}: ${doc} is ${j.status}, a POD can only be attached once it is Delivered`); continue; }
    if (useSample) {
      jobs = jobs.map((x) => (x.docNo === doc ? { ...x, status: "Completed" as const, podFile: f, events: [...x.events, { at: stamp(), status: "Completed" as const, by, note: "POD scanned" }] } : x));
      done++;
      continue;
    }
    // live: store the scan privately, then let the database complete the job
    let path = `${doc}/${f}`;
    let up = await supabase.storage.from("pod-scans").upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (up.error && /exists|duplicate/i.test(up.error.message)) { path = `${doc}/${Date.now()}-${f}`; up = await supabase.storage.from("pod-scans").upload(path, file, { upsert: false, contentType: file.type || undefined }); }
    if (up.error) { problems.push(`${f}: could not be uploaded (${up.error.message})`); continue; }
    const { error } = await supabase.rpc("delivery_attach_pod", { p_doc: doc, p_path: path, p_file: f });
    if (error) { await supabase.storage.from("pod-scans").remove([path]); problems.push(`${f}: ${dbFail(error).text}`); continue; }
    jobs = jobs.map((x) => (x.docNo === doc ? { ...x, status: "Completed" as const } : x));
    done++;
  }
  if (useSample && done) setSample({ ...sample, jobs });
  if (!useSample && done) await reloadDelivery();
  if (!done) return fail(problems[0] ?? "No files chosen.");
  return { ok: true, text: `${plural(done, "POD", "PODs")} attached and completed.${problems.length ? ` ${plural(problems.length, "file", "files")} not used.` : ""}`, extra: problems };
}
/** A short-lived link to open a scanned POD (live only). */
export async function podLink(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("pod-scans").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}

export async function logException(useSample: boolean, docNo: string, kind: ExcKind, detail: string, qty: number | undefined, noteNo: string, by: string): Promise<Result> {
  if (!cur(useSample).jobs.some((j) => j.docNo === docNo)) return fail("Choose an invoice from the delivery list.");
  if (!EXC_KINDS.includes(kind)) return fail("Choose the kind of exception.");
  if (!detail.trim()) return fail("Describe what happened.");
  const done: Result = { ok: true, text: `Exception logged for ${docNo}.` };
  if (!useSample) {
    const { error } = await supabase.rpc("delivery_exception_log", { p_doc: docNo, p_kind: kind, p_detail: detail.trim(), p_qty: qty ?? null, p_note_no: noteNo.trim() || null });
    await reloadDelivery();
    return error ? dbFail(error) : done;
  }
  setSample({ ...sample, exceptions: [{ id: uid(), docNo, kind, detail: detail.trim(), qty, noteNo: noteNo.trim() || undefined, status: "Open", by, at: day() }, ...sample.exceptions] });
  return done;
}
export async function resolveException(useSample: boolean, id: string, resolution: string, noteNo: string): Promise<Result> {
  if (!resolution.trim()) return fail("Say how it was settled.");
  const done: Result = { ok: true, text: "Marked as settled." };
  if (!useSample) {
    const { error } = await supabase.rpc("delivery_exception_resolve", { p_id: id, p_resolution: resolution.trim(), p_note_no: noteNo.trim() || null });
    await reloadDelivery();
    return error ? dbFail(error) : done;
  }
  setSample({ ...sample, exceptions: sample.exceptions.map((e) => (e.id === id ? { ...e, status: "Resolved", resolution: resolution.trim(), noteNo: noteNo.trim() || e.noteNo, resolvedAt: day() } : e)) });
  return done;
}

export async function logDamaged(useSample: boolean, i: { itemCode: string; description: string; qty: number; uom: string; cause: Cause; photo?: File }, by: string): Promise<Result> {
  if (!i.itemCode.trim()) return fail("Enter the item code.");
  if (!(i.qty > 0)) return fail("Enter a quantity above zero.");
  if (!CAUSES.includes(i.cause)) return fail("Choose the cause.");
  const done: Result = { ok: true, text: "Damaged stock logged in Zone F." };
  if (!useSample) {
    let path: string | null = null;
    if (i.photo) {
      path = `${crypto.randomUUID()}/${i.photo.name}`;
      const up = await supabase.storage.from("damage-photos").upload(path, i.photo, { upsert: false, contentType: i.photo.type || undefined });
      if (up.error) return fail(`The photo could not be uploaded: ${up.error.message}`);
    }
    const { error } = await supabase.rpc("damaged_log", { p_item_code: i.itemCode.trim(), p_description: i.description.trim(), p_qty: i.qty, p_uom: i.uom.trim() || "Carton", p_cause: i.cause, p_photo_path: path });
    if (error && path) await supabase.storage.from("damage-photos").remove([path]);
    await reloadDelivery();
    return error ? dbFail(error) : done;
  }
  setSample({ ...sample, damaged: [{ id: uid(), foundOn: day(), itemCode: i.itemCode.trim(), description: i.description.trim(), qty: i.qty, uom: i.uom.trim() || "Carton", zone: "F", cause: i.cause, photo: i.photo?.name, by }, ...sample.damaged] });
  return done;
}
/** Return, claim, rework or write-off. A write-off needs a written reason, and only the supervisor, Management or a Director can decide. */
export async function decideDamaged(useSample: boolean, id: string, decision: Decision, by: string, note: string): Promise<Result> {
  if (!DECISIONS.includes(decision)) return fail("Choose a decision.");
  if (decision === "Write-off" && !note.trim()) return fail("A write-off needs a written reason.");
  const done: Result = { ok: true, text: `Decision saved: ${decision}.` };
  if (!useSample) {
    const { error } = await supabase.rpc("damaged_decide", { p_id: id, p_decision: decision, p_note: note.trim() || null });
    await reloadDelivery();
    return error ? dbFail(error) : done;
  }
  setSample({ ...sample, damaged: sample.damaged.map((d) => (d.id === id ? { ...d, decision, decidedBy: by, decidedOn: day(), note: note.trim() || undefined } : d)) });
  return done;
}
