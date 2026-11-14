// Purchase order tracking: shapes and the matching / service-level rules.
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export type Outcome = "delivered" | "short" | "dropped" | "cancelled" | "substituted";
export const OUTCOMES: { key: Outcome; label: string; counts: string }[] = [
  { key: "delivered", label: "Delivered in full", counts: "" },
  { key: "short", label: "Short delivered", counts: "Counts against us" },
  { key: "dropped", label: "Dropped by us (stock or space)", counts: "Counts against us" },
  { key: "cancelled", label: "Cancelled by customer", counts: "Not counted. Comes off the invoice." },
  { key: "substituted", label: "Substituted with another item", counts: "Counts against us unless agreed" },
];

export type PoLine = { sku: string; custCode?: string; desc: string; poQty: number; poPrice: number; invQty?: number; invPrice?: number; delQty?: number; outcome: Outcome; reason?: string };
export type Po = {
  id: string; poNo: string; clientId: string; customer: string; poDate: string; winFrom: string; reqDate: string;
  soNo?: string; salesman: string; salesCode?: string; checkedBy?: string;
  invoiceId?: string; invoiceNo?: string; invoiceDate?: string; invoiceScanPath?: string;
  deliveredDate?: string; driver?: string; route?: string; proofPath?: string; copyPath?: string; creditRaisedAt?: string;
  lines: PoLine[]; note?: string; reasons: Record<string, string>;
};

export type Stage = "received" | "keyed" | "invoiced" | "delivered" | "closed";
export const STAGES: { key: Stage; label: string }[] = [
  { key: "received", label: "PO received" }, { key: "keyed", label: "Order keyed" }, { key: "invoiced", label: "Invoiced" }, { key: "delivered", label: "Delivered" }, { key: "closed", label: "Closed" },
];

export const sum = (p: Po, f: (l: PoLine) => number) => p.lines.reduce((s, l) => s + f(l), 0);
export const poTotal = (p: Po) => sum(p, (l) => l.poQty * l.poPrice);
export const invTotal = (p: Po) => sum(p, (l) => (l.invQty ?? 0) * (l.invPrice ?? 0));
export function daysBetween(a: string, b: string) { return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000); }

/** Value still invoiced for goods that were cancelled, dropped or short. */
export const creditFor = (l: PoLine) => ((l.outcome === "cancelled" ? (l.invQty ?? 0) : Math.max(0, (l.invQty ?? 0) - (l.delQty ?? 0))) * (l.invPrice ?? l.poPrice));
export const creditDue = (p: Po) => (p.deliveredDate && p.invoiceNo ? p.lines.reduce((s, l) => s + creditFor(l), 0) : 0);

/** A PO exists once the order is keyed, so "received" only shows before that. */
export function stageOf(p: Po): Stage {
  if (p.deliveredDate) return p.proofPath && !openIssues(p).length ? "closed" : "delivered";
  if (p.invoiceNo) return "invoiced";
  return "keyed";
}

export type Issue = { kind: "late" | "short" | "dropped" | "substituted" | "price" | "qty" | "proof" | "overdue" | "credit" | "copy" | "early"; key: string; text: string; reason?: string };
/** Every problem found, each with the reason staff gave (if any). */
export function issues(p: Po): Issue[] {
  return rawIssues(p).map((i) => ({ ...i, reason: p.reasons[i.key] ?? i.reason }));
}
/** Problems still waiting for a reason or an action. */
export const openIssues = (p: Po) => issues(p).filter((i) => !i.reason);
function rawIssues(p: Po): Issue[] {
  const out: Issue[] = [];
  const hasInv = !!p.invoiceNo, done = !!p.deliveredDate;
  if (!p.copyPath) out.push({ kind: "copy", key: "copy", text: "Customer's PO copy not attached" });
  for (const l of p.lines) {
    if (hasInv && l.invPrice !== undefined && l.invPrice !== l.poPrice) out.push({ kind: "price", key: `price:${l.sku}`, text: `${l.sku}: invoice RM ${l.invPrice.toFixed(2)} vs PO RM ${l.poPrice.toFixed(2)}` });
    if (hasInv && l.invQty !== undefined && l.invQty !== l.poQty && !(done && l.invQty <= (l.delQty ?? 0))) out.push({ kind: "qty", key: `qty:${l.sku}`, text: `${l.sku}: invoiced ${l.invQty} vs PO ${l.poQty}` });
    if (done && l.outcome === "short") out.push({ kind: "short", key: `short:${l.sku}`, text: `${l.sku}: delivered ${l.delQty ?? 0} of ${l.poQty}`, reason: l.reason });
    if (done && l.outcome === "dropped") out.push({ kind: "dropped", key: `dropped:${l.sku}`, text: `${l.sku}: dropped by us (${l.poQty} not delivered)`, reason: l.reason });
    if (done && l.outcome === "substituted") out.push({ kind: "substituted", key: `substituted:${l.sku}`, text: `${l.sku}: substituted with another item`, reason: l.reason });
    if (done && hasInv && creditFor(l) > 0) out.push({ kind: "credit", key: `credit:${l.sku}`, text: `${l.sku}: still invoiced, credit note needed (RM ${creditFor(l).toFixed(2)})` });
  }
  if (done && p.deliveredDate! < p.winFrom) out.push({ kind: "early", key: "early", text: `Delivered ${daysBetween(p.deliveredDate!, p.winFrom)} day(s) before the window opened` });
  if (done && p.deliveredDate! > p.reqDate) out.push({ kind: "late", key: "late", text: `Delivered ${daysBetween(p.reqDate, p.deliveredDate!)} day(s) late` });
  if (!done && hasInv && today() > p.reqDate) out.push({ kind: "overdue", key: "overdue", text: `Not delivered, ${daysBetween(p.reqDate, today())} day(s) past the requested date` });
  if (done && !p.proofPath) out.push({ kind: "proof", key: "proof", text: "Signed delivery proof not uploaded" });
  return out;
}

/** Cancelled items are left out of "in full" because that is not our failure. */
export function scoreOf(p: Po) {
  if (!p.deliveredDate) return null;
  const counted = p.lines.filter((l) => l.outcome !== "cancelled");
  const ordered = counted.reduce((s, l) => s + l.poQty, 0), got = counted.reduce((s, l) => s + (l.delQty ?? 0), 0);
  const onTime = p.deliveredDate >= p.winFrom && p.deliveredDate <= p.reqDate;
  const inFull = counted.every((l) => l.outcome === "delivered" && (l.delQty ?? 0) >= l.poQty);
  const accurate = counted.every((l) => l.invPrice === l.poPrice && (l.invQty === l.poQty || l.invQty === l.delQty));
  return { onTime, inFull, accurate, fillPct: ordered ? (got / ordered) * 100 : 100, perfect: onTime && inFull && accurate };
}

export function summary(list: Po[]) {
  const done = list.map((p) => ({ p, s: scoreOf(p) })).filter((x) => x.s) as { p: Po; s: NonNullable<ReturnType<typeof scoreOf>> }[];
  const pct = (n: number) => (done.length ? (n / done.length) * 100 : 0);
  return {
    delivered: done.length,
    onTime: pct(done.filter((x) => x.s.onTime).length),
    inFull: pct(done.filter((x) => x.s.inFull).length),
    accurate: pct(done.filter((x) => x.s.accurate).length),
    perfect: pct(done.filter((x) => x.s.perfect).length),
  };
}

export type Match = { icon: "ok" | "bad" | "warn" | "wait"; text: string };
/** Plain-language result for one line, used by the salesman's check view and the printed sheet. */
export function lineMatch(p: Po, l: PoLine): Match[] {
  if (!p.invoiceNo) return [{ icon: "wait", text: "Waiting for invoice" }];
  if (!p.deliveredDate) return [{ icon: "wait", text: "Waiting for delivery" }];
  const m: Match[] = [];
  const inv = l.invQty ?? 0, got = l.delQty ?? 0;
  if (l.outcome === "cancelled") {
    m.push({ icon: "warn", text: "Cancelled by customer" });
    if (inv > 0) m.push({ icon: "bad", text: `Still invoiced ${inv}: needs a credit note` });
    return m;
  }
  if (l.outcome === "dropped" || l.outcome === "short" || got < l.poQty) {
    const label = l.outcome === "dropped" ? "Dropped by us" : `Short by ${l.poQty - got}`;
    m.push(inv > got ? { icon: "bad", text: `${label}, invoiced ${inv}: needs a credit note` } : { icon: "warn", text: `${label}, invoice corrected` });
  }
  if (l.outcome === "substituted") m.push({ icon: "bad", text: "Substituted: confirm the customer agreed" });
  if (l.invPrice !== undefined && l.invPrice !== l.poPrice) m.push({ icon: "bad", text: `Invoice price RM ${l.invPrice.toFixed(2)} vs PO RM ${l.poPrice.toFixed(2)}` });
  if (inv !== l.poQty && inv > got) m.push({ icon: "bad", text: `Invoiced ${inv} vs PO ${l.poQty}` });
  return m.length ? m : [{ icon: "ok", text: "Matches" }];
}
export const hasProblem = (p: Po) => !p.copyPath || p.lines.some((l) => lineMatch(p, l).some((m) => m.icon === "bad"));
export const orderState = (p: Po): "wait" | "ok" | "check" => (!p.deliveredDate ? "wait" : hasProblem(p) ? "check" : "ok");

export function checkDeliveryLines(lines: { sku: string; poQty: number; outcome: Outcome; qty: number; reason: string }[]): string | null {
  for (const l of lines) {
    if (l.outcome !== "delivered" && l.reason.trim().length < 3) return `${l.sku}: write a reason for "${OUTCOMES.find((x) => x.key === l.outcome)!.label}".`;
    if (l.outcome === "short" && !(l.qty > 0 && l.qty < l.poQty)) return `${l.sku}: short delivered needs a quantity above 0 and below ${l.poQty}.`;
    if (l.outcome === "delivered" && l.qty !== l.poQty) return `${l.sku}: quantity differs from the PO, so choose Short delivered.`;
    if (l.qty < 0 || l.qty > l.poQty) return `${l.sku}: the quantity received cannot be below 0 or above ${l.poQty}.`;
  }
  return null;
}

export const rmFmt = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
