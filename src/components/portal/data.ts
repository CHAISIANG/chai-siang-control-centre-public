// Types, pricing helpers and the original sample catalogue (kept only as the source for the starter data loaded into the database).
export type Category = "Toothpaste" | "Toothbrushes" | "Mouthwash" | "Personal Care" | "Home Care";
export type Tier = { min: number; pct: number };
export type Product = {
  sku: string; barcode: string; name: string; size: string; category: Category;
  perCarton: number; unitPrice: number; stock: number; tiers: Tier[];
  promo?: string; bundle?: boolean; art: "tube" | "brush" | "bottle" | "pump" | "bar" | "pack";
};

const T: Tier[] = [{ min: 5, pct: 2 }, { min: 10, pct: 4 }, { min: 20, pct: 6 }];
const T2: Tier[] = [{ min: 5, pct: 3 }, { min: 10, pct: 5 }, { min: 20, pct: 8 }];

export const PRODUCTS: Product[] = [
  { sku: "TP-CH-150", barcode: "9556001100158", name: "Colgate Total Charcoal Deep Clean", size: "150g", category: "Toothpaste", perCarton: 24, unitPrice: 7.9, stock: 420, tiers: T2, promo: "Promo: free 1 carton per 20" , art: "tube" },
  { sku: "TP-MF-160", barcode: "9556001100165", name: "Colgate MaxFresh Cooling Crystal", size: "160g", category: "Toothpaste", perCarton: 24, unitPrice: 6.85, stock: 960, tiers: T, art: "tube" },
  { sku: "TP-CP-225", barcode: "9556001100172", name: "Colgate Cavity Protection Great Regular", size: "225g", category: "Toothpaste", perCarton: 24, unitPrice: 8.4, stock: 310, tiers: T, art: "tube" },
  { sku: "TP-HB-100", barcode: "9556001100189", name: "Colgate Herbal Whitening", size: "100g", category: "Toothpaste", perCarton: 48, unitPrice: 4.6, stock: 35, tiers: T, art: "tube" },
  { sku: "TP-SF-75", barcode: "9556001100196", name: "Colgate Kids Strawberry Fun", size: "75g", category: "Toothpaste", perCarton: 48, unitPrice: 3.95, stock: 0, tiers: T, art: "tube" },
  { sku: "TB-SC-12", barcode: "9556001100202", name: "Colgate Slim Soft Charcoal Toothbrush", size: "Single pack", category: "Toothbrushes", perCarton: 144, unitPrice: 4.3, stock: 180, tiers: T2, art: "brush" },
  { sku: "TB-ZZ-12", barcode: "9556001100219", name: "Colgate ZigZag Medium Toothbrush", size: "Twin pack", category: "Toothbrushes", perCarton: 72, unitPrice: 6.6, stock: 240, tiers: T, bundle: true, art: "brush" },
  { sku: "TB-KD-12", barcode: "9556001100226", name: "Colgate Kids Soft Toothbrush Bundle", size: "3 + 1 free", category: "Toothbrushes", perCarton: 48, unitPrice: 9.9, stock: 64, tiers: T, bundle: true, promo: "Bundle: 3 + 1 free", art: "pack" },
  { sku: "MW-PX-500", barcode: "9556001100233", name: "Colgate Plax Peppermint Fresh Mouthwash", size: "500ml", category: "Mouthwash", perCarton: 12, unitPrice: 12.8, stock: 150, tiers: T, art: "bottle" },
  { sku: "MW-PX-250", barcode: "9556001100240", name: "Colgate Plax Alcohol Free Mouthwash", size: "250ml", category: "Mouthwash", perCarton: 24, unitPrice: 7.2, stock: 28, tiers: T, art: "bottle" },
  { sku: "PC-PN-500", barcode: "9556001100257", name: "Palmolive Naturals Milk & Honey Shower Gel", size: "500ml", category: "Personal Care", perCarton: 12, unitPrice: 11.5, stock: 275, tiers: T, art: "pump" },
  { sku: "PC-PN-400", barcode: "9556001100264", name: "Palmolive Aroma Shampoo Fresh", size: "400ml", category: "Personal Care", perCarton: 12, unitPrice: 13.2, stock: 120, tiers: T, promo: "Promo: RM1 off per unit", art: "pump" },
  { sku: "PC-PT-4", barcode: "9556001100271", name: "Protex Fresh Antibacterial Soap Bar", size: "4 x 70g", category: "Personal Care", perCarton: 24, unitPrice: 8.75, stock: 510, tiers: T2, bundle: true, art: "bar" },
  { sku: "HC-AJ-750", barcode: "9556001100288", name: "Ajax Lemon Dishwashing Liquid", size: "750ml", category: "Home Care", perCarton: 12, unitPrice: 6.3, stock: 380, tiers: T, art: "pump" },
  { sku: "HC-AJ-900", barcode: "9556001100295", name: "Ajax Floor Cleaner Citrus", size: "900ml", category: "Home Care", perCarton: 12, unitPrice: 7.45, stock: 90, tiers: T, art: "bottle" },
  { sku: "HC-SL-1L", barcode: "9556001100301", name: "Softlan Fabric Softener Spring Fresh", size: "1L", category: "Home Care", perCarton: 12, unitPrice: 9.6, stock: 22, tiers: T, promo: "Promo: 2 free units per carton", art: "bottle" },
];

export const CATEGORIES: { group: string; items: Category[] }[] = [
  { group: "Oral Care", items: ["Toothpaste", "Toothbrushes", "Mouthwash"] },
  { group: "Personal Care", items: ["Personal Care"] },
  { group: "Home Care", items: ["Home Care"] },
];

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Discount percentage that applies at this many cartons. */
export const tierPct = (p: Product, cartons: number) => p.tiers.reduce((best, t) => (cartons >= t.min ? t.pct : best), 0);
export const cartonPrice = (p: Product) => r2(p.unitPrice * p.perCarton);
/** Price of one carton after the bulk discount for the quantity being ordered. */
export const cartonNet = (p: Product, cartons: number) => r2(cartonPrice(p) * (1 - tierPct(p, cartons) / 100));
export const lineTotal = (p: Product, cartons: number) => r2(cartonNet(p, cartons) * cartons);
export const lineSaving = (p: Product, cartons: number) => r2(cartonPrice(p) * cartons - lineTotal(p, cartons));

// ---------- orders and account, as loaded from the database ----------
export type OrderLine = { sku: string; n: number; name: string };
export type OrderStatus = "Pending approval" | "Approved" | "Out for delivery" | "Delivered" | "Cancelled";
export type Order = { id: string; ref: string; date: string; status: OrderStatus; lines: OrderLine[]; total: number };
export type Account = { code: string; company: string; tier: string; creditLimit: number; outstanding: number };
/** Orders that are placed but not yet delivered still count against the credit limit. */
export const COMMITTED: OrderStatus[] = ["Pending approval", "Approved", "Out for delivery"];

export const stockState = (p: Product) => (p.stock === 0 ? "out" : p.stock <= 40 ? "low" : "in") as "in" | "low" | "out";
export const rm = (n: number) => `RM ${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
