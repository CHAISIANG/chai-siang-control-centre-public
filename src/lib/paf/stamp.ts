// The customer's chop (company stamp) and signature on a PAF: where the chop sits, how it is cleaned up, and the checks around it.
// Browser-only helpers (they use a canvas).

/** Where the chop sits in the signing box. x and y are percent of the box (the chop's centre), size is percent of the box height,
 *  rot is degrees, white is how much of the white paper around the stamp is hidden (0 to 100), ink is how dark it prints (50 to 150). */
export type Placement = { x: number; y: number; size: number; rot: number; white: number; ink: number };
export const DEFAULT_PLACEMENT: Placement = { x: 68, y: 50, size: 80, rot: -8, white: 55, ink: 110 };
export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
export const fixPlacement = (p: Placement): Placement => ({ x: clamp(p.x, 0, 100), y: clamp(p.y, 0, 100), size: clamp(p.size, 20, 160), rot: clamp(p.rot, -180, 180), white: clamp(p.white, 0, 100), ink: clamp(p.ink, 50, 150) });

const load = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error("The picture could not be read.")); i.src = src; });

/** A phone photo is far bigger than a stamp needs: shrink it so it saves and prints quickly. */
export async function shrinkImage(file: File, max = 700): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await load(url);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

/** Hide the white paper around the stamp and set how dark the ink is. Returns a transparent PNG. */
export async function cleanChop(src: string, white: number, ink: number): Promise<string> {
  if (white <= 0 && ink === 100) return src;
  const img = await load(src);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  const cut = 255 - 95 * (white / 100);           // lighter than this is paper
  const soft = 45;                                // a soft edge so the stamp does not look cut out
  const dark = ink > 100 ? (200 - ink) / 100 : 1; // above 100 the ink gets darker
  const fade = ink < 100 ? ink / 100 : 1;         // below 100 the ink gets lighter
  for (let i = 0; i < d.data.length; i += 4) {
    const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    let a = d.data[i + 3] / 255;
    if (white > 0) a *= lum >= cut ? 0 : clamp((cut - lum) / soft, 0, 1);
    d.data[i] *= dark; d.data[i + 1] *= dark; d.data[i + 2] *= dark;
    d.data[i + 3] = Math.round(a * fade * 255);
  }
  g.putImageData(d, 0, 0);
  return c.toDataURL("image/png");
}

/** A short fingerprint of what the customer signed: the claim's cells (except the signing date) and the chop placement.
 *  If it changes after the customer signed, the signature no longer counts. */
export function claimHash(values: Record<string, string>, skip: string[], placement: Placement | null, chopVersion: number): string {
  const keys = Object.keys(values).filter((k) => !skip.includes(k)).sort();
  const text = keys.map((k) => `${k}=${values[k] ?? ""}`).join("|") + `#${placement ? JSON.stringify(fixPlacement(placement)) : ""}#${chopVersion}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}
