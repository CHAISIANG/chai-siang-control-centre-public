"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Card, Kpi, KpiStrip, PageHeader, Td, Th } from "@/components/ui";
import { OverdueVsOwed } from "@/components/charts";
import { useRole } from "@/components/role";
import { useData } from "@/components/data";
import { supabase } from "@/lib/supabase";
import { CreditReminders } from "@/components/credit/CreditReminders";

// Collection follow-up: the salesman records what happened with each overdue invoice, and everyone with access can see it.
// Statuses live apart from the aging report, so a new aging upload never wipes them. A paid invoice drops off the next report.

type St = "No contact yet" | "Contacted" | "Promised to pay" | "Payment on the way" | "Dispute" | "Partly paid";
const STATUSES: St[] = ["No contact yet", "Contacted", "Promised to pay", "Payment on the way", "Dispute", "Partly paid"];
const tone: Record<St, "grey" | "blue" | "amber" | "green" | "red"> = {
  "No contact yet": "grey", Contacted: "blue", "Promised to pay": "amber", "Payment on the way": "green", Dispute: "red", "Partly paid": "blue",
};
// The customer's headline status is the one that needs the most attention.
const ORDER: St[] = ["Dispute", "No contact yet", "Promised to pay", "Contacted", "Partly paid", "Payment on the way"];

type Inv = { doc_no: string; doc_date: string | null; cust_code: string; customer: string; due_date: string | null; agent: string | null; outstanding: number | string; as_at: string };
type Saved = { doc_no: string; status: St; promise_date: string | null; remark: string | null; updated_by_name: string | null; updated_at: string };
type Ev = { at: string; doc_no: string; status: string; promise_date: string | null; remark: string | null; actor_name: string | null };
type Draft = { status: St; promise: string; remark: string };
type Row = { inv: Inv; age: number; amount: number; saved?: Saved };

const money = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyK = (n: number) => `RM ${Math.round(n).toLocaleString("en-MY")}`;
const dayDiff = (a: string, b: string) => Math.round((Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000);
const shortDate = (iso: string | null) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "");
const todayMYT = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
const agentCode = (a: string | null) => (a && /^\d{1,2}$/.test(a) ? `MY01S${a.padStart(5, "0")}` : "");
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

async function pageAll<T>(table: string, cols: string, order: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 30000; from += 1000) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + 999);
    if (error || !data) break;
    out.push(...(data as unknown as T[]));
    if (data.length < 1000) break;
  }
  return out;
}

export default function FollowUp() {
  const { can } = useRole();
  const { salesmen } = useData();
  const canEdit = can("collections_update");
  const [invs, setInvs] = useState<Inv[]>([]);
  const [saved, setSaved] = useState<Saved[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<St | "All">("All");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [bulk, setBulk] = useState<Draft>({ status: "Contacted", promise: "", remark: "" });
  const [events, setEvents] = useState<Ev[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const today = todayMYT();

  const load = useCallback(async () => {
    const [i, s] = await Promise.all([
      pageAll<Inv>("ar_invoices", "doc_no, doc_date, cust_code, customer, due_date, agent, outstanding, as_at", "doc_no"),
      pageAll<Saved>("collection_status", "doc_no, status, promise_date, remark, updated_by_name, updated_at", "doc_no"),
    ]);
    setInvs(i); setSaved(s); setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const savedBy = useMemo(() => new Map(saved.map((s) => [s.doc_no, s])), [saved]);
  const asAt = invs[0]?.as_at ?? "";
  const nameOf = useMemo(() => new Map(salesmen.map((s) => [s.code, s.name])), [salesmen]);

  // One entry per customer that has at least one overdue invoice.
  const custs = useMemo(() => {
    const m = new Map<string, { code: string; name: string; agent: string | null; rows: Row[] }>();
    for (const inv of invs) {
      const age = inv.due_date && inv.as_at ? dayDiff(inv.as_at, inv.due_date) : 0;
      const c = m.get(inv.cust_code) ?? { code: inv.cust_code, name: inv.customer, agent: inv.agent, rows: [] };
      c.rows.push({ inv, age, amount: Number(inv.outstanding), saved: savedBy.get(inv.doc_no) });
      m.set(inv.cust_code, c);
    }
    return [...m.values()].filter((c) => c.rows.some((r) => r.age > 0)).map((c) => ({ ...c, rows: c.rows.sort((a, b) => b.age - a.age) }));
  }, [invs, savedBy]);

  const overdueRows = (c: { rows: Row[] }) => c.rows.filter((r) => r.age > 0);
  const stOf = (r: Row): St => r.saved?.status ?? "No contact yet";
  const headline = (c: { rows: Row[] }): St => ORDER.find((s) => overdueRows(c).some((r) => stOf(r) === s)) ?? "No contact yet";
  const owed = (c: { rows: Row[] }) => overdueRows(c).reduce((s, r) => s + r.amount, 0);
  const missed = (r: Row) => !!r.saved && (r.saved.status === "Promised to pay" || r.saved.status === "Payment on the way") && !!r.saved.promise_date && r.saved.promise_date < today;
  const nextPromise = (c: { rows: Row[] }) => overdueRows(c).map((r) => r.saved).filter((s): s is Saved => !!s && !!s.promise_date && (s.status === "Promised to pay" || s.status === "Payment on the way")).map((s) => s.promise_date!).sort()[0] ?? "";

  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return custs
      .filter((c) => (filter === "All" || headline(c) === filter) && (!k || c.name.toLowerCase().includes(k) || c.code.toLowerCase().includes(k)))
      .sort((a, b) => owed(b) - owed(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custs, filter, q]);

  // Total owed counts every open invoice (late or not); overdue counts only those past their due date.
  const allOwed = invs.reduce((s, i) => s + Number(i.outstanding), 0);
  const allOverdue = invs.reduce((s, i) => s + (i.due_date && i.as_at && dayDiff(i.as_at, i.due_date) > 0 ? Number(i.outstanding) : 0), 0);
  const overduePct = allOwed ? Math.round((allOverdue / allOwed) * 100) : 0;
  const bySalesman = useMemo(() => {
    const m = new Map<string, { name: string; owed: number; overdue: number }>();
    for (const i of invs) {
      const code = agentCode(i.agent);
      const e = m.get(code) ?? { name: nameOf.get(code) ?? (code || "No salesman"), owed: 0, overdue: 0 };
      e.owed += Number(i.outstanding);
      if (i.due_date && i.as_at && dayDiff(i.as_at, i.due_date) > 0) e.overdue += Number(i.outstanding);
      m.set(code, e);
    }
    return [...m.values()];
  }, [invs, nameOf]);
  const noContact = custs.filter((c) => headline(c) === "No contact yet");
  const promised = custs.filter((c) => overdueRows(c).some((r) => stOf(r) === "Promised to pay"));
  const missedCount = custs.filter((c) => overdueRows(c).some(missed)).length;
  const disputes = custs.filter((c) => overdueRows(c).some((r) => stOf(r) === "Dispute"));
  const cur = custs.find((c) => c.code === open) ?? null;

  const draftOf = (r: Row): Draft => drafts[r.inv.doc_no] ?? { status: stOf(r), promise: r.saved?.promise_date ?? "", remark: r.saved?.remark ?? "" };
  const dirty = (r: Row) => { const d = draftOf(r); return d.status !== stOf(r) || d.promise !== (r.saved?.promise_date ?? "") || d.remark !== (r.saved?.remark ?? ""); };
  const needsDate = (s: St) => s === "Promised to pay" || s === "Payment on the way";

  async function openCustomer(code: string) {
    setOpen(code); setMsg(null); setDrafts({}); setEvents([]);
    const { data } = await supabase.from("collection_events").select("at, doc_no, status, promise_date, remark, actor_name").eq("cust_code", code).order("at", { ascending: false }).limit(30);
    setEvents((data ?? []) as Ev[]);
  }

  async function save(docs: string[], d: Draft) {
    if (!cur) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc("collection_set", { p_docs: docs, p_status: d.status, p_promise: d.promise || null, p_remark: d.remark || null });
    if (error) { setMsg({ ok: false, text: error.message }); setBusy(false); return; }
    setMsg({ ok: true, text: docs.length > 1 ? `Saved for ${docs.length} invoices.` : `${docs[0]} saved.` });
    setDrafts((p) => { const n = { ...p }; for (const x of docs) delete n[x]; return n; });
    await load();
    const { data } = await supabase.from("collection_events").select("at, doc_no, status, promise_date, remark, actor_name").eq("cust_code", cur.code).order("at", { ascending: false }).limit(30);
    setEvents((data ?? []) as Ev[]);
    setBusy(false);
  }

  const field = "rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm disabled:bg-slate-50";
  const asAtText = asAt ? new Date(asAt + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

  return (
    <>
      <PageHeader title="Collection follow-up" sub={`Record what happened with each overdue invoice. Based on the aging report${asAtText ? ` as at ${asAtText}` : ""}. A paid invoice leaves this list when the next aging report is uploaded.`} />
      <CreditReminders />

      <KpiStrip>
        <Kpi label="Total overdue" value={loading ? "…" : moneyK(allOverdue)} sub={`${overduePct}% of the ${moneyK(allOwed)} owed · ${custs.length} customers`} tone={overduePct >= 60 ? "bad" : overduePct >= 40 ? "warn" : "good"} pct={overduePct} />
        <Kpi label="Not contacted yet" value={loading ? "…" : `${noContact.length}`} sub="Start here" tone={noContact.length ? "bad" : "good"} />
        <Kpi label="Promised to pay" value={loading ? "…" : `${promised.length}`} sub={missedCount ? `${missedCount} missed their date` : "Check on the promised date"} tone={missedCount ? "bad" : "warn"} />
        <Kpi label="In dispute" value={loading ? "…" : `${disputes.length}`} sub="Needs the supervisor" tone={disputes.length ? "bad" : "good"} />
      </KpiStrip>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {(["All", ...STATUSES] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${filter === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>
            {s} {s !== "All" && <span className="opacity-60">({custs.filter((c) => headline(c) === s).length})</span>}
          </button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search customer name or code" className="ml-auto w-full max-w-xs rounded-md border border-slate-300 px-3 py-1.5 text-sm" />
      </div>

      {bySalesman.length > 1 && <Card title="Overdue versus total owed, by salesman" className="mt-4"><OverdueVsOwed data={bySalesman} /></Card>}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <Card title={`Customers with overdue invoices (${list.length})`}>
          <div className="-mx-4 overflow-x-auto sm:-mx-5">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Customer</Th><Th right>Overdue</Th><Th>Status</Th><Th>Promise</Th></tr></thead>
              <tbody>
                {list.slice(0, 100).map((c) => {
                  const p = nextPromise(c);
                  return (
                    <tr key={c.code} onClick={() => void openCustomer(c.code)} className={`cursor-pointer border-b border-slate-100 last:border-0 ${open === c.code ? "bg-indigo-50/60" : ""}`}>
                      <Td first><b className="font-medium text-slate-900">{c.name}</b><div className="text-xs text-slate-500">{c.code}{nameOf.get(agentCode(c.agent)) ? `, ${nameOf.get(agentCode(c.agent))}` : ""}</div></Td>
                      <Td right>{money(owed(c))}</Td>
                      <Td><Badge tone={tone[headline(c)]}>{headline(c)}</Badge></Td>
                      <Td>{p ? <span className={p < today ? "font-medium text-rose-700" : ""}>{shortDate(p)}{p < today ? " (missed)" : ""}</span> : <span className="text-slate-400">–</span>}</Td>
                    </tr>
                  );
                })}
                {!list.length && <tr><Td>{loading ? "Loading…" : "No customers in this group."}</Td></tr>}
              </tbody>
            </table>
          </div>
          {list.length > 100 && <p className="mt-3 text-sm text-slate-500">Showing the 100 largest. Use the search box to find another customer.</p>}
        </Card>

        <Card title={cur ? cur.name : "Customer details"}>
          {!cur && <p className="text-slate-500">Choose a customer on the left.</p>}
          {cur && (
            <div className="space-y-4">
              <div className="text-sm text-slate-500">{cur.code}{nameOf.get(agentCode(cur.agent)) ? ` · ${nameOf.get(agentCode(cur.agent))}` : ""} · overdue <b className="text-slate-900">{money(owed(cur))}</b> across {overdueRows(cur).length} invoice{overdueRows(cur).length === 1 ? "" : "s"}</div>
              {msg && <p role={msg.ok ? "status" : "alert"} className={`rounded px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}

              <div className="space-y-2">
                {overdueRows(cur).map((r) => {
                  const d = draftOf(r);
                  return (
                    <div key={r.inv.doc_no} className="rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div><b className="text-slate-900">{r.inv.doc_no}</b> <span className="text-sm text-slate-500">due {shortDate(r.inv.due_date)}</span></div>
                        <div className="text-right text-sm"><b className="tabular-nums text-slate-900">{money(r.amount)}</b> <Badge tone={r.age > 60 ? "red" : "amber"}>{r.age} days late</Badge></div>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <select aria-label={`Status of ${r.inv.doc_no}`} disabled={!canEdit} value={d.status} onChange={(e) => setDrafts({ ...drafts, [r.inv.doc_no]: { ...d, status: e.target.value as St } })} className={field}>
                          {STATUSES.map((s) => <option key={s}>{s}</option>)}
                        </select>
                        {needsDate(d.status) && <input aria-label={`Promised date for ${r.inv.doc_no}`} type="date" disabled={!canEdit} value={d.promise} onChange={(e) => setDrafts({ ...drafts, [r.inv.doc_no]: { ...d, promise: e.target.value } })} className={`${field} sm:w-40`} />}
                      </div>
                      <input aria-label={`Remark for ${r.inv.doc_no}`} disabled={!canEdit} value={d.remark} onChange={(e) => setDrafts({ ...drafts, [r.inv.doc_no]: { ...d, remark: e.target.value } })} placeholder="Remark (who you spoke to, what they said)" className={`${field} mt-2 w-full`} />
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {canEdit && dirty(r) && <button disabled={busy || (d.status === "Promised to pay" && !d.promise)} onClick={() => void save([r.inv.doc_no], d)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{busy ? "Saving…" : "Save"}</button>}
                        {r.saved && <span className="text-xs text-slate-500">Last update: {r.saved.updated_by_name || "someone"}, {when(r.saved.updated_at)}</span>}
                        {missed(r) && <Badge tone="red">Promised date has passed</Badge>}
                      </div>
                    </div>
                  );
                })}
                {cur.rows.length > overdueRows(cur).length && <p className="text-xs text-slate-500">{cur.rows.length - overdueRows(cur).length} more invoice{cur.rows.length - overdueRows(cur).length === 1 ? "" : "s"} of this customer are not due yet.</p>}
              </div>

              {canEdit && overdueRows(cur).length > 1 && (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                  <div className="mb-2 text-sm font-semibold text-slate-700">Same status for all {overdueRows(cur).length} overdue invoices</div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <select value={bulk.status} onChange={(e) => setBulk({ ...bulk, status: e.target.value as St })} className={field}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                    {needsDate(bulk.status) && <input type="date" value={bulk.promise} onChange={(e) => setBulk({ ...bulk, promise: e.target.value })} className={`${field} sm:w-40`} aria-label="Promised date" />}
                  </div>
                  <input value={bulk.remark} onChange={(e) => setBulk({ ...bulk, remark: e.target.value })} placeholder="Remark" className={`${field} mt-2 w-full`} />
                  <button disabled={busy || (bulk.status === "Promised to pay" && !bulk.promise)} onClick={() => void save(overdueRows(cur).map((r) => r.inv.doc_no), bulk)} className="mt-2 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">Apply to all invoices</button>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-slate-700">History</h3>
                {events.length ? (
                  <ol className="space-y-2 border-l border-slate-200 pl-3">
                    {events.map((h, k) => (
                      <li key={k} className="text-sm">
                        <div className="text-slate-800">{h.doc_no}: {h.status}{h.promise_date ? `, promised ${shortDate(h.promise_date)}` : ""}</div>
                        {h.remark && <div className="text-xs text-slate-600">&ldquo;{h.remark}&rdquo;</div>}
                        <div className="text-xs text-slate-500">{h.actor_name || "Someone"}, {when(h.at)}</div>
                      </li>
                    ))}
                  </ol>
                ) : <p className="text-sm text-slate-500">No updates yet.</p>}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
