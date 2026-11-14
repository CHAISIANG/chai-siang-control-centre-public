"use client";
// Sends a PO or invoice file to the reader function and returns what it found. Photos are shrunk first so they upload quickly.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { ExtractedInvoice, ExtractedPo } from "./poread";

const MAX_BYTES = 4 * 1024 * 1024;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Big photos become a JPEG no wider than 2200 pixels. PDFs are sent as they are. */
async function prepare(file: File): Promise<{ mime: string; buf: ArrayBuffer } | string> {
  if (file.type === "application/pdf") return file.size > MAX_BYTES ? "This PDF is over 4 MB. Use a smaller file, or type it in." : { mime: file.type, buf: await file.arrayBuffer() };
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return "Use a PDF or a photo (JPG or PNG). Other photo types, such as iPhone HEIC, are not supported yet.";
  if (file.size <= 1.5 * 1024 * 1024) return { mime: file.type, buf: await file.arrayBuffer() };
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob || blob.size > MAX_BYTES) return "This photo is too large. Take it again at a lower quality, or type it in.";
    return { mime: "image/jpeg", buf: await blob.arrayBuffer() };
  } catch {
    return "This photo could not be opened. Try another file.";
  }
}

export type ReadResult<T> = { ok: true; data: T } | { ok: false; error: string };

export async function readDocument(kind: "po", file: File): Promise<ReadResult<ExtractedPo>>;
export async function readDocument(kind: "invoice", file: File): Promise<ReadResult<ExtractedInvoice>>;
export async function readDocument(kind: "po" | "invoice", file: File): Promise<ReadResult<ExtractedPo | ExtractedInvoice>> {
  const p = await prepare(file);
  if (typeof p === "string") return { ok: false, error: p };
  const { data, error } = await supabase.functions.invoke("read-document", { body: { kind, mime: p.mime, data: toBase64(p.buf) } });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      try { const j = await error.context.json(); if (j?.error) return { ok: false, error: String(j.error) }; } catch { /* use the default below */ }
    }
    return { ok: false, error: "The document reader could not be reached. Type it in by hand." };
  }
  if (!data?.ok) return { ok: false, error: String(data?.error ?? "The reader gave no answer. Type it in by hand.") };
  return { ok: true, data: data.data };
}
