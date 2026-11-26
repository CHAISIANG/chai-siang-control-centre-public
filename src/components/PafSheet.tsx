"use client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { addr, checkboxCells, colLetter, colNum, displayValues, getDistributorRep, parseAddr, signatureCells, type FormDef, type Style, type Values } from "@/lib/paf";
import { SignOverlay, type SignOverlayData } from "@/components/paf/CustomerSign";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const toDisplayDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : iso; };
export const toIso = (d: string) => { const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(d); return m ? `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1]}` : ""; };

const BORDER_W: Record<string, string> = { thin: "1px solid", hair: "1px dotted", medium: "2px solid", thick: "3px solid", dotted: "1px dotted", dashed: "1px dashed", double: "3px double", mediumDashed: "2px dashed" };
const bcss = (b: string[] | null) => (b ? `${BORDER_W[b[0]] ?? "1px solid"} #${b[1]}` : undefined);

// A4 portrait with narrow 6.35 mm margins: the usable area in screen pixels (96 dpi), with a small safety gap.
const PRINT_W = 742;
const PRINT_H = 1066;

// Long text: shrink a little, then wrap, and let the row grow up and down so nothing is cut off.
let ctx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, px: number, st: Style) {
  if (ctx === undefined) ctx = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!ctx) return text.length * px * 0.6;
  ctx.font = `${st.i ? "italic " : ""}${st.b ? "700 " : "400 "}${px}px "${st.n}", Arial, sans-serif`;
  return ctx.measureText(text).width;
}
function countLines(text: string, width: number, px: number, st: Style) {
  let lines = 0;
  for (const para of text.split("\n")) {
    let cur = 0, n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const w = textWidth(word, px, st), sp = textWidth(" ", px, st);
      if (w > width) { n += Math.ceil(w / width) - 1; cur = w % width; continue; }
      if (cur === 0) cur = w; else if (cur + sp + w <= width) cur += sp + w; else { n++; cur = w; }
    }
    lines += n;
  }
  return Math.max(1, lines);
}
function fitText(text: string, width: number, basePx: number, st: Style, maxLines: number, minPx: number) {
  const w = Math.max(20, width - 6);
  for (let px = Math.round(basePx); px >= minPx; px--) {
    const lines = countLines(text, w, px, st);
    if (lines <= maxLines) return { px, lines };
  }
  return { px: minPx, lines: countLines(text, w, minPx, st) };
}
const needed = (lines: number, px: number) => Math.ceil(lines * px * 1.22 + 6);

type Props = {
  def: FormDef;
  values: Values;
  /** the customer's signature and chop, shown in the customer's signing spot */
  sign?: SignOverlayData;
  editing?: boolean;
  onChange?: (a: string, v: string) => void;
  photos?: string[];
  /** the Customer representative name follows the customer, so it is not an input */
  followCustomer?: boolean;
};

export default function PafSheet({ def, values: raw, editing = false, onChange, photos = [], followCustomer = false, sign }: Props) {
  // amounts show with exactly 2 decimals; while typing on the form itself they stay as typed
  const values = useMemo(() => (editing ? raw : displayValues(def, raw)), [def, raw, editing]);
  const { layout } = def;
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const xs = useMemo(() => { const a = [0]; layout.cols.forEach((w) => a.push(a[a.length - 1] + w)); return a; }, [layout]);

  const merges = useMemo(() => {
    const top: Record<string, { c2: number; r2: number }> = {};
    const covered = new Set<string>();
    for (const m of layout.merges) {
      const [a, b] = m.split(":");
      const p = parseAddr(a), q = parseAddr(b);
      top[a] = { c2: q.col, r2: q.row };
      for (let r = p.row; r <= q.row; r++) for (let c = p.col; c <= q.col; c++) if (!(r === p.row && c === p.col)) covered.add(addr(c, r));
    }
    return { top, covered };
  }, [layout]);

  const boxes = useMemo(() => new Set(checkboxCells(layout).map((b) => b.box)), [layout]);
  const sig = useMemo(() => signatureCells(layout), [layout]);
  const dateCells = useMemo(() => new Set(["I7", "O7", ...sig.date]), [sig]);

  // Cells the user can type into, with the last column each input may stretch to.
  const inputs = useMemo(() => {
    const m: Record<string, string> = { G9: "R", I7: "L", O7: "R", H35: "K", H37: "K", M27: "R", M32: "R" };
    const { rows, cols, spanTo } = def.lines;
    for (let r = rows[0]; r <= rows[1]; r++) {
      for (const [k, L] of Object.entries(cols)) {
        if (k === "num" || k === "rm" || (k === "pct" && def.pct)) continue;
        m[`${L}${r}`] = (spanTo as Record<string, string>)[k] ?? L;
      }
    }
    // computed cells are not typed into
    if (def.invoice === "sumSell") delete m.H35;
    if (def.cost === "sumCost") delete m.H37;
    // signature names / dates (name of distributor & CD reps are fixed by the template)
    m[sig.name[0]] = "H"; m[sig.date[0]] = "H";
    m[sig.name[1]] = "K"; m[sig.date[1]] = "K";
    m[sig.name[2]] = "N"; m[sig.name[3]] = "S";
    m[sig.date[2]] = "O"; m[sig.date[3]] = "S";
    if (getDistributorRep()) delete m[sig.name[2]]; // fixed name, not typed
    if (followCustomer) delete m[sig.name[0]]; // follows the customer chosen above
    return m;
  }, [def, sig, followCustomer]);

  // Names, descriptions and notes that are too long: smaller type, more lines, taller rows.
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const fit = useMemo(() => {
    const out: Record<string, { px: number; lines: number }> = {};
    if (!mounted) return { cells: out, rowNeed: {} as Record<number, number> }; // measuring needs the browser, so wait until mounted
    // Width of the box a cell's text has to fit in: the merged cell, or the stretch its input uses.
    const widthOf = (a: string) => {
      const { col } = parseAddr(a);
      const mg = merges.top[a];
      if (mg) return xs[mg.c2] - xs[col - 1];
      const end = inputs[a] ? colNum(inputs[a]) : col;
      return xs[Math.max(end, col)] - xs[col - 1];
    };
    const want = (a: string, maxLines: number, minPx: number) => {
      const text = (values[a] ?? "").trim();
      const c = layout.cells[a];
      if (!text || !c) return;
      const st = layout.styles[c.s];
      out[a] = fitText(text, widthOf(a), (st.z * 4) / 3, st, maxLines, minPx);
    };
    want("G9", 2, 12);
    for (const a of ["M27", "M32"]) want(a, 2, 11);
    const { rows, cols } = def.lines;
    for (let r = rows[0]; r <= rows[1]; r++) for (const L of [cols.desc, cols.note]) if (L) want(`${L}${r}`, 3, 10);
    // the four signature names share one size so the row looks even
    const names = sig.name.filter((a) => (values[a] ?? "").trim() && layout.cells[a]);
    names.forEach((a) => want(a, 3, 9));
    if (names.length) {
      const px = Math.min(...names.map((a) => out[a].px));
      for (const a of names) { const st = layout.styles[layout.cells[a].s]; out[a] = { px, lines: countLines((values[a] ?? "").trim(), Math.max(20, widthOf(a) - 6), px, st) }; }
    }
    const rowNeed: Record<number, number> = {};
    for (const [a, f] of Object.entries(out)) { const r = parseAddr(a).row; rowNeed[r] = Math.max(rowNeed[r] ?? 0, needed(f.lines, f.px)); }
    return { cells: out, rowNeed };
  }, [values, layout, def, sig, inputs, xs, merges, mounted]);

  const ys = useMemo(() => {
    const a = [0];
    layout.rows.forEach((h, i) => a.push(a[a.length - 1] + Math.max(h, fit.rowNeed[i + 1] ?? 0)));
    return a;
  }, [layout, fit]);
  const W = xs[xs.length - 1], H = ys[ys.length - 1];

  // Fit to the available width on screen; fit to one A4 portrait page (narrow margins) when printing.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fitScreen = () => setScale(Math.min(1.3, el.clientWidth / W));
    fitScreen();
    const ro = new ResizeObserver(fitScreen);
    ro.observe(el);
    const before = () => {
      const s = Math.min(PRINT_W / W, PRINT_H / H);
      if (inner.current) inner.current.style.transform = `scale(${s})`;
      if (wrap.current) { wrap.current.style.height = `${H * s}px`; wrap.current.style.width = `${W * s}px`; wrap.current.style.margin = "0 auto"; }
    };
    const after = () => {
      if (inner.current) inner.current.style.transform = "";
      if (wrap.current) { wrap.current.style.height = ""; wrap.current.style.width = ""; wrap.current.style.margin = ""; }
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { ro.disconnect(); window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, [W, H]);

  const photoRect = useMemo(() => {
    if (!def.photoBox) return null;
    const [a, b] = def.photoBox.split(":");
    const p = parseAddr(a), q = parseAddr(b);
    return { x: xs[p.col - 1], y: ys[p.row - 1], w: xs[q.col] - xs[p.col - 1], h: ys[q.row] - ys[p.row - 1] };
  }, [def, xs, ys]);

  // The customer's signing spot: the rows above the customer's "Name:" line, from column C to G.
  const signRect = useMemo(() => {
    const nameRow = parseAddr(sig.name[0]).row;
    const x = xs[colNum("C") - 1], y = ys[Math.max(1, nameRow - 4) - 1];
    return { x, y, w: xs[colNum("H") - 1] - x, h: ys[nameRow - 1] - y };
  }, [sig, xs, ys]);

  const nodes: React.ReactNode[] = [];
  for (const [a, c] of Object.entries(layout.cells)) {
    if (merges.covered.has(a)) continue;
    const { col, row } = parseAddr(a);
    const mg = merges.top[a];
    const c2 = mg ? mg.c2 : col, r2 = mg ? mg.r2 : row;
    const x = xs[col - 1], y = ys[row - 1], h = ys[r2] - y;
    let w = xs[c2] - x;
    if (w <= 0 || h <= 0) continue;
    // A long description sits across the columns its input stretches over, as it does when typed.
    if (fit.cells[a] && !mg && inputs[a]) w = Math.max(w, xs[Math.max(colNum(inputs[a]), col)] - x);
    const st = layout.styles[c.s];
    const edge = (side: "bt" | "bb" | "bl" | "br") => {
      const src = side === "bb" ? layout.cells[addr(col, r2)] : side === "br" ? layout.cells[addr(c2, row)] : c;
      const s = src ? layout.styles[src.s] : st;
      return bcss(s[side]) ?? bcss(st[side]);
    };
    const text = values[a] ?? "";
    const isBox = boxes.has(a);
    const isInput = editing && a in inputs;
    const f = fit.cells[a];
    const isName = sig.name.includes(a);
    const justify = st.h === "center" ? "center" : st.h === "right" ? "flex-end" : "flex-start";
    // Signature names sit on the line; everything else keeps the template's alignment.
    const align = isName ? "flex-end" : st.v === "center" ? "center" : st.v === "top" ? "flex-start" : "flex-end";
    nodes.push(
      <div
        key={a}
        onClick={editing && isBox ? () => onChange?.(a, text === "X" ? "" : "X") : undefined}
        title={editing && isBox ? "Click to tick / untick" : undefined}
        style={{
          position: "absolute", left: x, top: y, width: w, height: h, zIndex: f ? 1 : undefined,
          background: st.f ? `#${st.f}` : undefined,
          borderTop: edge("bt"), borderBottom: edge("bb"), borderLeft: edge("bl"), borderRight: edge("br"),
          boxSizing: "border-box", display: "flex", justifyContent: justify, alignItems: align,
          fontFamily: `"${isBox ? "Arial" : st.n}", Arial, sans-serif`, fontSize: f ? `${f.px}px` : `${st.z}pt`, fontWeight: isBox ? 700 : st.b ? 700 : 400,
          fontStyle: st.i ? "italic" : "normal", textDecoration: st.u ? "underline" : "none", color: st.c ? `#${st.c}` : "#000",
          whiteSpace: f || st.w ? "pre-wrap" : "nowrap", overflowWrap: f ? "anywhere" : undefined, overflow: f ? "visible" : mg || st.w ? "hidden" : "visible",
          lineHeight: f ? 1.2 : 1.15, padding: f ? (isName ? "0 3px 2px" : "0 3px") : "0 2px", textAlign: f && st.h === "center" ? "center" : undefined,
          cursor: editing && isBox ? "pointer" : undefined,
          outline: editing && isBox ? "1px dashed #818cf8" : undefined,
        }}
      >
        {!isInput && text}
      </div>,
    );
    if (isInput) {
      const endCol = colNum(inputs[a]);
      const iw = xs[Math.max(endCol, c2)] - x;
      const date = dateCells.has(a);
      nodes.push(
        <input
          key={a + "-in"}
          type={date ? "date" : "text"}
          value={date ? toIso(text) : text}
          onChange={(e) => onChange?.(a, date ? toDisplayDate(e.target.value) : e.target.value)}
          aria-label={a}
          style={{
            position: "absolute", left: x, top: y, width: iw, height: h, zIndex: 5, boxSizing: "border-box",
            background: "rgba(254,249,195,0.85)", border: "1px dashed #6366f1", padding: "0 3px",
            fontFamily: `"${st.n}", Arial, sans-serif`, fontSize: `${Math.min(st.z, 16)}pt`, fontWeight: st.b ? 700 : 400, color: "#1d4ed8",
            textAlign: st.h === "center" ? "center" : "left",
          }}
        />,
      );
    }
  }

  return (
    <div ref={wrap} style={{ width: "100%", height: H * scale }} className="paf-wrap">
      <div ref={inner} id="paf-sheet" style={{ position: "relative", width: W, height: H, transform: `scale(${scale})`, transformOrigin: "top left", background: "#fff" }}>
        {nodes}
        {sign && (sign.signature || sign.chop) && (
          <div style={{ position: "absolute", left: signRect.x, top: signRect.y, width: signRect.w, height: signRect.h, zIndex: 3, pointerEvents: "none" }}>
            <SignOverlay data={sign} />
          </div>
        )}
        {photoRect && (
          <div style={{ position: "absolute", left: photoRect.x, top: photoRect.y, width: photoRect.w, height: photoRect.h, border: "1px solid #94a3b8", background: "#f8fafc", overflow: "hidden", zIndex: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {photos.length ? (
              <div style={{ display: "flex", gap: 8, width: "100%", height: "100%", padding: 6, boxSizing: "border-box" }}>
                {photos.slice(0, 3).map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={u} alt={`Display photo ${i + 1}`} style={{ flex: 1, minWidth: 0, height: "100%", objectFit: "contain" }} />
                ))}
              </div>
            ) : (
              <span style={{ fontSize: 22, color: "#94a3b8", fontFamily: "Arial" }}>Photos of the display (upload on the left)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// colLetter re-export keeps tree-shaking simple for callers
export { colLetter };
