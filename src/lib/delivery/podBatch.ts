// Batch POD upload: one PDF holding many scanned delivery documents. Each page is read for its invoice number, pages are
// grouped per invoice, and Finance/Logistics checks the list before anything is attached. Pure code, no screens.
import type { DeliveryJob } from "./rules";

/** One scanned page. `read` is what the reader found; `doc` is what is assigned now (starts as `read`, can be fixed by hand).
 *  A page with no number is the next page of the invoice before it (for example the DO behind the invoice),
 *  unless the reader marked it `unclear` (it saw a number it could not make out, or none where one should be). */
export type ScanPage = {
  n: number; read: string | null; doc: string | null; unclear?: boolean;
  name?: string;     // the customer name the reader saw on the page
  split?: boolean;   // a person made this page the start of its own document
  move?: string;    // a person moved this page to that invoice, wherever it sits in the scan
};
export type PodGroup = { key: number; doc: string | null; pages: number[] };
export type Verdict = "ready" | "none" | "missing" | "notdelivered" | "done" | "dup";

/** The delivery list keeps the SAP number (101S159676); scans and the aging use S159676. */
export const stripPrefix = (d: string) => d.trim().toUpperCase().replace(/^101(?=S)/, "");
/** What a person types for a number is tidied: spaces and a leading 101 removed; "B 15124" kept as the list writes it. */
export function tidyDoc(s: string): string | null {
  const t = s.trim().toUpperCase().replace(/\s+/g, " ");
  if (!t) return null;
  const b = /^B[\s_-]?(\d{3,6})$/.exec(t);
  return b ? `B ${b[1]}` : stripPrefix(t);
}

/** Pages in scan order become one group per invoice. Same number on neighbouring pages joins them; a page with no number
 *  joins the group before it; an unclear page, or one a person split off, stands alone so someone has to look at it.
 *  A page a person moved goes to the group of that invoice wherever it sits (a new group if there is none yet). */
export function groupPages(pages: ScanPage[]): PodGroup[] {
  const out: PodGroup[] = [];
  for (const p of pages) {
    if (p.move) continue;
    const last = out[out.length - 1];
    if (p.doc) {
      if (last && last.doc === p.doc) last.pages.push(p.n);
      else out.push({ key: p.n, doc: p.doc, pages: [p.n] });
    } else if (p.unclear || p.split || !last) out.push({ key: p.n, doc: null, pages: [p.n] });
    else last.pages.push(p.n);
  }
  for (const p of pages) {
    if (!p.move) continue;
    const g = out.find((x) => x.doc === p.move);
    if (g) g.pages.push(p.n);
    else out.push({ key: p.n, doc: p.move, pages: [p.n] });
  }
  for (const g of out) g.pages.sort((x, y) => x - y);
  return out;
}

export const findJob = (jobs: DeliveryJob[], doc: string | null) => (doc ? jobs.find((j) => stripPrefix(j.docNo) === doc) : undefined);

/** Whether a group can be attached, and if not why. The same invoice in two groups is flagged on the second one. */
export function judge(groups: PodGroup[], jobs: DeliveryJob[]): Map<number, Verdict> {
  const seen = new Set<string>();
  const out = new Map<number, Verdict>();
  for (const g of groups) {
    const j = findJob(jobs, g.doc);
    let v: Verdict;
    if (!g.doc) v = "none";
    else if (!j) v = "missing";
    else if (j.status === "Completed") v = "done";
    else if (j.status !== "Delivered") v = "notdelivered";
    else if (seen.has(g.doc)) v = "dup";
    else v = "ready";
    if (g.doc && v === "ready") seen.add(g.doc);
    out.set(g.key, v);
  }
  return out;
}

export const VERDICT_TEXT: Record<Verdict, string> = {
  ready: "Ready",
  none: "Type the invoice number",
  missing: "Not in the delivery list",
  notdelivered: "Not marked Delivered yet",
  done: "Already has a POD",
  dup: "This invoice is already in the list above",
};

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !["sdn", "bhd", "the", "and", "enterprise", "trading"].includes(w));
/** The customer name the reader saw on the pages of a group, when it shares no word with the invoice's customer (a sign of a wrong number). */
export function nameWarning(g: PodGroup, pages: ScanPage[], job: DeliveryJob | undefined): string | null {
  if (!job) return null;
  const seen = pages.filter((p) => g.pages.includes(p.n) && p.name).map((p) => p.name as string);
  if (!seen.length) return null;
  const mine = new Set(words(job.customerName));
  return seen.some((n) => words(n).some((w) => mine.has(w))) ? null : seen[0];
}

/** "p3", "p3–4" or "p3, 5" for a list of page numbers. */
export function pagesText(pages: number[]): string {
  const s = [...pages].sort((a, b) => a - b);
  const runs: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    runs.push(j > i ? `${s[i]}–${s[j]}` : `${s[i]}`);
    i = j + 1;
  }
  return `p${runs.join(", ")}`;
}

/** A made-up scan for the sample screens: invoice, its DO page, an unreadable page, and the kinds of pages that cannot be attached. */
export const SAMPLE_SCAN: ScanPage[] = [
  { n: 1, read: "S900209", doc: "S900209", name: "Sample Hardware & Daily Needs" },
  { n: 2, read: null, doc: null },
  { n: 3, read: "S900210", doc: "S900210", name: "Kedai Ah Seng" },
  { n: 4, read: null, doc: null, unclear: true },
  { n: 5, read: "S900211", doc: "S900211" },
  { n: 6, read: "S900206", doc: "S900206" },
  { n: 7, read: "S900299", doc: "S900299" },
  { n: 8, read: "S900209", doc: "S900209" },
];
