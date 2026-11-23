// Made-up delivery jobs for the screens and the sample mode. Nothing here is real.
import type { DamagedItem, DeliveryException, DeliveryJob, JobEvent, Status } from "./rules";

const ev = (...e: [string, Status | "Note", string, string?][]): JobEvent[] => e.map(([at, status, by, note]) => ({ at, status, by, note }));
const job = (n: number, cust: number, name: string, agent: string, amount: number, date: string, status: Status, extra: Partial<DeliveryJob> = {}): DeliveryJob => ({
  docNo: `S9002${String(n).padStart(2, "0")}`, docDate: date, customer: `SAMPLE-C${String(cust).padStart(2, "0")}`, customerName: name, agent, amount,
  docCase: "DO", status, events: ev([`${date} 09:00`, "Invoiced", "SAP import"]), ...extra,
});
const own = { kind: "own" as const, lorryNo: "SAMPLE 1234", driver: "Sample Driver A" };
const own2 = { kind: "own" as const, lorryNo: "SAMPLE 5678", driver: "Sample Driver B" };
const third = { kind: "third" as const, transporter: "Sample Transport Sdn Bhd", vehicleNo: "SAMPLE 9012" };

export const SAMPLE_JOBS: DeliveryJob[] = [
  job(1, 1, "Sample Mini Market", "7", 2210.6, "2026-11-20", "Invoiced"),
  job(2, 2, "Sample Pharmacy", "4", 760.55, "2026-11-20", "Invoiced", { docCase: "NO_DO" }),
  job(3, 3, "Sample Cash & Carry Sdn Bhd", "11", 18420, "2026-11-20", "Invoiced"),
  job(4, 4, "Sample Kedai Runcit", "2", 655, "2026-11-19", "Picked", { events: ev(["2026-11-19 09:00", "Invoiced", "SAP import"], ["2026-11-19 14:10", "Picked", "Sample Checker"]) }),
  job(5, 5, "Sample Trading", "21", 3100.75, "2026-11-19", "Picked", { docCase: "NO_DO", events: ev(["2026-11-19 09:00", "Invoiced", "SAP import"], ["2026-11-19 14:30", "Picked", "Sample Checker"]) }),
  job(6, 6, "Sample Provision Store", "17", 2290, "2026-11-19", "Loaded", { vehicle: own, route: "Route 1", events: ev(["2026-11-19 09:00", "Invoiced", "SAP import"], ["2026-11-19 11:00", "Picked", "Sample Checker"], ["2026-11-20 08:20", "Loaded", "Sample Clerk"]) }),
  job(7, 7, "Sample Supermart", "5", 4980.1, "2026-11-19", "Loaded", { vehicle: own, route: "Route 1", events: ev(["2026-11-19 09:00", "Invoiced", "SAP import"], ["2026-11-19 11:30", "Picked", "Sample Checker"], ["2026-11-20 08:20", "Loaded", "Sample Clerk"]) }),
  job(8, 8, "Sample Sundry Shop", "7", 880, "2026-11-18", "Loaded", { vehicle: third, route: "Outstation", docCase: "NO_DO", events: ev(["2026-11-18 09:00", "Invoiced", "SAP import"], ["2026-11-18 15:00", "Picked", "Sample Checker"], ["2026-11-19 07:50", "Loaded", "Sample Clerk", "Collected by transporter"]) }),
  job(9, 9, "Sample Hardware & Daily Needs", "3", 1175.3, "2026-11-18", "Delivered", { vehicle: own2, route: "Route 2", events: ev(["2026-11-18 09:00", "Invoiced", "SAP import"], ["2026-11-18 13:00", "Picked", "Sample Checker"], ["2026-11-19 08:00", "Loaded", "Sample Clerk"], ["2026-11-19 16:40", "Delivered", "Sample Clerk"]) }),
  job(10, 10, "Sample Cash Mart", "11", 3320, "2026-11-18", "Delivered", { vehicle: own2, route: "Route 2", events: ev(["2026-11-18 09:00", "Invoiced", "SAP import"], ["2026-11-18 13:10", "Picked", "Sample Checker"], ["2026-11-19 08:00", "Loaded", "Sample Clerk"], ["2026-11-19 16:40", "Delivered", "Sample Clerk"]) }),
  job(11, 11, "Sample Family Store", "4", 540.2, "2026-11-17", "Completed", { vehicle: own, route: "Route 1", podFile: "POD_S900211_20261118.pdf", events: ev(["2026-11-17 09:00", "Invoiced", "SAP import"], ["2026-11-17 14:00", "Picked", "Sample Checker"], ["2026-11-18 08:10", "Loaded", "Sample Clerk"], ["2026-11-18 15:20", "Delivered", "Sample Clerk"], ["2026-11-18 17:05", "Completed", "Sample Clerk", "POD scanned"]) }),
  job(12, 12, "Sample Mini Mart 2", "21", 1490, "2026-11-17", "Completed", { vehicle: own, route: "Route 1", docCase: "NO_DO", podFile: "POD_S900212_20261118.pdf", events: ev(["2026-11-17 09:00", "Invoiced", "SAP import"], ["2026-11-17 14:00", "Picked", "Sample Checker"], ["2026-11-18 08:10", "Loaded", "Sample Clerk"], ["2026-11-18 15:20", "Delivered", "Sample Clerk"], ["2026-11-18 17:05", "Completed", "Sample Clerk", "POD scanned"]) }),
  job(13, 13, "Sample Provision Mart", "17", 2750.4, "2026-11-18", "Failed", { vehicle: own2, route: "Route 2", failReason: "Shop closed, nobody to receive", events: ev(["2026-11-18 09:00", "Invoiced", "SAP import"], ["2026-11-18 13:20", "Picked", "Sample Checker"], ["2026-11-19 08:00", "Loaded", "Sample Clerk"], ["2026-11-19 15:30", "Failed", "Sample Clerk", "Shop closed, nobody to receive"]) }),
];

export const SAMPLE_EXCEPTIONS: DeliveryException[] = [
  { id: "x1", docNo: "S900213", kind: "Customer closed", detail: "Shop was closed at 3pm. Called the owner, no answer. Goods came back.", status: "Open", by: "Sample Clerk", at: "2026-11-19" },
  { id: "x2", docNo: "S900211", kind: "Short delivery", detail: "2 cartons of Item A short; customer signed for the quantity received.", qty: 2, noteNo: "CN-SAMPLE-001", status: "Resolved", by: "Sample Clerk", at: "2026-11-18", resolution: "Credit note raised and sent.", resolvedAt: "2026-11-19",
    docs: [{ id: "f1", kind: "Photo", file: "short-delivery.jpg", at: "2026-11-18", by: "Sample Clerk" }, { id: "f2", kind: "Credit note", number: "CN-SAMPLE-001", file: "CN-SAMPLE-001.pdf", at: "2026-11-19", by: "Sample Clerk" }] },
];

export const SAMPLE_DAMAGED: DamagedItem[] = [
  { id: "d1", foundOn: "2026-11-19", itemCode: "SAMPLE-ITEM-01", description: "Sample liquid detergent 1L", qty: 6, uom: "Pack", zone: "F", cause: "Leaking", photo: "leak-1.jpg", by: "Sample Storekeeper" },
  { id: "d2", foundOn: "2026-11-18", itemCode: "SAMPLE-ITEM-02", description: "Sample toothpaste 150g", qty: 2, uom: "Carton", zone: "F", cause: "Crushed", by: "Sample Storekeeper", decision: "Return to principal", decidedBy: "Sample Supervisor", decidedOn: "2026-11-19", note: "Principal agreed to take back." },
  { id: "d3", foundOn: "2026-11-17", itemCode: "SAMPLE-ITEM-03", description: "Sample soap bar 3-pack", qty: 10, uom: "Pack", zone: "F", cause: "Wet", by: "Sample Storekeeper" },
];
