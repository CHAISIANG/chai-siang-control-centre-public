// Turns the parsed reports into the JSON the database functions expect. Pure code, so it can be tested on its own.
import { agingAsAt, type Aging, type Coverage, type CustomerReport, type ProductSales } from "./reports";

export const agingPayload = (a: Aging) =>
  a.invoices.map((i) => ({ doc: i.doc, doc_date: i.date || null, cust_code: i.custCode, customer: i.customer, terms: i.terms, due_date: i.due || null, agent: i.agent, amount: i.amount, outstanding: i.outstanding, note: i.note }));

/** Customers with no sales this year or last are left out: there is nothing to show for them. */
export const customersPayload = (c: CustomerReport) =>
  c.customers.filter((x) => x.ytd !== 0 || x.pyAms !== 0 || x.months.some((m) => m !== 0)).map((x) => ({ code: x.code, name: x.name, months: [...x.months, 0].slice(0, 12), ytd: x.ytd, ytd_ams: x.ytdAms, py_ams: x.pyAms }));

export const productsPayload = (p: ProductSales) =>
  p.lines.map((l) => ({ sale_date: l.date, invoice_no: l.invoice, product_code: l.product, product_desc: l.desc, rep_code: l.rep, rep_name: l.repName, cust_code: l.custCode, cust_name: l.customer, qty_cs: l.qtyCS, qty_ea: l.qtyEA, gross: l.gross, promo_disc: l.promoDisc, qty_disc: l.qtyDisc, inv_disc: l.invDisc, net: l.net }));

/** Months with no figures at all (for example December in November) are not sent. */
export const coveragePayload = (c: Coverage) =>
  c.reps.map((r) => ({
    code: r.code, name: r.name,
    months: Array.from({ length: 12 }, (_, i) => ({ m: i + 1, rl: r.rl[i] ?? 0, active: r.active[i] ?? 0, erc: r.erc[i] ?? 0, target: r.target[i] ?? null, sales: r.sales[i] ?? 0 }))
      .filter((m) => m.rl || m.active || m.sales || m.target),
  }));

/** The year the figures belong to: from the aging date, else the latest invoice line, else today in Malaysia. */
export function reportYear(d: { aging?: Aging; products?: ProductSales }, today: string): number {
  const iso = (d.aging ? agingAsAt(d.aging) : "") || (d.products?.lines.map((l) => l.date).sort().pop() ?? "") || today;
  return Number(iso.slice(0, 4));
}
