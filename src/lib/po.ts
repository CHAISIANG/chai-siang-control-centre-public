// Purchase order tracking: shapes and the service-level calculations.
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export type PoLine = { sku: string; desc: string; poQty: number; poPrice: number; invQty?: number; invPrice?: number; delQty?: number };
export type Po = {
  id: string; poNo: string; clientId: string; customer: string; poDate: string; reqDate: string;
  soNo?: string; salesman: string; checkedBy?: string;
  invoiceId?: string; invoiceNo?: string; invoiceDate?: string;
  deliveredDate?: string; driver?: string; route?: string; proofPath?: string;
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

/** A PO exists once the order is keyed, so "received" only shows before that. */
export function stageOf(p: Po): Stage {
  if (p.deliveredDate) return p.proofPath && !openIssues(p).length ? "closed" : "delivered";
  if (p.invoiceNo) return "invoiced";
  return "keyed";
}

export type Issue = { kind: "late" | "short" | "price" | "qty" | "proof" | "overdue"; key: string; text: string; reason?: string };
/** Every problem found, each with the reason staff gave (if any). */
export function issues(p: Po): Issue[] {
  return rawIssues(p).map((i) => ({ ...i, reason: p.reasons[i.key] }));
}
/** Problems still waiting for a reason. */
export const openIssues = (p: Po) => issues(p).filter((i) => !i.reason);
function rawIssues(p: Po): Issue[] {
  const out: Issue[] = [];
  const hasInv = !!p.invoiceNo;
  for (const l of p.lines) {
    if (hasInv && l.invPrice !== undefined && l.invPrice !== l.poPrice) out.push({ kind: "price", key: `price:${l.sku}`, text: `${l.sku}: invoice RM ${l.invPrice.toFixed(2)} vs PO RM ${l.poPrice.toFixed(2)}` });
    if (hasInv && l.invQty !== undefined && l.invQty !== l.poQty) out.push({ kind: "qty", key: `qty:${l.sku}`, text: `${l.sku}: invoiced ${l.invQty} vs PO ${l.poQty}` });
    if (p.deliveredDate && l.delQty !== undefined && l.delQty < l.poQty) out.push({ kind: "short", key: `short:${l.sku}`, text: `${l.sku}: delivered ${l.delQty} of ${l.poQty}` });
  }
  if (p.deliveredDate && p.deliveredDate > p.reqDate) out.push({ kind: "late", key: "late", text: `Delivered ${daysBetween(p.reqDate, p.deliveredDate)} day(s) late` });
  if (!p.deliveredDate && p.invoiceNo && today() > p.reqDate) out.push({ kind: "overdue", key: "overdue", text: `Not delivered, ${daysBetween(p.reqDate, today())} day(s) past the requested date` });
  if (p.deliveredDate && !p.proofPath) out.push({ kind: "proof", key: "proof", text: "Signed delivery proof not uploaded" });
  return out;
}

export function scoreOf(p: Po) {
  if (!p.deliveredDate) return null;
  const ordered = sum(p, (l) => l.poQty), got = sum(p, (l) => l.delQty ?? 0);
  const onTime = p.deliveredDate <= p.reqDate;
  const inFull = got >= ordered;
  const accurate = !p.lines.some((l) => l.invPrice !== l.poPrice || l.invQty !== l.poQty);
  return { onTime, inFull, accurate, fillPct: ordered ? (got / ordered) * 100 : 0, perfect: onTime && inFull && accurate };
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

export const rmFmt = (n: number) => "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
