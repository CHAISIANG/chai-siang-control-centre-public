// Delivery tracking: from invoice to a signed, scanned proof of delivery (POD). Rules the screens follow;
// when the database is added the server checks the same rules again.

export type Status = "Invoiced" | "Picked" | "Loaded" | "Delivered" | "Completed" | "Failed";
export const STATUSES: Status[] = ["Invoiced", "Picked", "Loaded", "Delivered", "Completed", "Failed"];
/** What each status means for the floor staff. */
export const STATUS_HELP: Record<Status, string> = {
  Invoiced: "Invoice is in, not picked yet",
  Picked: "Picked and checked, waiting to be loaded",
  Loaded: "On a lorry or with a transporter",
  Delivered: "Customer signed; POD not scanned yet",
  Completed: "POD scanned and attached",
  Failed: "Delivery failed, needs a new plan",
};
export const statusTone = (s: Status): "grey" | "blue" | "amber" | "green" | "red" =>
  s === "Completed" ? "green" : s === "Failed" ? "red" : s === "Delivered" ? "amber" : s === "Loaded" ? "blue" : "grey";

export type Vehicle = { kind: "own" | "third"; lorryNo?: string; driver?: string; transporter?: string; vehicleNo?: string };
export type JobEvent = { at: string; status: Status | "Note"; by: string; note?: string };
export type DocCase = "DO" | "NO_DO";
export type DeliveryJob = {
  docNo: string; docDate: string; customer: string; customerName: string; agent: string; amount: number;
  docCase: DocCase; status: Status; vehicle?: Vehicle; route?: string; podFile?: string; podPath?: string; failReason?: string; events: JobEvent[];
};
export const vehicleText = (v?: Vehicle) => (!v ? "" : v.kind === "own" ? `${v.lorryNo ?? ""}${v.driver ? ` · ${v.driver}` : ""}` : `${v.transporter ?? ""}${v.vehicleNo ? ` · ${v.vehicleNo}` : ""}`);

export const EXC_KINDS = ["Rejected goods", "Short delivery", "Refused to sign", "Damaged or leaking on arrival", "Wrong item", "Document lost", "Customer closed", "3rd-party failure"] as const;
export type ExcKind = (typeof EXC_KINDS)[number];
export type DeliveryException = { id: string; docNo: string; kind: ExcKind; detail: string; qty?: number; noteNo?: string; status: "Open" | "Resolved"; by: string; at: string; resolution?: string; resolvedAt?: string };

export const CAUSES = ["Crushed", "Leaking", "Wet", "Expired", "Other"] as const;
export const DECISIONS = ["Return to principal", "Claim", "Rework", "Write-off"] as const;
export type Cause = (typeof CAUSES)[number];
export type Decision = (typeof DECISIONS)[number];
export type DamagedItem = { id: string; foundOn: string; itemCode: string; description: string; qty: number; uom: string; zone: string; cause: Cause; photo?: string; by: string; decision?: Decision; decidedBy?: string; decidedOn?: string; note?: string };

/** The POD file name carries the invoice number: POD_S123456_20261120.pdf, or just S123456.jpg. Returns the invoice number as the aging keeps it. */
export function docFromFileName(name: string): string | null {
  const m = /((?:101)?S\d{5,7}|B[\s_-]?\d{4,6})/i.exec(name.replace(/\.[a-z0-9]+$/i, ""));
  if (!m) return null;
  const d = m[1].toUpperCase().replace(/^101(?=S)/, "");
  return d.startsWith("B") ? `B ${d.replace(/^B[\s_-]?/, "")}` : d;
}
