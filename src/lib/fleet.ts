"use client";
// Our own lorries: plate, size, what they carry, the usual driver, condition and the dates that must not lapse.
// Sample mode (the preview page, inside <DeliverySample>) keeps made-up lorries in this browser.
// Live mode reads the database and changes it through the fleet_* functions, which check every rule again.
import { useSyncExternalStore } from "react";
import { supabase } from "@/lib/supabase";

export const SIZES = ["1 tonne", "3 tonne", "5 tonne", "10 tonne", "Other"] as const;
export const CONDITIONS = ["Good", "Needs service", "In workshop", "Off road"] as const;
export type Size = (typeof SIZES)[number];
export type Condition = (typeof CONDITIONS)[number];
export type FleetEvent = { at: string; by: string; condition: Condition; note?: string };
export type Lorry = {
  no: string; size: Size; pallets: number | null; cartons: number | null; driver: string;
  condition: Condition; roadTax: string; insurance: string; puspakom: string; lastService: string; nextService: string; notes: string;
  history: FleetEvent[];
};
export type Result = { ok: boolean; text: string };

/** Only lorries in good order (or due a service soon) can be loaded. */
export const canLoad = (c: Condition) => c === "Good" || c === "Needs service";
export const conditionTone = (c: Condition): "green" | "amber" | "red" | "grey" => (c === "Good" ? "green" : c === "Needs service" ? "amber" : c === "In workshop" ? "red" : "grey");

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
/** A date that must not lapse: past it is "expired", within 30 days is "soon". */
export function due(date: string): "expired" | "soon" | "ok" | "none" {
  if (!date) return "none";
  const t = today();
  return date < t ? "expired" : date <= addDays(t, 30) ? "soon" : "ok";
}
export const DUE_FIELDS = [["roadTax", "Road tax"], ["insurance", "Insurance"], ["puspakom", "PUSPAKOM"], ["nextService", "Next service"]] as const;
/** What needs attention on one lorry, for the warnings. */
export const warnings = (l: Lorry) => DUE_FIELDS.map(([k, label]) => ({ label, date: l[k], state: due(l[k]) })).filter((w) => w.state === "expired" || w.state === "soon");

/** Plates are kept as "WXY 1234", so "wxy1234" and "WXY 1234" are not two lorries (the database does the same). */
export const cleanPlate = (s: string) => s.toUpperCase().replace(/\s+/g, "").replace(/^([A-Z]+)(\d+)([A-Z]*)$/, "$1 $2 $3").trim();
export const validPlate = (s: string) => /^[A-Z]{1,4} ?\d{1,4} ?[A-Z]{0,2}$/.test(cleanPlate(s));

// ---------- sample: made-up lorries, this browser only ----------
const t = today();
const SAMPLE: Lorry[] = [
  { no: "SMP 1001", size: "3 tonne", pallets: 6, cartons: 300, driver: "Sample Driver A", condition: "Good", roadTax: addDays(t, 140), insurance: addDays(t, 140), puspakom: addDays(t, 60), lastService: addDays(t, -40), nextService: addDays(t, 50), notes: "", history: [{ at: `${addDays(t, -40)} 09:00`, by: "Sample clerk", condition: "Good", note: "Serviced" }] },
  { no: "SMP 1002", size: "5 tonne", pallets: 10, cartons: 500, driver: "Sample Driver B", condition: "Needs service", roadTax: addDays(t, 20), insurance: addDays(t, 20), puspakom: addDays(t, 200), lastService: addDays(t, -170), nextService: addDays(t, 5), notes: "Brakes squeaking", history: [{ at: `${addDays(t, -2)} 17:30`, by: "Sample driver", condition: "Needs service", note: "Brakes squeaking" }] },
  { no: "SMP 1003", size: "1 tonne", pallets: 2, cartons: 120, driver: "Sample Driver C", condition: "In workshop", roadTax: addDays(t, 90), insurance: addDays(t, 90), puspakom: addDays(t, -3), lastService: addDays(t, -10), nextService: addDays(t, 170), notes: "Gearbox repair, back next week", history: [{ at: `${addDays(t, -1)} 08:15`, by: "Sample supervisor", condition: "In workshop", note: "Gearbox repair" }] },
  { no: "SMP 1004", size: "10 tonne", pallets: 18, cartons: 900, driver: "", condition: "Good", roadTax: addDays(t, 250), insurance: addDays(t, 250), puspakom: addDays(t, 120), lastService: addDays(t, -20), nextService: addDays(t, 70), notes: "Tail-lift", history: [] },
];
const KEY = "cssb.fleet.sample.v1";
let sample: Lorry[] = structuredClone(SAMPLE);
let loaded = false;
const subs = new Set<() => void>();
const ping = () => subs.forEach((f) => f());
function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (Array.isArray(s)) sample = s; } } catch { /* start from the sample */ }
}
function save(next: Lorry[]) { sample = next; try { localStorage.setItem(KEY, JSON.stringify(sample)); } catch { /* ignore */ } ping(); }
export function resetFleet() { save(structuredClone(SAMPLE)); }

const EMPTY: Lorry[] = [];
// ---------- live: the database ----------
type Row = { no: string; size: Size; pallets: number | null; cartons: number | null; driver: string; condition: Condition; road_tax: string | null; insurance: string | null; puspakom: string | null; last_service: string | null; next_service: string | null; notes: string; fleet_events: { at: string; by_name: string | null; condition: Condition; note: string | null }[] };
let live: Lorry[] = EMPTY;
let liveStarted = false;
const at = (iso: string) => stampOf(new Date(iso));
export async function reloadFleet() {
  const { data } = await supabase.from("fleet_lorries").select("no, size, pallets, cartons, driver, condition, road_tax, insurance, puspakom, last_service, next_service, notes, fleet_events(at, by_name, condition, note)").order("no");
  live = ((data ?? []) as Row[]).map((r) => ({
    no: r.no, size: r.size, pallets: r.pallets, cartons: r.cartons, driver: r.driver, condition: r.condition,
    roadTax: r.road_tax ?? "", insurance: r.insurance ?? "", puspakom: r.puspakom ?? "", lastService: r.last_service ?? "", nextService: r.next_service ?? "", notes: r.notes,
    history: [...(r.fleet_events ?? [])].sort((a, b) => b.at.localeCompare(a.at)).map((e) => ({ at: at(e.at), by: e.by_name ?? "", condition: e.condition, note: e.note ?? undefined })),
  }));
  ping();
}
const dbFail = (e: { message?: string } | null): Result => ({ ok: false, text: (e?.message ?? "Something went wrong. Try again.").replace(/^.*?ERROR:\s*/, "") });
const toRow = (l: Lorry) => ({ no: l.no, size: l.size, pallets: l.pallets ?? "", cartons: l.cartons ?? "", driver: l.driver, condition: l.condition, roadTax: l.roadTax, insurance: l.insurance, puspakom: l.puspakom, lastService: l.lastService, nextService: l.nextService, notes: l.notes });

/** The lorry list: made-up lorries on the preview page, the real ones in the app. */
export function useFleet(useSample: boolean): { lorries: Lorry[]; live: boolean } {
  const lorries = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb); }, () => {
    if (useSample) { load(); return sample; }
    if (!liveStarted && typeof window !== "undefined") { liveStarted = true; void reloadFleet(); }
    return live;
  }, () => EMPTY);
  return { lorries, live: !useSample };
}

/** Add a lorry, or save changes to one (matched by the plate it had). */
export async function saveLorry(useSample: boolean, was: string | null, l: Lorry, by: string): Promise<Result> {
  const no = cleanPlate(l.no);
  if (!validPlate(no)) return { ok: false, text: "Enter the plate like WXY 1234." };
  if (!useSample) {
    const { error } = await supabase.rpc("fleet_save", { p_was: was, p_row: toRow({ ...l, no }) });
    if (error) return dbFail(error);
    await reloadFleet(); return { ok: true, text: `${no} saved.` };
  }
  if (sample.some((x) => x.no === no && x.no !== was)) return { ok: false, text: `${no} is already on the list.` };
  for (const [k, label] of [["pallets", "Pallets"], ["cartons", "Cartons"]] as const) if (l[k] != null && !(Number(l[k]) >= 0)) return { ok: false, text: `${label} must be a number.` };
  const old = sample.find((x) => x.no === was);
  const history = old ? (old.condition !== l.condition ? [{ at: stamp(), by, condition: l.condition, note: l.notes || undefined }, ...old.history] : old.history) : [{ at: stamp(), by, condition: l.condition, note: "Added" }];
  const next = { ...l, no, history };
  save(old ? sample.map((x) => (x.no === was ? next : x)) : [...sample, next]);
  return { ok: true, text: `${no} saved.` };
}
/** Change a lorry's condition. Anything but Good needs a short reason, kept in its history. */
export async function setCondition(useSample: boolean, no: string, c: Condition, note: string, by: string): Promise<Result> {
  if (c !== "Good" && !note.trim()) return { ok: false, text: "Say what is wrong, so the next person knows." };
  if (!useSample) {
    const { error } = await supabase.rpc("fleet_condition", { p_no: no, p_condition: c, p_note: note });
    if (error) return dbFail(error);
    await reloadFleet(); return { ok: true, text: `${no} is now ${c.toLowerCase()}.` };
  }
  save(sample.map((x) => (x.no === no ? { ...x, condition: c, notes: c === "Good" ? x.notes : note.trim(), history: [{ at: stamp(), by, condition: c, note: note.trim() || undefined }, ...x.history] } : x)));
  return { ok: true, text: `${no} is now ${c.toLowerCase()}.` };
}
export async function removeLorry(useSample: boolean, no: string): Promise<Result> {
  if (!useSample) {
    const { error } = await supabase.rpc("fleet_remove", { p_no: no });
    if (error) return dbFail(error);
    await reloadFleet(); return { ok: true, text: `${no} removed from the list.` };
  }
  save(sample.filter((x) => x.no !== no));
  return { ok: true, text: `${no} removed from the list.` };
}
const stampOf = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(",", "");
const stamp = () => stampOf(new Date());

/** Read an Excel lorry list: one row per lorry, headings as in the template. Dates as YYYY-MM-DD or DD/MM/YYYY. */
export const IMPORT_HEADERS = ["Lorry No", "Size", "Pallets", "Cartons", "Usual driver", "Condition", "Road tax due", "Insurance due", "PUSPAKOM due", "Last service", "Next service", "Notes"];
export function rowsToLorries(sheet: unknown[][]): { lorries: Lorry[]; problems: string[] } {
  const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const hi = sheet.findIndex((r) => r.some((c) => norm(c) === "lorryno"));
  if (hi < 0) return { lorries: [], problems: ['The column "Lorry No" was not found. Use the template.'] };
  const h = sheet[hi].map(norm), col = (name: string) => h.indexOf(norm(name));
  const date = (v: unknown) => {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    const s = String(v ?? "").trim(); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : "";
  };
  const num = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const out: Lorry[] = [], problems: string[] = [];
  sheet.slice(hi + 1).forEach((r, i) => {
    const get = (name: string) => (col(name) >= 0 ? r[col(name)] : "");
    const no = cleanPlate(String(get("Lorry No") ?? ""));
    if (!no) return;
    const line = hi + i + 2;
    if (!validPlate(no)) problems.push(`Row ${line}: "${no}" does not look like a plate.`);
    const size = SIZES.find((s) => norm(s) === norm(get("Size"))) ?? (norm(get("Size")) ? "Other" : "3 tonne");
    const condition = CONDITIONS.find((c) => norm(c) === norm(get("Condition"))) ?? "Good";
    out.push({ no, size, pallets: num(get("Pallets")), cartons: num(get("Cartons")), driver: String(get("Usual driver") ?? "").trim(), condition,
      roadTax: date(get("Road tax due")), insurance: date(get("Insurance due")), puspakom: date(get("PUSPAKOM due")), lastService: date(get("Last service")), nextService: date(get("Next service")),
      notes: String(get("Notes") ?? "").trim(), history: [] });
  });
  const dup = out.map((l) => l.no).filter((x, i, a) => a.indexOf(x) !== i);
  if (dup.length) problems.push(`Lorry on the list twice: ${[...new Set(dup)].join(", ")}.`);
  return { lorries: out, problems };
}
/** Replace the list with an imported one (plates already on the list are updated, the rest added). */
export async function importLorries(useSample: boolean, rows: Lorry[], by: string): Promise<Result> {
  if (!useSample) {
    const { error } = await supabase.rpc("fleet_import", { p_rows: rows.map(toRow) });
    if (error) return dbFail(error);
    await reloadFleet(); return { ok: true, text: `${rows.length} lorries imported.` };
  }
  const byNo = new Map(sample.map((l) => [l.no, l]));
  for (const r of rows) { const old = byNo.get(r.no); byNo.set(r.no, { ...r, history: old ? (old.condition !== r.condition ? [{ at: stamp(), by, condition: r.condition, note: "From the import" }, ...old.history] : old.history) : [{ at: stamp(), by, condition: r.condition, note: "Imported" }] }); }
  save([...byNo.values()]);
  return { ok: true, text: `${rows.length} lorries imported.` };
}
