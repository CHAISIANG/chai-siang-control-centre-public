"use client";
// One shared store for the expense claim screens, so a claim moves from screen to screen as it is approved and paid.
// Live mode (inside the app) reads and writes the database; sample mode (the preview page) keeps made-up data in this browser.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { claimMonth, r2, rm, total, type Bank, type Category, type Claim, type ClaimSettings, type ClaimStatus } from "./rules";
import { BANKS, CATEGORIES, CLAIMS, DIRECTORS, FINANCE, ME, SETTINGS, STAFF, TODAY, YEAR, type ClaimRole } from "./sample";
import type { Employee } from "@/lib/hr/sample";
import { useAuth } from "@/components/auth";
import * as L from "./live";

export type Result = { ok: true; text: string; id?: string } | { ok: false; text: string };
export type ClaimNote = { id: string; to: string; text: string; at: string; read: boolean; href: string };
export type ClaimData = { claims: Claim[]; categories: Category[]; settings: ClaimSettings; banks: Bank[]; notes: ClaimNote[]; finance: string[]; directors: string[]; staff: Employee[] };

const KEY = "cssb.claims.sample.v1";
const seed = (): ClaimData => ({ claims: structuredClone(CLAIMS), categories: structuredClone(CATEGORIES), settings: structuredClone(SETTINGS), banks: structuredClone(BANKS), notes: [], finance: [...FINANCE], directors: [...DIRECTORS], staff: STAFF });
const uid = () => Math.random().toString(36).slice(2, 10);

/** The steps a person's claim goes through, in order, given the settings. */
export function routeFor(d: ClaimData, empId: string): { level: 1 | 2 | 3; status: ClaimStatus }[] {
  const e = d.staff.find((x) => x.id === empId);
  const out: { level: 1 | 2 | 3; status: ClaimStatus }[] = [];
  if (d.settings.levels.manager && e?.managerId) out.push({ level: 1, status: "Pending manager" });
  if (d.settings.levels.finance) out.push({ level: 2, status: "Pending finance" });
  if (d.settings.levels.director) out.push({ level: 3, status: "Pending director" });
  return out;
}
/** Who may decide a claim now. Nobody decides their own: at Finance or Director, another person in that group does. */
export function approversNow(d: ClaimData, c: Claim): { level: 1 | 2 | 3; who: string[] } | null {
  const e = d.staff.find((x) => x.id === c.empId);
  if (c.status === "Pending manager") return { level: 1, who: e?.managerId && e.managerId !== c.empId ? [e.managerId] : [] };
  if (c.status === "Pending finance") return { level: 2, who: d.finance.filter((x) => x !== c.empId) };
  if (c.status === "Pending director") return { level: 3, who: d.directors.filter((x) => x !== c.empId) };
  return null;
}

/** What every claim screen gets. Actions answer with a short message to show. */
type Ctx = {
  data: ClaimData; role: ClaimRole; setRole: (r: ClaimRole) => void; meId: string; live: boolean; loading: boolean; linked: boolean;
  isFinance: boolean; isDirector: boolean; canReports: boolean; canAdmin: boolean; flash: string | null;
  canDecide: (c: Claim) => boolean;
  receiptLink: (path: string) => Promise<string | null>;
  saveClaim: (c: Claim, send: boolean) => Promise<Result>;
  deleteDraft: (id: string) => Promise<Result>;
  decide: (ids: string[], action: "Approved" | "Rejected", note: string) => Promise<Result>;
  markProcessing: (ids: string[]) => Promise<Result>;
  markPaid: (ids: string[], ref: string, paidAt: string) => Promise<Result>;
  saveBank: (b: Bank) => Promise<Result>;
  saveCategories: (cats: Category[]) => Promise<Result>;
  saveSettings: (s: ClaimSettings) => Promise<Result>;
  markRead: () => void;
  reset: () => void;
};
type SyncCtx = {
  data: ClaimData; role: ClaimRole; setRole: (r: ClaimRole) => void; meId: string; live: boolean;
  saveClaim: (c: Claim, send: boolean) => Result;
  deleteDraft: (id: string) => Result;
  decide: (ids: string[], action: "Approved" | "Rejected", note: string) => Result;
  markProcessing: (ids: string[]) => Result;
  markPaid: (ids: string[], ref: string, paidAt: string) => Result;
  saveBank: (b: Bank) => Result;
  saveCategories: (cats: Category[]) => Result;
  saveSettings: (s: ClaimSettings) => Result;
  markRead: () => void;
  reset: () => void;
};
const C = createContext<Ctx | null>(null);

export function ClaimsProvider({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return live ? <LiveClaims>{children}</LiveClaims> : <SampleClaims>{children}</SampleClaims>;
}

function SampleClaims({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ClaimData>(seed);
  const [role, setRole] = useState<ClaimRole>("employee");
  const [loaded, setLoaded] = useState(false);
  // read what was saved in this browser once, after the first render (a private window just starts from the sample)
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s?.data?.claims) { setData({ ...s.data, staff: STAFF }); setRole(s.role ?? "employee"); } } } catch { /* start from the sample */ }
    setLoaded(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { if (loaded) try { localStorage.setItem(KEY, JSON.stringify({ data: { ...data, staff: undefined }, role })); } catch { /* ignore */ } }, [data, role, loaded]);

  const meId = ME[role];
  const name = (id: string) => data.staff.find((e) => e.id === id)?.name ?? "Someone";
  const first = (id: string) => name(id).split(" ")[0];
  const update = useCallback((f: (d: ClaimData) => void) => setData((d) => { const x = structuredClone({ ...d, staff: undefined }) as unknown as ClaimData; x.staff = STAFF; f(x); return x; }), []);
  const notify = (d: ClaimData, to: string[], text: string, href: string) => { for (const t of to) d.notes.unshift({ id: uid(), to: t, text, at: TODAY, read: false, href }); };

  const ctx: SyncCtx = {
    data, role, setRole, meId, live: false,

    saveClaim: (c, send) => {
      if (c.empId !== meId) return { ok: false, text: "You can only send your own claims." };
      const was = data.claims.find((x) => x.id === c.id);
      if (was && was.status !== "Draft") return { ok: false, text: "This claim has been sent and can no longer be changed." };
      if (!c.title.trim()) return { ok: false, text: "Give the claim a title." };
      if (send) {
        if (!c.items.length) return { ok: false, text: "Add at least one item." };
        if (c.items.some((i) => !(i.amount > 0))) return { ok: false, text: "Every item needs an amount." };
      }
      const route = routeFor(data, c.empId);
      const first0 = route[0];
      const id = was ? c.id : uid();
      const no = was?.no || `EC-${YEAR}-${String(data.claims.length + 1).padStart(4, "0")}`;
      const status: ClaimStatus = !send ? "Draft" : first0 ? first0.status : "Approved";
      const saved: Claim = { ...c, id, no, title: c.title.trim(), status, items: c.items.map((i) => ({ ...i, amount: r2(i.amount) })), createdAt: was?.createdAt ?? TODAY,
        submittedAt: send ? TODAY : undefined, steps: send ? [{ at: TODAY, by: meId, byName: name(meId), action: "Submitted" }] : [] };
      update((d) => {
        const i = d.claims.findIndex((x) => x.id === id);
        if (i >= 0) d.claims[i] = saved; else d.claims.push(saved);
        if (send) { const next = approversNow(d, saved); notify(d, next?.who ?? d.finance, `${first(meId)} sent claim ${no}, ${rm(total(saved))}: ${saved.title}.`, "/hr/claims/approvals"); }
      });
      return { ok: true, id, text: send ? `Claim ${no} sent to ${first0 ? (first0.level === 1 ? first(data.staff.find((e) => e.id === meId)?.managerId ?? "") : first0.level === 2 ? "Finance" : "a Director") : "Finance for payment"}.` : "Draft saved." };
    },

    deleteDraft: (id) => {
      const c = data.claims.find((x) => x.id === id);
      if (!c || c.empId !== meId || c.status !== "Draft") return { ok: false, text: "Only your own drafts can be deleted." };
      update((d) => { d.claims = d.claims.filter((x) => x.id !== id); });
      return { ok: true, text: "Draft deleted." };
    },

    decide: (ids, action, note) => {
      if (action === "Rejected" && !note.trim()) return { ok: false, text: "Give a reason for rejecting." };
      const list = ids.map((id) => data.claims.find((c) => c.id === id)).filter((c): c is Claim => !!c);
      for (const c of list) {
        if (c.empId === meId) return { ok: false, text: "You cannot approve your own claim." };
        const now = approversNow(data, c);
        if (!now || !now.who.includes(meId)) return { ok: false, text: `Claim ${c.no} is not waiting for you.` };
      }
      update((d) => {
        for (const c0 of list) {
          const c = d.claims.find((x) => x.id === c0.id)!;
          const now = approversNow(d, c)!;
          c.steps.push({ at: TODAY, by: meId, byName: name(meId), action, level: now.level, note: note.trim() || undefined });
          if (action === "Rejected") {
            c.status = "Rejected";
            notify(d, [c.empId], `Your claim ${c.no} was rejected by ${first(meId)}: ${note.trim()}`, `/hr/claims/${c.id}`);
            continue;
          }
          const route = routeFor(d, c.empId);
          const next = route.find((r) => r.level > now.level);
          c.status = next ? next.status : "Approved";
          const who = approversNow(d, c)?.who ?? d.finance;
          notify(d, who, next ? `Claim ${c.no} from ${first(c.empId)} (${rm(total(c))}) is waiting for your approval.` : `Claim ${c.no} from ${first(c.empId)} is fully approved: ${rm(total(c))} to pay.`, next ? "/hr/claims/approvals" : "/hr/claims/payments");
          notify(d, [c.empId], next ? `Your claim ${c.no} was approved by ${first(meId)}; it is now with ${next.level === 2 ? "Finance" : "a Director"}.` : `Your claim ${c.no} is fully approved and will be paid soon.`, `/hr/claims/${c.id}`);
        }
      });
      return { ok: true, text: `${list.length} ${list.length === 1 ? "claim" : "claims"} ${action.toLowerCase()}.` };
    },

    markProcessing: (ids) => {
      if (!data.finance.includes(meId)) return { ok: false, text: "Only Finance can process payments." };
      const list = data.claims.filter((c) => ids.includes(c.id) && c.status === "Approved");
      update((d) => { for (const c0 of list) { const c = d.claims.find((x) => x.id === c0.id)!; c.status = "Processing"; c.payment = { method: "Bank transfer", ref: "" }; c.steps.push({ at: TODAY, by: meId, byName: name(meId), action: "Processing" }); } });
      return { ok: true, text: `${list.length} ${list.length === 1 ? "claim" : "claims"} marked as processing. Pay them, then mark them paid with the transfer reference.` };
    },

    markPaid: (ids, ref, paidAt) => {
      if (!data.finance.includes(meId)) return { ok: false, text: "Only Finance can mark claims paid." };
      if (!ref.trim()) return { ok: false, text: "Enter the transfer reference." };
      if (paidAt > TODAY) return { ok: false, text: "The payment date cannot be in the future." };
      const list = data.claims.filter((c) => ids.includes(c.id) && (c.status === "Approved" || c.status === "Processing"));
      const noBank = list.filter((c) => !data.banks.some((b) => b.empId === c.empId));
      if (noBank.length) return { ok: false, text: `No bank details for ${[...new Set(noBank.map((c) => name(c.empId)))].join(", ")}.` };
      update((d) => {
        for (const c0 of list) {
          const c = d.claims.find((x) => x.id === c0.id)!;
          c.status = "Paid"; c.payment = { method: "Bank transfer", ref: ref.trim(), paidAt };
          c.steps.push({ at: paidAt, by: meId, byName: name(meId), action: "Paid", note: `Ref ${ref.trim()}` });
          notify(d, [c.empId], `Your claim ${c.no} (${rm(total(c))}) was paid on ${paidAt}, ref ${ref.trim()}.`, `/hr/claims/${c.id}`);
        }
      });
      return { ok: true, text: `${list.length} ${list.length === 1 ? "claim" : "claims"} marked paid, ref ${ref.trim()}. The employees are told.` };
    },

    saveBank: (b) => {
      if (b.empId !== meId) return { ok: false, text: "You can only change your own bank details." };
      if (!b.bank) return { ok: false, text: "Choose your bank." };
      const digits = b.accountNo.replace(/\D/g, "");
      if (digits.length < 8 || digits.length > 17) return { ok: false, text: "The account number should be 8 to 17 digits." };
      if (!b.accountName.trim()) return { ok: false, text: "Enter the name on the account." };
      update((d) => { d.banks = [...d.banks.filter((x) => x.empId !== b.empId), { ...b, accountName: b.accountName.trim().toUpperCase(), accountNo: digits }]; });
      return { ok: true, text: "Bank details saved." };
    },

    saveCategories: (cats) => {
      if (cats.some((c) => !c.name.trim())) return { ok: false, text: "Every category needs a name." };
      const names = cats.map((c) => c.name.trim().toLowerCase());
      if (names.some((n, i) => names.indexOf(n) !== i)) return { ok: false, text: "Two categories have the same name." };
      if (cats.some((c) => (c.perItemLimit ?? 0) < 0 || (c.monthlyBudget ?? 0) < 0)) return { ok: false, text: "Limits and budgets cannot be negative." };
      update((d) => { d.categories = cats.map((c) => ({ ...c, name: c.name.trim() })); });
      return { ok: true, text: "Categories saved." };
    },
    saveSettings: (s) => {
      if (!(s.monthlyLimit > 0) || !(s.mileageRate > 0)) return { ok: false, text: "The monthly limit and mileage rate must be above zero." };
      if (!s.levels.finance && !s.levels.director) return { ok: false, text: "Keep at least Finance or Director approval on." };
      update((d) => { d.settings = s; });
      return { ok: true, text: "Settings saved. New claims use them; claims already sent keep their route." };
    },
    markRead: () => update((d) => { d.notes.forEach((n) => { if (n.to === meId) n.read = true; }); }),
    reset: () => { setData(seed()); setRole("employee"); },
  };
  const value: Ctx = useMemo(() => ({
    ...ctx, loading: false, linked: true, flash: null,
    isFinance: data.finance.includes(meId), isDirector: data.directors.includes(meId),
    canReports: role === "finance" || role === "director", canAdmin: role === "finance" || role === "director",
    canDecide: (c) => c.empId !== meId && !!approversNow(data, c)?.who.includes(meId),
    receiptLink: async () => null,
    saveClaim: async (c, send) => ctx.saveClaim(c, send),
    deleteDraft: async (id) => ctx.deleteDraft(id),
    decide: async (ids, a, n) => ctx.decide(ids, a, n),
    markProcessing: async (ids) => ctx.markProcessing(ids),
    markPaid: async (ids, r, d) => ctx.markPaid(ids, r, d),
    saveBank: async (b) => ctx.saveBank(b),
    saveCategories: async (x) => ctx.saveCategories(x),
    saveSettings: async (x) => ctx.saveSettings(x),
  }), [data, role]); // eslint-disable-line react-hooks/exhaustive-deps
  return <C.Provider value={value}>{children}</C.Provider>;
}

// ---------- live: the database ----------
const EMPTY: ClaimData = { claims: [], categories: [], settings: structuredClone(SETTINGS), banks: [], notes: [], finance: [], directors: [], staff: [] };

function LiveClaims({ children }: { children: ReactNode }) {
  const { realCan, session } = useAuth();
  const [data, setData] = useState<ClaimData>(EMPTY);
  const [meId, setMeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [flash, setFlash] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try { const r = await L.loadClaims(); setData(r.data); setMeId(r.meId); } catch { /* keep what is shown */ }
    setLoading(false);
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async load, state is set after the await
  useEffect(() => { if (session) void reload(); }, [session, reload]);
  useEffect(() => {
    if (!session || loading) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const stop = L.watchClaims(meId, (text) => { if (text) setFlash(text); clearTimeout(t); t = setTimeout(() => void reload(), 400); });
    return () => { clearTimeout(t); stop(); };
  }, [session, meId, loading, reload]);
  useEffect(() => { if (flash) { const t = setTimeout(() => setFlash(null), 6000); return () => clearTimeout(t); } }, [flash]);

  const me = meId ?? "";
  const isFinance = realCan("exp_finance"), isDirector = realCan("exp_director");
  const role: ClaimRole = isDirector ? "director" : isFinance ? "finance" : realCan("hr_approve") || data.staff.some((e) => e.managerId === me && e.active) ? "manager" : "employee";
  const after = async (r: Result) => { if (r.ok) await reload(); return r; };
  const need = (): Result | null => (meId ? null : { ok: false, text: "Your login is not linked to an employee record yet. Ask HR to add you with the same email you sign in with." });
  const value: Ctx = {
    data, role, setRole: () => {}, meId: me, live: true, loading, linked: !!meId, flash,
    isFinance, isDirector, canReports: realCan("exp_reports"), canAdmin: realCan("exp_admin"),
    canDecide: (c) => c.empId !== me && (c.status === "Pending manager" ? !!me && data.staff.find((e) => e.id === c.empId)?.managerId === me : c.status === "Pending finance" ? isFinance : c.status === "Pending director" ? isDirector : false),
    receiptLink: (path) => L.receiptLink(path),
    saveClaim: async (c, send) => need() ?? after(await L.liveSave(me, c, send, data.claims.some((x) => x.id === c.id))),
    deleteDraft: async (id) => after(await L.liveDelete(id)),
    decide: async (ids, a, n) => after(await L.liveDecide(ids, a, n)),
    markProcessing: async (ids) => after(await L.liveProcess(ids)),
    markPaid: async (ids, r, d) => after(await L.livePaid(ids, r, d)),
    saveBank: async (b) => need() ?? after(await L.liveBank({ ...b, empId: me })),
    saveCategories: async (x) => after(await L.liveCategories(x)),
    saveSettings: async (x) => after(await L.liveSettings(x)),
    markRead: () => { if (meId) void L.liveRead(meId).then(reload); },
    reset: () => {},
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}
export function useClaims() {
  const c = useContext(C);
  if (!c) throw new Error("useClaims outside ClaimsProvider");
  return c;
}

/** What a person has claimed in a month, counting sent claims (not drafts or rejected). */
export function monthClaimedIn(d: ClaimData, empId: string, month: string, exceptId?: string) {
  return r2(d.claims.filter((c) => c.empId === empId && c.id !== exceptId && !["Draft", "Rejected"].includes(c.status) && claimMonth(c) === month).reduce((s, c) => s + total(c), 0));
}
