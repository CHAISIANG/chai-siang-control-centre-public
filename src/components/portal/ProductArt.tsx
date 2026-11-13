import type { Product } from "./data";

const ACCENT: Record<Product["category"], string> = {
  Toothpaste: "#D9232E", Toothbrushes: "#D9232E", Mouthwash: "#00A88F", "Personal Care": "#E0912B", "Home Care": "#2B7FD9",
};

/** Plain generic product graphics drawn in SVG (no brand artwork). The colour band follows the category. */
export default function ProductArt({ product, className = "" }: { product: Product; className?: string }) {
  const c = ACCENT[product.category];
  const body = "#FFFFFF", edge = "#CBD5E1", shade = "#EEF2F7";
  return (
    <svg viewBox="0 0 120 120" className={className} role="img" aria-label={`${product.name} illustration`}>
      <ellipse cx="60" cy="108" rx="34" ry="5" fill="#0F172A" opacity="0.07" />
      {product.art === "tube" && (
        <g stroke={edge} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M44 22 h32 l6 76 h-44 z" fill={body} />
          <path d="M38 98 h44 v6 a3 3 0 0 1 -3 3 h-38 a3 3 0 0 1 -3 -3 z" fill={shade} />
          <rect x="49" y="8" width="22" height="14" rx="3" fill={c} stroke="none" />
          <path d="M42 54 h36 l1.6 20 h-39.2 z" fill={c} stroke="none" />
          <path d="M48 36 h24" stroke={c} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
        </g>
      )}
      {product.art === "brush" && (
        <g stroke={edge} strokeWidth="1.5" strokeLinejoin="round" transform="rotate(-18 60 60)">
          <rect x="52" y="52" width="16" height="58" rx="8" fill={body} />
          <rect x="52" y="64" width="16" height="22" fill={c} stroke="none" />
          <path d="M54 52 v-18 h12 v18" fill={shade} />
          <rect x="50" y="10" width="20" height="26" rx="4" fill={body} />
          {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={52 + i * 3.6} y={4} width="2.4" height="12" rx="1.2" fill={i % 2 ? c : "#94A3B8"} stroke="none" />)}
        </g>
      )}
      {product.art === "bottle" && (
        <g stroke={edge} strokeWidth="1.5" strokeLinejoin="round">
          <rect x="52" y="10" width="16" height="12" rx="2" fill={c} stroke="none" />
          <path d="M54 22 h12 v10 c10 6 14 12 14 22 v44 a6 6 0 0 1 -6 6 h-28 a6 6 0 0 1 -6 -6 v-44 c0 -10 4 -16 14 -22 z" fill={body} />
          <rect x="34" y="56" width="52" height="26" fill={c} stroke="none" opacity="0.9" />
          <circle cx="60" cy="69" r="6" fill="#fff" stroke="none" opacity="0.9" />
        </g>
      )}
      {product.art === "pump" && (
        <g stroke={edge} strokeWidth="1.5" strokeLinejoin="round">
          <path d="M56 8 h18 v6 h-10 v10 h-8 z" fill={c} stroke="none" />
          <rect x="54" y="22" width="12" height="10" fill={shade} />
          <path d="M42 34 h36 a4 4 0 0 1 4 4 v62 a6 6 0 0 1 -6 6 h-32 a6 6 0 0 1 -6 -6 v-62 a4 4 0 0 1 4 -4 z" fill={body} />
          <rect x="36" y="52" width="48" height="30" fill={c} stroke="none" opacity="0.9" />
          <path d="M44 66 q8 -8 16 0 t16 0" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        </g>
      )}
      {product.art === "bar" && (
        <g stroke={edge} strokeWidth="1.5" strokeLinejoin="round">
          <rect x="22" y="50" width="76" height="46" rx="5" fill={body} />
          <rect x="22" y="62" width="76" height="22" fill={c} stroke="none" opacity="0.9" />
          <rect x="30" y="40" width="60" height="14" rx="4" fill={shade} />
        </g>
      )}
      {product.art === "pack" && (
        <g stroke={edge} strokeWidth="1.5" strokeLinejoin="round">
          <rect x="24" y="30" width="72" height="68" rx="5" fill={body} />
          <rect x="24" y="30" width="72" height="16" rx="5" fill={c} stroke="none" />
          {[0, 1, 2, 3].map((i) => <rect key={i} x={34 + i * 16} y="54" width="8" height="36" rx="4" fill={i === 3 ? "#00A88F" : "#CBD5E1"} stroke="none" />)}
        </g>
      )}
    </svg>
  );
}
