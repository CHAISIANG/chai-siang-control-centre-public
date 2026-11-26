"use client";
// Made-up master data for the preview of the Master data page. Nothing here is real.
import { createContext, createElement, useContext, type ReactNode } from "react";

const SampleMode = createContext(false);
/** The preview page wraps the Master data page in this, so it shows made-up data and saves only in the browser. */
export function MasterSample({ children }: { children: ReactNode }) { return createElement(SampleMode.Provider, { value: true }, children); }
export const useMasterSample = () => useContext(SampleMode);

export const SAMPLE_SUPPLIERS = [
  { code: "P-COLGATE", name: "Colgate-Palmolive (sample record)", payment_terms: "30 days", contact_person: "Sample Key Account Manager", email: null, claims_email: null, active: true },
  { code: "P-SAMPLEB", name: "Sample Principal B", payment_terms: "45 days", contact_person: null, email: null, claims_email: null, active: true },
];

/** What the sales reports would show: product code, name, cartons and net sales. */
export const SAMPLE_SOLD = [
  { code: "S-1001", desc: "Sample Toothpaste Fresh 175g MP", cartons: 420, net: 98250 },
  { code: "S-1002", desc: "Sample Toothpaste Fresh 75g MP", cartons: 310, net: 41200 },
  { code: "S-1003", desc: "Sample Fabric Softener Floral 1.6L R", cartons: 260, net: 38900 },
  { code: "S-1004", desc: "Sample Fabric Softener Floral 1.6L R MP", cartons: 150, net: 24600 },
  { code: "S-1005", desc: "Sample Dish Paste Lime 700g", cartons: 140, net: 15800 },
  { code: "S-1006", desc: "Sample Toothbrush Zig Zag Med 3s", cartons: 95, net: 12100 },
  { code: "S-1007", desc: "Sample Mouthwash Peppermint 250ml", cartons: 60, net: 8700 },
  { code: "S-1008", desc: "Sample Floor Cleaner Lavender 1L MP", cartons: 40, net: 5200 },
  { code: "S-2001", desc: "Sample B Shampoo 400ml", cartons: 30, net: 4100 },
];

/** Products already saved. Some have a principal and a product group; some are still missing details. */
export const SAMPLE_SAVED = [
  { code: "S-1001", description: "Sample Toothpaste Fresh 175g MP", barcode: "9550000000011", category: "Toothpaste", brand: "SAMPLE", pack_size: "175g", pcs_per_carton: 72, carton_price: 233.9, batch_tracked: true, shelf_life_days: 1095, active: true, principal_code: "P-COLGATE", product_group: "Toothpaste Fresh 175g" },
  { code: "S-1002", description: "Sample Toothpaste Fresh 75g MP", barcode: null, category: "Toothpaste", brand: "SAMPLE", pack_size: "75g", pcs_per_carton: 144, carton_price: null, batch_tracked: true, shelf_life_days: null, active: true, principal_code: "P-COLGATE", product_group: "Toothpaste Fresh 75g" },
  { code: "S-1003", description: "Sample Fabric Softener Floral 1.6L R", barcode: "9550000000035", category: "Home care", brand: "SAMPLE", pack_size: "1.6L", pcs_per_carton: 6, carton_price: 149.6, batch_tracked: true, shelf_life_days: 730, active: true, principal_code: "P-COLGATE", product_group: "Fabric Softener Floral 1.6L" },
  { code: "S-1004", description: "Sample Fabric Softener Floral 1.6L R MP", barcode: null, category: "Home care", brand: "SAMPLE", pack_size: "1.6L", pcs_per_carton: null, carton_price: null, batch_tracked: true, shelf_life_days: null, active: true, principal_code: "P-COLGATE", product_group: "Fabric Softener Floral 1.6L" },
  { code: "S-2001", description: "Sample B Shampoo 400ml", barcode: null, category: "Personal care", brand: "SAMPLE B", pack_size: "400ml", pcs_per_carton: 12, carton_price: 136.8, batch_tracked: true, shelf_life_days: null, active: true, principal_code: "P-SAMPLEB", product_group: null },
];

export const SAMPLE_CUSTOMERS = [
  { code: "SAMPLE-C01", name: "Sample Mini Market", channel: "Superette", route_name: "Route 1", salesman_code: "MY01S00007" },
  { code: "SAMPLE-C02", name: "Sample Pharmacy", channel: "Drugstore", route_name: "Route 2", salesman_code: "MY01S00004" },
];
