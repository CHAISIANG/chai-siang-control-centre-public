"use client";
// Reads a big scanned PDF in small pieces, in the browser, and cuts one PDF per invoice for attaching.
// The reader (Supabase function "read-document", kind "pod") takes up to 20 pages and 4 MB at a time, so the file is cut into
// pieces of a few pages, each piece is read on its own, and the answers are put back in page order.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { PDFDocument } from "pdf-lib";
import { supabase } from "@/lib/supabase";
import type { ScanPage } from "./podBatch";

export const MAX_PAGES = 150;
const PIECE_PAGES = 6;                    // pages read per request
const PIECE_BYTES = 3.5 * 1024 * 1024;   // the reader refuses more than 4 MB

function toBase64(buf: Uint8Array): string {
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

type Piece = { from: number; count: number; bytes: Uint8Array };   // from is 0-based
/** Pages from..from+count of the file as their own small PDF; a piece over the size limit is cut in two. */
async function pieces(src: PDFDocument, from: number, count: number): Promise<{ ok: Piece[]; tooBig: number[] }> {
  const doc = await PDFDocument.create();
  const copied = await doc.copyPages(src, Array.from({ length: count }, (_, i) => from + i));
  copied.forEach((p) => doc.addPage(p));
  const bytes = await doc.save();
  if (bytes.length <= PIECE_BYTES) return { ok: [{ from, count, bytes }], tooBig: [] };
  if (count === 1) return { ok: [], tooBig: [from] };
  const half = Math.ceil(count / 2);
  const [a, b] = [await pieces(src, from, half), await pieces(src, from + half, count - half)];
  return { ok: [...a.ok, ...b.ok], tooBig: [...a.tooBig, ...b.tooBig] };
}

type PageRead = { page: number; invoiceNo?: string; customerName?: string; unclear: boolean };
async function readPiece(p: Piece): Promise<{ ok: true; pages: PageRead[] } | { ok: false; error: string }> {
  const { data, error } = await supabase.functions.invoke("read-document", { body: { kind: "pod", mime: "application/pdf", data: toBase64(p.bytes), pages: p.count } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try { const j = await error.context.json(); if (j?.error) return { ok: false, error: String(j.error) }; } catch { /* default below */ }
    }
    return { ok: false, error: "The document reader could not be reached." };
  }
  if (!data?.ok) return { ok: false, error: String(data?.error ?? "The reader gave no answer.") };
  return { ok: true, pages: data.data as PageRead[] };
}

export type ReadOutcome = { ok: true; pages: ScanPage[]; problems: string[] } | { ok: false; error: string };

/** Reads every page of the PDF. A piece the reader could not read leaves its pages unclear, to be typed by hand. */
export async function readPodPdf(file: File, onProgress: (done: number, total: number) => void): Promise<ReadOutcome> {
  let src: PDFDocument;
  try { src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true }); }
  catch { return { ok: false, error: "This file could not be opened as a PDF." }; }
  const total = src.getPageCount();
  if (!total) return { ok: false, error: "This PDF has no pages." };
  if (total > MAX_PAGES) return { ok: false, error: `This PDF has ${total} pages. Use one with ${MAX_PAGES} pages or fewer, or split it in two.` };

  const out: ScanPage[] = Array.from({ length: total }, (_, i) => ({ n: i + 1, read: null, doc: null, unclear: true }));
  const problems = new Set<string>();
  const todo: Piece[] = [];
  for (let from = 0; from < total; from += PIECE_PAGES) {
    const r = await pieces(src, from, Math.min(PIECE_PAGES, total - from));
    todo.push(...r.ok);
    for (const i of r.tooBig) problems.add(`Page ${i + 1} is too large to read (over 3.5 MB). Type its invoice number.`);
  }
  let done = 0;
  onProgress(0, total);
  for (const p of todo) {
    const r = await readPiece(p);
    if (r.ok) {
      for (const x of r.pages) {
        const i = p.from + x.page - 1;
        if (i < p.from || i >= p.from + p.count) continue;
        out[i] = { n: i + 1, read: x.invoiceNo ?? null, doc: x.invoiceNo ?? null, unclear: x.unclear && !x.invoiceNo, name: x.customerName || undefined };
      }
    } else {
      problems.add(r.error);
      // a limit or a missing key will not get better on the next piece: stop here and leave the rest to be typed
      if (/limit|not switched on|key|not signed in|cannot use/i.test(r.error)) break;
    }
    done += p.count;
    onProgress(Math.min(done, total), total);
  }
  return { ok: true, pages: out, problems: [...problems] };
}

const stamp = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date()).replace(/-/g, "");

/** One PDF per invoice, named the way a single upload is (POD_<invoice>_<yyyymmdd>.pdf), holding that invoice's pages. */
export async function buildPodFiles(file: File, items: { doc: string; pages: number[] }[]): Promise<File[]> {
  const src = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true });
  const out: File[] = [];
  for (const it of items) {
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(src, [...it.pages].sort((a, b) => a - b).map((n) => n - 1));
    copied.forEach((p) => doc.addPage(p));
    const bytes = await doc.save();
    out.push(new File([bytes as BlobPart], `POD_${it.doc.replace(" ", "")}_${stamp()}.pdf`, { type: "application/pdf" }));
  }
  return out;
}
