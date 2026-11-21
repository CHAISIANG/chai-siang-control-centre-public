// The invoice workflow from Finance to Logistics until the signed document is scanned. One source for the app page and the Word copy.

export type FlowStep = { n: number; who: string; title: string; where: { label: string; href: string }; do: string[]; check: string };

export const FLOW: FlowStep[] = [
  { n: 1, who: "Finance", title: "Import the SAP invoices", where: { label: "Finance › SAP invoice import", href: "/finance/sap-import" },
    do: ["Export the invoices from SAP and choose the file.", "Look at the checks: totals per invoice, price changes, invoices imported before, pack items."],
    check: "Every invoice total matches SAP. Invoices imported before are left out, so nothing is imported twice." },
  { n: 2, who: "Finance, then Finance / Management / Director", title: "Credit check (automatic on upload)", where: { label: "Finance › Credit approvals", href: "/finance/credit" },
    do: ["For salesmen 04, 11, 17, 21 and 22, an invoice for a customer with anything overdue is held out of the file. Press Ask for approval.", "An approver decides on Credit approvals; a rejection needs a reason.", "Approved invoices are downloaded in a follow-up file. Supermarkets are not held: their salesman gets a reminder on Collection follow-up."],
    check: "No held invoice goes into the file without an approval. The aging used is the latest one (loaded every evening from Google Drive)." },
  { n: 3, who: "Finance", title: "Download the import file and import it into SQL", where: { label: "Finance › SAP invoice import", href: "/finance/sap-import" },
    do: ["Download the import file and import it into the SQL system.", "Each invoice in the file becomes a delivery job with status Invoiced."],
    check: "Import history shows the file; the invoices appear on Logistics › Deliveries." },
  { n: 4, who: "Admin / warehouse", title: "Print and pick", where: { label: "Logistics › Deliveries", href: "/logistics/deliveries" },
    do: ["Choose With DO or No DO, print the DO (if used) and the invoice.", "Pick straight from the invoice or DO; damaged or leaking cartons go to Zone F (Damaged stock).", "A second person checks and signs, then mark Picked."],
    check: "Two signatures on the paper; status Picked." },
  { n: 5, who: "Logistics clerk and driver", title: "Plan, load and hand over", where: { label: "Logistics › Deliveries › Load…", href: "/logistics/deliveries" },
    do: ["Group invoices by route; choose our lorry and driver, or a 3rd-party transporter.", "Load the last drop first; the driver counts and signs the manifest.", "Select the invoices and press Load… to record lorry, driver and route."],
    check: "Status Loaded with lorry or transporter and route; the Logistics page shows the trip." },
  { n: 6, who: "Driver or transporter", title: "Deliver and get the signature", where: { label: "Logistics › Deliveries / Delivery exceptions", href: "/logistics/exceptions" },
    do: ["The customer counts, signs, stamps, dates and writes their name on the DO and invoice (or the invoice only, if no DO).", "Shortages, rejects or damage are written on the paper before signing and logged as an exception.", "Back at base, mark the invoice Delivered (or Delivery failed, with the reason)."],
    check: "Every invoice on the manifest is Delivered or Failed; exceptions are logged the same day." },
  { n: 7, who: "Logistics clerk", title: "Scan the signed document", where: { label: "Logistics › Deliveries › Upload PODs", href: "/logistics/deliveries" },
    do: ["Scan the same day. Name each file POD_<invoice>_<yyyymmdd>, for example POD_S159525_20261121.pdf.", "Press Upload PODs and choose the files: each is matched to its invoice by the number in the name and the invoice becomes Completed."],
    check: "The POD missing tab is empty at the end of the day; files with no matching invoice are listed with the reason." },
  { n: 8, who: "Finance, Management, Director, supervisors, salesmen", title: "Anyone concerned opens the scan", where: { label: "Invoice tracker", href: "/tracker" },
    do: ["Search the invoice number or customer: see every step and open the scanned POD.", "Finance, Management, Directors and supervisors see every invoice; a salesman sees his own customers' invoices.", "Finance › Invoices and Collection follow-up link straight to the tracker."],
    check: "Proof of delivery is in hand before chasing a payment or answering a customer." },
  { n: 9, who: "Finance and salesmen", title: "Collect the payment", where: { label: "Collection follow-up", href: "/followup" },
    do: ["The aging is loaded every evening (6 pm, Monday to Saturday) from Google Drive; paid invoices drop off it.", "Salesmen record the status of each overdue invoice; Finance follows up."],
    check: "The tracker's Payment step shows what is still owed for the invoice." },
];

export const WHO_SEES: { who: string; sees: string }[] = [
  { who: "Finance", sees: "Every invoice, its journey and its scan; credit approvals; the aging." },
  { who: "Management and Directors", sees: "Every invoice and its scan; they can also approve held invoices and update deliveries." },
  { who: "Supervisors", sees: "Every invoice and its scan; they can update deliveries and decide on damaged stock." },
  { who: "Warehouse / logistics clerk", sees: "Every invoice; they pick, load, deliver, scan and log exceptions and damaged stock." },
  { who: "Salesmen", sees: "Only their own customers' invoices and scans; they cannot change a delivery." },
];
