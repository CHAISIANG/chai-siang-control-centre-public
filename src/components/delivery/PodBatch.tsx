"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileStack, X } from "lucide-react";
import { Badge } from "@/components/ui";
import { btnGhost, btnPrimary } from "@/components/finui";
import type { DeliveryJob } from "@/lib/delivery/rules";
import type { Result } from "@/lib/delivery/store";
import { readPodPdf } from "@/lib/delivery/podReader";
import { findJob, groupPages, judge, nameWarning, pagesText, SAMPLE_SCAN, tidyDoc, VERDICT_TEXT, type ScanPage, type Verdict } from "@/lib/delivery/podBatch";
import { useT } from "@/lib/i18n";

const money = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const tone: Record<Verdict, "green" | "amber" | "red"> = { ready: "green", none: "amber", missing: "red", notdelivered: "red", done: "red", dup: "red" };

/**
 * One PDF with many scanned delivery documents. The pages are read for their invoice numbers and grouped per invoice;
 * a person checks the list, fixes any number, and only then are the PODs attached. Sample screens: the reading is simulated.
 */
export function PodBatch({ jobs, sample, onAttach, onClose }: {
  jobs: DeliveryJob[]; sample: boolean;
  onAttach: (items: { doc: string; pages: number[] }[], file: string, source: File | null) => Promise<Result>;
  onClose: () => void;
}) {
  const { t } = useT();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"choose" | "reading" | "review">("choose");
  const [file, setFile] = useState("");
  const [source, setSource] = useState<File | null>(null);   // the real PDF (live); none for the sample scan
  const [total, setTotal] = useState(SAMPLE_SCAN.length);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState(0);
  const [pages, setPages] = useState<ScanPage[]>([]);
  const [off, setOff] = useState<Set<number>>(new Set());   // groups the person unticked
  const [menu, setMenu] = useState<number | null>(null);   // the page whose small menu is open
  const [moveTo, setMoveTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Result | null>(null);

  // the sample "reading": one page at a time, then the list appears
  useEffect(() => {
    if (step !== "reading" || source) return;
    const id = setTimeout(() => {
      if (done + 1 >= total) { setDone(total); setPages(SAMPLE_SCAN.map((p) => ({ ...p }))); setStep("review"); }
      else setDone(done + 1);
    }, 220);
    return () => clearTimeout(id);
  }, [step, done, total, source]);

  const groups = useMemo(() => groupPages(pages), [pages]);
  const verdicts = useMemo(() => judge(groups, jobs), [groups, jobs]);
  const ready = groups.filter((g) => verdicts.get(g.key) === "ready" && !off.has(g.key));
  const count = (v: Verdict) => groups.filter((g) => verdicts.get(g.key) === v).length;
  const blocked = groups.filter((g) => verdicts.get(g.key) !== "ready").length;

  /** A page goes to another invoice (even one far away in the scan), or is split off to be its own document. */
  function movePage(n: number, value: string) {
    const doc = tidyDoc(value);
    setPages((ps) => ps.map((p) => (p.n === n ? { ...p, move: doc ?? undefined, split: false } : p)));
    setMenu(null); setMoveTo("");
  }
  function splitPage(n: number) { setPages((ps) => ps.map((p) => (p.n === n ? { ...p, split: true, move: undefined, doc: p.doc } : p))); setMenu(null); }
  function undoPage(n: number) { setPages((ps) => ps.map((p) => (p.n === n ? { ...p, split: false, move: undefined } : p))); setMenu(null); }
  /** The sample scan is simulated; a real PDF is cut into pieces and read page by page. */
  async function start(name: string, f: File | null = null) {
    setFile(name); setSource(f); setDone(0); setPages([]); setOff(new Set()); setMenu(null); setMsg(null); setProblems([]);
    if (!f) { setTotal(SAMPLE_SCAN.length); setStep("reading"); return; }
    setTotal(1); setStep("reading");
    const r = await readPodPdf(f, (d, n) => { setDone(d); setTotal(n); });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); setStep("choose"); return; }
    setPages(r.pages); setProblems(r.problems); setStep("review");
  }
  /** Typing a number gives it to the whole group: its first page, and any page that carried a number of its own. */
  function setDoc(first: number, value: string) {
    const doc = tidyDoc(value);
    const g = groups.find((x) => x.key === first);
    if (!g) return;
    setPages((ps) => ps.map((p) => (p.n === first || (g.pages.includes(p.n) && p.doc) ? { ...p, doc, unclear: doc ? false : p.unclear } : p)));
  }
  async function attach() {
    if (busy || !ready.length) return;
    setBusy(true);
    const r = await onAttach(ready.map((g) => ({ doc: g.doc!, pages: g.pages })), file, source);
    setBusy(false); setMsg(r);
    if (r.ok) setStep("choose");
  }

  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:items-center" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t("Upload PDF batch")} className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><FileStack size={20} /> {t("Upload PDF batch")}</h2>
          <button onClick={onClose} aria-label={t("Close")} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </div>
        <div className="p-4">
          {sample && <p className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">{t("Sample data. The pages are not really read yet; this shows how a batch will look.")}</p>}
          {problems.length > 0 && <div role="alert" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">{problems.map((p) => <p key={p}>{t(p)}</p>)}<p className="mt-1 text-xs">{t("Pages that could not be read are listed below. Type their invoice numbers.")}</p></div>}
          {msg && <p role="status" className={`mb-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{t(msg.text)}</p>}

          {step === "choose" && (
            <div className="rounded-xl border-2 border-dashed border-slate-300 px-4 py-10 text-center">
              <p className="text-slate-700">{t("Choose one PDF with all the signed delivery documents scanned together, up to 150 pages.")}</p>
              <p className="mt-1 text-sm text-slate-500">{t("Each page is read for its invoice number. A page with no number, such as the DO behind an invoice, goes with the page before it. You check the list before anything is attached.")}</p>
              <input ref={input} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void start(f.name, sample ? null : f); if (input.current) input.current.value = ""; }} />
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button onClick={() => input.current?.click()} className={btnPrimary}>{t("Choose PDF")}</button>
                {sample && <button onClick={() => void start("Sample scan.pdf")} className={btnGhost}>{t("Try a sample scan")}</button>}
              </div>
            </div>
          )}

          {step === "reading" && (
            <div className="px-2 py-8 text-center">
              <p className="font-medium text-slate-800">{t("Reading page {n} of {total}", { n: Math.min(done + 1, total), total })}</p>
              <div className="mx-auto mt-3 h-2 max-w-sm overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><div className="h-full bg-indigo-500 transition-[width]" style={{ width: `${(done / total) * 100}%` }} /></div>
              <p className="mt-2 text-sm text-slate-500">{file}</p>
              {source && <p className="mt-1 text-xs text-slate-400">{t("Pages are sent to the document reader a few at a time. This can take a minute or two.")}</p>}
            </div>
          )}

          {step === "review" && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-slate-600">{file} · {t("{n} pages", { n: pages.length })} · {t("{n} documents", { n: groups.length })}</span>
                <Badge tone="green">{count("ready")} {t("ready")}</Badge>
                {count("none") > 0 && <Badge tone="amber">{count("none")} {t("need a number")}</Badge>}
                {blocked - count("none") > 0 && <Badge tone="red">{blocked - count("none")} {t("cannot be attached")}</Badge>}
              </div>
              <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-slate-600"><tr>
                    <th className="w-9 px-2 py-2" />
                    <th className="px-2 py-2 font-medium">{t("Pages")}</th><th className="px-2 py-2 font-medium">{t("Invoice")}</th>
                    <th className="px-2 py-2 font-medium">{t("Customer")}</th><th className="px-2 py-2 text-right font-medium">{t("Amount (RM)")}</th><th className="px-2 py-2 font-medium">{t("Check")}</th>
                  </tr></thead>
                  <tbody>
                    {groups.map((g) => {
                      const v = verdicts.get(g.key)!;
                      const j = findJob(jobs, g.doc);
                      const on = v === "ready" && !off.has(g.key);
                      return (
                        <tr key={g.key} className={`border-t border-slate-100 align-top ${v === "none" ? "bg-amber-50/60" : ""}`}>
                          <td className="px-2 py-2"><input type="checkbox" disabled={v !== "ready"} checked={on} onChange={() => setOff((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })} aria-label={`${t("Attach")} ${g.doc ?? pagesText(g.pages)}`} className="h-4 w-4 accent-indigo-600" /></td>
                          <td className="px-2 py-2">
                            <div className="flex gap-1">{g.pages.map((n) => { const p = pages.find((x) => x.n === n)!; return (
                              <button key={n} onClick={() => { setMenu(menu === n ? null : n); setMoveTo(""); }} aria-expanded={menu === n} title={`${t("Page")} ${n}: ${t("move or split")}`}
                                className={`flex h-10 w-8 items-center justify-center rounded border text-xs hover:border-indigo-500 ${menu === n ? "border-indigo-600 bg-indigo-50 text-indigo-800" : p.move || p.split ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-300 bg-slate-50 text-slate-500"}`}>{n}</button>); })}</div>
                            {menu !== null && g.pages.includes(menu) && (
                              <div className="mt-1.5 w-60 rounded-lg border border-slate-200 bg-white p-2 text-xs shadow-sm">
                                <div className="font-medium text-slate-800">{t("Page")} {menu}</div>
                                <label className="mt-1 block text-slate-600">{t("Move to invoice")}
                                  <span className="mt-0.5 flex gap-1"><input value={moveTo} onChange={(e) => setMoveTo(e.target.value)} placeholder="S123456" className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1" />
                                    <button disabled={!tidyDoc(moveTo)} onClick={() => movePage(menu, moveTo)} className="rounded border border-slate-300 px-2 py-1 font-medium hover:bg-slate-100 disabled:opacity-50">{t("Move")}</button></span></label>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {g.pages.length > 1 && !pages.find((x) => x.n === menu)?.move && <button onClick={() => splitPage(menu)} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100">{t("Make it its own document")}</button>}
                                  {(pages.find((x) => x.n === menu)?.move || pages.find((x) => x.n === menu)?.split) && <button onClick={() => undoPage(menu)} className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100">{t("Put it back")}</button>}
                                </div>
                              </div>
                            )}
                            <div className="mt-0.5 text-xs text-slate-500">{pagesText(g.pages)}</div>
                          </td>
                          <td className="px-2 py-2"><input value={g.doc ?? ""} onChange={(e) => setDoc(g.key, e.target.value)} placeholder="S123456" aria-label={`${t("Invoice number for")} ${pagesText(g.pages)}`} className="w-32 rounded-md border border-slate-300 px-2 py-1 font-medium text-slate-900" /></td>
                          <td className="px-2 py-2 text-slate-700">{j?.customerName ?? <span className="text-slate-400">–</span>}{(() => { const w = nameWarning(g, pages, j); return w ? <div className="mt-0.5 rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-800">{t("The page says")} “{w}”. {t("Check this is the right invoice.")}</div> : null; })()}</td>
                          <td className="px-2 py-2 text-right tabular-nums">{j ? money(j.amount) : ""}</td>
                          <td className="px-2 py-2"><Badge tone={tone[v]}>{t(VERDICT_TEXT[v])}</Badge></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button onClick={() => setStep("choose")} disabled={busy} className={btnGhost}>{t("Start again")}</button>
                <span className="text-sm text-slate-500">{t("Nothing is attached until you press the button.")}</span>
                <button onClick={() => void attach()} disabled={busy || !ready.length} className={`${btnPrimary} ml-auto`}>{busy ? t("Attaching…") : t("Attach {n} PODs", { n: ready.length })}</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
