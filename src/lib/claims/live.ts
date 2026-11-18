// Expense claims from Supabase. Money rules are checked again on the server (the exp_* functions);
// these calls pass what the person asked for and return the server's answer.
import { supabase } from "@/lib/supabase";
import { DEFAULT_CLAIM_SETTINGS, type Bank, type Category, type Claim, type ClaimItem, type ClaimSettings, type Step } from "./rules";
import type { Employee } from "@/lib/hr/sample";
import type { ClaimData, ClaimNote, Result } from "./store";

const fail = (e: { message?: string } | null | undefined, fallback = "Something went wrong. Try again."): Result => ({ ok: false, text: (e?.message ?? fallback).replace(/^.*?ERROR:\s*/, "") });

async function all<T>(table: string, cols: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 50000; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

type ClaimRow = { id: string; no: string; emp_id: string; title: string; status: Claim["status"]; route: number[]; created_at: string; submitted_at: string | null; pay_ref: string | null; paid_at: string | null; pay_method: string | null };
type ItemRow = { id: string; claim_id: string; sort: number; date: string; cat: string; description: string; amount: number; tax: ClaimItem["tax"]; receipt_path: string | null; from_place: string | null; to_place: string | null; km: number | null };
type StepRow = { claim_id: string; on_date: string; by_emp: string | null; by_name: string | null; action: Step["action"]; level: number | null; note: string | null; id: number };

export async function loadClaims(): Promise<{ data: ClaimData; meId: string | null }> {
  const { data: meId } = await supabase.rpc("hr_link_me");
  const [emps, cats, set, banks, claims, items, steps, notes, roles] = await Promise.all([
    all<{ id: string; code: string; name: string; position: string; dept: string; gender: "F" | "M"; state: string; joined: string; manager_id: string | null; hr_role: Employee["role"]; email: string | null; phone: string | null; active: boolean }>(
      "hr_employees", "id, code, name, position, dept, gender, state, joined, manager_id, hr_role, email, phone, active", "code"),
    all<{ code: string; name: string; per_item_limit: number | null; monthly_budget: number | null; receipt_required: boolean; mileage: boolean; active: boolean; sort: number }>("expense_categories", "code, name, per_item_limit, monthly_budget, receipt_required, mileage, active, sort", "sort"),
    supabase.from("expense_settings").select("data").eq("id", 1).maybeSingle(),
    all<{ emp_id: string; bank: string; account_name: string; account_no: string }>("expense_banks", "emp_id, bank, account_name, account_no", "emp_id"),
    all<ClaimRow>("expense_claims", "id, no, emp_id, title, status, route, created_at, submitted_at, pay_ref, paid_at, pay_method", "created_at"),
    all<ItemRow>("expense_items", "id, claim_id, sort, date, cat, description, amount, tax, receipt_path, from_place, to_place, km", "sort"),
    all<StepRow>("expense_steps", "id, claim_id, on_date, by_emp, by_name, action, level, note", "id"),
    supabase.from("hr_notes").select("id, to_emp, text, href, sent_at, read").like("href", "/hr/claims%").order("sent_at", { ascending: false }).limit(50),
    supabase.rpc("exp_roles"),
  ]);
  const byClaim = <T extends { claim_id: string }>(rows: T[]) => { const m = new Map<string, T[]>(); for (const r of rows) (m.get(r.claim_id) ?? m.set(r.claim_id, []).get(r.claim_id)!).push(r); return m; };
  const it = byClaim(items), st = byClaim(steps);
  const s = (set.data?.data as Partial<ClaimSettings>) ?? {};
  const r = (roles.data ?? {}) as { finance?: string[]; directors?: string[] };
  const data: ClaimData = {
    staff: emps.map((e) => ({ id: e.id, code: e.code, name: e.name, position: e.position, dept: e.dept, gender: e.gender, state: e.state, joined: e.joined, managerId: e.manager_id, role: e.hr_role, email: e.email ?? "", phone: e.phone ?? "", active: e.active })),
    categories: cats.map((c): Category => ({ code: c.code, name: c.name, perItemLimit: c.per_item_limit == null ? null : Number(c.per_item_limit), monthlyBudget: c.monthly_budget == null ? null : Number(c.monthly_budget), receiptRequired: c.receipt_required, mileage: c.mileage, active: c.active })),
    settings: { ...DEFAULT_CLAIM_SETTINGS, ...s, levels: { ...DEFAULT_CLAIM_SETTINGS.levels, ...(s.levels ?? {}) } },
    banks: banks.map((b): Bank => ({ empId: b.emp_id, bank: b.bank, accountName: b.account_name, accountNo: b.account_no })),
    claims: claims.map((c): Claim => ({
      id: c.id, no: c.no, empId: c.emp_id, title: c.title, status: c.status, createdAt: c.created_at, submittedAt: c.submitted_at ?? undefined, route: (c.route ?? []) as (1 | 2 | 3)[],
      payment: c.pay_method || c.pay_ref ? { ref: c.pay_ref ?? "", paidAt: c.paid_at ?? undefined, method: "Bank transfer" } : undefined,
      items: (it.get(c.id) ?? []).map((i): ClaimItem => ({ id: i.id, date: i.date, cat: i.cat, desc: i.description, amount: Number(i.amount), tax: i.tax, receipt: i.receipt_path ?? undefined, from: i.from_place ?? undefined, to: i.to_place ?? undefined, km: i.km == null ? undefined : Number(i.km) })),
      steps: (st.get(c.id) ?? []).map((x): Step => ({ at: x.on_date, by: x.by_emp ?? "", byName: x.by_name ?? "", action: x.action, level: (x.level ?? undefined) as Step["level"], note: x.note ?? undefined })),
    })),
    notes: ((notes.data ?? []) as { id: number; to_emp: string; text: string; href: string | null; sent_at: string; read: boolean }[])
      .map((n): ClaimNote => ({ id: String(n.id), to: n.to_emp, text: n.text, at: n.sent_at.slice(0, 10), read: n.read, href: n.href ?? "/hr/claims" })),
    finance: r.finance ?? [], directors: r.directors ?? [],
  };
  return { data, meId: (meId as string | null) ?? null };
}

const safeName = (n: string) => n.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80);
/** Upload any receipt picked on the form, then save (or send) the claim. */
export async function liveSave(meId: string, c: Claim, send: boolean, existing: boolean): Promise<Result> {
  const uploaded: string[] = [];
  const items = [];
  for (const i of c.items) {
    let path = i.receipt && !i.file ? i.receipt : null;
    if (i.file) {
      path = `${meId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${safeName(i.file.name)}`;
      const up = await supabase.storage.from("expense-receipts").upload(path, i.file, { contentType: i.file.type || undefined });
      if (up.error) { if (uploaded.length) await supabase.storage.from("expense-receipts").remove(uploaded); return fail(up.error, "A receipt could not be uploaded."); }
      uploaded.push(path);
    }
    items.push({ date: i.date, cat: i.cat, description: i.desc, amount: i.amount, tax: i.tax, receipt_path: path, from_place: i.from ?? null, to_place: i.to ?? null, km: i.km ?? null });
  }
  const { data, error } = await supabase.rpc("exp_save", { p_id: existing ? c.id : null, p_title: c.title, p_items: items, p_send: send });
  if (error) { if (uploaded.length) await supabase.storage.from("expense-receipts").remove(uploaded); return fail(error); }
  return { ok: true, id: String(data), text: send ? "Claim sent for approval." : "Draft saved." };
}
export async function liveDelete(id: string): Promise<Result> { const { error } = await supabase.rpc("exp_delete_draft", { p_id: id }); return error ? fail(error) : { ok: true, text: "Draft deleted." }; }
export async function liveDecide(ids: string[], action: "Approved" | "Rejected", note: string): Promise<Result> {
  const { data, error } = await supabase.rpc("exp_decide", { p_ids: ids, p_action: action, p_note: note || null });
  if (error) return fail(error);
  const n = Number(data ?? 0);
  return { ok: true, text: `${n} ${n === 1 ? "claim" : "claims"} ${action.toLowerCase()}.` };
}
export async function liveProcess(ids: string[]): Promise<Result> {
  const { data, error } = await supabase.rpc("exp_process", { p_ids: ids });
  return error ? fail(error) : { ok: true, text: `${data} ${Number(data) === 1 ? "claim" : "claims"} marked as processing. Pay them, then mark them paid with the transfer reference.` };
}
export async function livePaid(ids: string[], ref: string, paidAt: string): Promise<Result> {
  const { data, error } = await supabase.rpc("exp_paid", { p_ids: ids, p_ref: ref, p_paid_at: paidAt });
  return error ? fail(error) : { ok: true, text: `${data} ${Number(data) === 1 ? "claim" : "claims"} marked paid, ref ${ref.trim()}. The employees are told.` };
}
export async function liveBank(b: Bank): Promise<Result> {
  const { error } = await supabase.from("expense_banks").upsert({ emp_id: b.empId, bank: b.bank, account_name: b.accountName.trim().toUpperCase(), account_no: b.accountNo.replace(/\D/g, ""), updated_at: new Date().toISOString() }, { onConflict: "emp_id" });
  return error ? fail(error, /check/i.test(error.message) ? "The account number should be 8 to 17 digits." : undefined) : { ok: true, text: "Bank details saved." };
}
export async function liveCategories(cats: Category[]): Promise<Result> {
  const rows = cats.map((c, i) => ({ code: c.code, name: c.name.trim(), per_item_limit: c.perItemLimit, monthly_budget: c.monthlyBudget, receipt_required: c.receiptRequired, mileage: c.mileage, active: c.active, sort: i + 1 }));
  const { error } = await supabase.from("expense_categories").upsert(rows, { onConflict: "code" });
  return error ? fail(error) : { ok: true, text: "Categories saved." };
}
export async function liveSettings(s: ClaimSettings): Promise<Result> {
  const { error } = await supabase.from("expense_settings").update({ data: s, updated_at: new Date().toISOString() }).eq("id", 1);
  return error ? fail(error) : { ok: true, text: "Settings saved. New claims use them; claims already sent keep their route." };
}
export async function liveRead(meId: string) { await supabase.from("hr_notes").update({ read: true }).eq("to_emp", meId).eq("read", false).like("href", "/hr/claims%"); }
export async function receiptLink(path: string): Promise<string | null> { const { data } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 120); return data?.signedUrl ?? null; }
export function watchClaims(meId: string | null, onChange: (note?: string) => void) {
  const ch = supabase.channel(`exp-${meId ?? "x"}-${Math.random().toString(36).slice(2, 7)}`);
  if (meId) ch.on("postgres_changes", { event: "INSERT", schema: "public", table: "hr_notes", filter: `to_emp=eq.${meId}` }, (p) => { const n = p.new as { text?: string; href?: string }; if (n.href?.startsWith("/hr/claims")) onChange(n.text); });
  ch.on("postgres_changes", { event: "*", schema: "public", table: "expense_claims" }, () => onChange());
  ch.subscribe();
  return () => { void supabase.removeChannel(ch); };
}
