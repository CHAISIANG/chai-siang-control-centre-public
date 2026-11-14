"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { addr, checkboxCells, colLetter, colNum, getDistributorRep, parseAddr, signatureCells, type FormDef, type Values } from "@/lib/paf";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const toDisplayDate = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso); return m ? `${m[3]}-${MONTHS[Number(m[2]) - 1]}-${m[1]}` : iso; };
export const toIso = (d: string) => { const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(d); return m ? `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1]}` : ""; };

const BORDER_W: Record<string, string> = { thin: "1px solid", hair: "1px dotted", medium: "2px solid", thick: "3px solid", dotted: "1px dotted", dashed: "1px dashed", double: "3px double", mediumDashed: "2px dashed" };
const bcss = (b: string[] | null) => (b ? `${BORDER_W[b[0]] ?? "1px solid"} #${b[1]}` : undefined);

type Props = {
  def: FormDef;
  values: Values;
  editing?: boolean;
  onChange?: (a: string, v: string) => void;
  photos?: string[];
  /** the Customer representative name follows the customer, so it is not an input */
  followCustomer?: boolean;
};

export default function PafSheet({ def, values, editing = false, onChange, photos = [], followCustomer = false }: Props) {
  const { layout } = def;
  const wrap = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const xs = useMemo(() => { const a = [0]; layout.cols.forEach((w) => a.push(a[a.length - 1] + w)); return a; }, [layout]);
  const ys = useMemo(() => { const a = [0]; layout.rows.forEach((h) => a.push(a[a.length - 1] + h)); return a; }, [layout]);
  const W = xs[xs.length - 1], H = ys[ys.length - 1];

  // Fit to the available width on screen; fit to A4 when printing.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1.3, el.clientWidth / W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    const before = () => {
      const s = Math.min(718 / W, 1000 / H);
      if (inner.current) inner.current.style.transform = `scale(${s})`;
      if (wrap.current) wrap.current.style.height = `${H * s}px`;
    };
    const after = () => {
      if (inner.current) inner.current.style.transform = "";
      if (wrap.current) wrap.current.style.height = "";
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => { ro.disconnect(); window.removeEventListener("beforeprint", before); window.removeEventListener("afterprint", after); };
  }, [W, H]);

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

  const photoRect = useMemo(() => {
    if (!def.photoBox) return null;
    const [a, b] = def.photoBox.split(":");
    const p = parseAddr(a), q = parseAddr(b);
    return { x: xs[p.col - 1], y: ys[p.row - 1], w: xs[q.col] - xs[p.col - 1], h: ys[q.row] - ys[p.row - 1] };
  }, [def, xs, ys]);

  const nodes: React.ReactNode[] = [];
  for (const [a, c] of Object.entries(layout.cells)) {
    if (merges.covered.has(a)) continue;
    const { col, row } = parseAddr(a);
    const mg = merges.top[a];
    const c2 = mg ? mg.c2 : col, r2 = mg ? mg.r2 : row;
    const x = xs[col - 1], y = ys[row - 1], w = xs[c2] - x, h = ys[r2] - y;
    if (w <= 0 || h <= 0) continue;
    const st = layout.styles[c.s];
    const edge = (side: "bt" | "bb" | "bl" | "br") => {
      const src = side === "bb" ? layout.cells[addr(col, r2)] : side === "br" ? layout.cells[addr(c2, row)] : c;
      const s = src ? layout.styles[src.s] : st;
      return bcss(s[side]) ?? bcss(st[side]);
    };
    const text = values[a] ?? "";
    const isBox = boxes.has(a);
    const isInput = editing && a in inputs;
    const justify = st.h === "center" ? "center" : st.h === "right" ? "flex-end" : "flex-start";
    const align = st.v === "center" ? "center" : st.v === "top" ? "flex-start" : "flex-end";
    nodes.push(
      <div
        key={a}
        onClick={editing && isBox ? () => onChange?.(a, text === "X" ? "" : "X") : undefined}
        title={editing && isBox ? "Click to tick / untick" : undefined}
        style={{
          position: "absolute", left: x, top: y, width: w, height: h,
          background: st.f ? `#${st.f}` : undefined,
          borderTop: edge("bt"), borderBottom: edge("bb"), borderLeft: edge("bl"), borderRight: edge("br"),
          boxSizing: "border-box", display: "flex", justifyContent: justify, alignItems: align,
          fontFamily: `"${isBox ? "Arial" : st.n}", Arial, sans-serif`, fontSize: `${st.z}pt`, fontWeight: isBox ? 700 : st.b ? 700 : 400,
          fontStyle: st.i ? "italic" : "normal", textDecoration: st.u ? "underline" : "none", color: st.c ? `#${st.c}` : "#000",
          whiteSpace: st.w ? "pre-wrap" : "nowrap", overflow: mg || st.w ? "hidden" : "visible", lineHeight: 1.15, padding: "0 2px",
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
