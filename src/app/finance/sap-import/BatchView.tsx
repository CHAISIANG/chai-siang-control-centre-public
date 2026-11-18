"use client";
import { useCallback, useEffect, useState } from "react";
import { Download, Pencil, Search, Trash2, X } from "lucide-react";
import { Badge, Card, Td, Th } from "@/components/ui";
import { btnGhost, btnPrimary } from "@/components/finui";
import { supabase } from "@/lib/supabase";
import { lineAmount, writeImportFile, type FileRow } from "@/lib/sapInvoice";

export type Batch = { id: number; file_name: string; made_at: string; made_by_name: string | null; invoices: number; lines: number; net_total: number; doc_from: string | null; doc_to: string | null };

type Line = {
  id: number; sort: number | null; doc_no: string; doc_date: string | null; customer: string | null; customer_name: string | null; agent: string | null;
  doc_ref: string | null; item_code: string; description: string | null; uom: string; qty: number; unit_price: number; amount: number; discount: number;
  suom_qty: number | null; split: boolean; edited_at: string | null; edited_by_name: string | null;
};
type Draft = { qty: string; uom: string; unit_price: string; discount: string; amount: string };

const rm = (n: number) => n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (s: string) => Number(String(s).replace(/,/g, ""));
const dmy = (s: string | null) => (s ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "");
const inp = "w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-right text-sm";

/** One file from the import history: look at it, correct or remove lines, download it again. */
export function BatchView({ batch, canEdit, onClose, onChanged }: { batch: Batch; canEdit: boolean; onClose: () => void; onChanged: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [err, setErr] = useState("");
  const [doc, setDoc] = useState("");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<{ id: number; d: Draft } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("sap_import_lines").select("*").eq("batch_id", batch.id).order("sort", { ascending: true, nullsFirst: false }).order("id").range(0, 9999);
    if (error) setErr(error.message);
    setLines(((data ?? []) as Line[]).map((l) => ({ ...l, qty: Number(l.qty), unit_price: Number(l.unit_price), amount: Number(l.amount), discount: Number(l.discount), suom_qty: l.suom_qty == null ? null : Number(l.suom_qty) })));
  }, [batch.id]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async load, state is set after the await
  useEffect(() => { void load(); }, [load]);

  // Files made before 18 Nov kept only the figures, not the customer name, agent, PO reference or carton size.
  const incomplete = !!lines?.some((l) => l.customer_name == null || l.suom_qty == null);
  const docs = [...new Set((lines ?? []).map((l) => l.doc_no))];
  const shown = (lines ?? []).filter((l) => (!doc || l.doc_no === doc) && (!q || `${l.item_code} ${l.description ?? ""} ${l.customer_name ?? ""}`.toLowerCase().includes(q.toLowerCase())));
  const total = (lines ?? []).reduce((s, l) => s + l.amount, 0);

  function startEdit(l: Line) {
    setEdit({ id: l.id, d: { qty: String(l.qty), uom: l.uom, unit_price: String(l.unit_price), discount: l.discount ? l.discount.toFixed(2) : "0", amount: l.amount.toFixed(2) } });
  }
  // Changing quantity, unit, price or discount works the amount out again; the amount can still be typed over.
  function change(l: Line, k: keyof Draft, v: string) {
    if (!edit) return;
    const d = { ...edit.d, [k]: v };
    if (k !== "amount") {
      const a = lineAmount(num(d.qty), d.uom, num(d.unit_price), l.suom_qty ?? 0, num(d.discount));
      if (Number.isFinite(a)) d.amount = a.toFixed(2);
    }
    setEdit({ id: l.id, d });
  }
  async function save(l: Line) {
    if (!edit) return;
    const v = { qty: num(edit.d.qty), uom: edit.d.uom, unit_price: num(edit.d.unit_price), discount: num(edit.d.discount) || 0, amount: num(edit.d.amount) };
    if (![v.qty, v.unit_price, v.amount].every(Number.isFinite) || v.qty <= 0) { setErr("Quantity, price and amount must be numbers, and quantity above zero."); return; }
    setBusy(true); setErr("");
    const { error } = await supabase.from("sap_import_lines").update(v).eq("id", l.id);
    setBusy(false);
    if (error) { setErr(`Not saved. ${error.message}`); return; }
    setEdit(null); await load(); onChanged();
  }
  async function remove(l: Line) {
    if (!confirm(`Remove this line from "${batch.file_name}"?\n\n${l.doc_no}  ${l.item_code} ${l.description ?? ""}\n${l.qty} ${l.uom}, RM ${rm(l.amount)}\n\nThe file's totals update. This cannot be undone.`)) return;
    setBusy(true); setErr("");
    const { error } = await supabase.from("sap_import_lines").delete().eq("id", l.id);
    setBusy(false);
    if (error) { setErr(`Not removed. ${error.message}`); return; }
    await load(); onChanged();
  }
  async function download() {
    if (!lines?.length) return;
    const rows: FileRow[] = lines.map((l) => ({
      code: l.customer ?? "", customerName: l.customer_name ?? "", agent: l.agent ?? "", docNo: l.doc_no,
      docDate: l.doc_date ? new Date(`${l.doc_date}T00:00:00Z`) : null, docRef: l.doc_ref ?? "",
      itemCode: /^\d+$/.test(l.item_code) ? Number(l.item_code) : l.item_code, qty: l.qty, uom: l.uom as FileRow["uom"],
      unitPrice: l.unit_price, amount: l.amount, discount: l.discount, suomQty: l.suom_qty ?? 0,
    }));
    await writeImportFile(rows, `Invoice import ${(batch.doc_from ?? "").replace(/-/g, "") || batch.id} (${batch.file_name.replace(/\.xlsx$/i, "")}).xlsx`);
  }

  return (
    <Card className="mt-4" title={`File: ${batch.file_name}`} right={
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={download} disabled={!lines?.length || incomplete} className={`${btnPrimary} inline-flex items-center gap-2 !py-1.5 !text-sm`}><Download size={16} /> Download again</button>
        <button onClick={onClose} className={`${btnGhost} inline-flex items-center gap-2 !py-1.5 !text-sm`}><X size={16} /> Close</button>
      </div>}>
      <p className="text-sm text-slate-600">
        Made {new Date(batch.made_at).toLocaleString("en-MY", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })}{batch.made_by_name ? ` by ${batch.made_by_name}` : ""} · {batch.invoices} invoices · {lines?.length ?? batch.lines} lines · <b className="font-medium text-slate-800">RM {rm(lines ? total : Number(batch.net_total))}</b>
      </p>
      {incomplete && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">This file was made before full details were kept, so it has no customer name, agent, PO reference or carton size and cannot be downloaded again. To get a complete file, remove this record in Import history and upload the same SAP file again.</p>}
      {err && <p className="mt-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={doc} onChange={(e) => setDoc(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
          <option value="">All invoices ({docs.length})</option>
          {docs.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <label className="relative"><Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Item or customer" className="w-48 rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-sm" /></label>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200"><tr><Th first>Invoice</Th><Th>Customer</Th><Th>Item</Th><Th right>Qty</Th><Th>UOM</Th><Th right>Unit price</Th><Th right>Discount</Th><Th right>Amount</Th><Th right>Per carton</Th><Th /></tr></thead>
          <tbody>
            {lines === null && <tr><Td first className="text-slate-500">Loading…</Td></tr>}
            {lines && shown.length === 0 && <tr><Td first className="text-slate-500">No lines match.</Td></tr>}
            {shown.map((l) => {
              const e = edit?.id === l.id ? edit.d : null;
              return (
                <tr key={l.id} className={`border-b border-slate-100 ${e ? "bg-indigo-50/60" : l.split ? "bg-indigo-50/30" : ""}`}>
                  <Td first><div className="whitespace-nowrap">{l.doc_no}</div><div className="text-xs text-slate-500">{dmy(l.doc_date)}</div></Td>
                  <Td><div className="max-w-56 truncate" title={l.customer_name ?? ""}>{l.customer_name ?? l.customer ?? "–"}</div></Td>
                  <Td><span className="text-slate-500">{l.item_code}</span> {l.description ?? ""}{l.edited_at && <span className="ml-2" title={`Edited ${new Date(l.edited_at).toLocaleString("en-MY")}${l.edited_by_name ? ` by ${l.edited_by_name}` : ""}`}><Badge tone="amber">Edited</Badge></span>}</Td>
                  {e ? (
                    <>
                      <Td right><input value={e.qty} onChange={(x) => change(l, "qty", x.target.value)} className={`${inp} w-16`} inputMode="decimal" /></Td>
                      <Td><select value={e.uom} onChange={(x) => change(l, "uom", x.target.value)} className="rounded border border-slate-300 bg-white px-1 py-1 text-sm"><option>Ctn</option><option>Unit</option><option>Pack</option></select></Td>
                      <Td right><input value={e.unit_price} onChange={(x) => change(l, "unit_price", x.target.value)} className={`${inp} w-24`} inputMode="decimal" /></Td>
                      <Td right><input value={e.discount} onChange={(x) => change(l, "discount", x.target.value)} className={`${inp} w-20`} inputMode="decimal" /></Td>
                      <Td right><input value={e.amount} onChange={(x) => change(l, "amount", x.target.value)} className={`${inp} w-24 font-medium`} inputMode="decimal" /></Td>
                      <Td right>{l.suom_qty ?? "–"}</Td>
                      <Td right><div className="flex justify-end gap-2 whitespace-nowrap"><button onClick={() => save(l)} disabled={busy} className="rounded-md bg-indigo-600 px-2.5 py-1 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">Save</button><button onClick={() => setEdit(null)} className="text-sm text-slate-600 hover:underline">Cancel</button></div></Td>
                    </>
                  ) : (
                    <>
                      <Td right>{l.qty}</Td>
                      <Td><Badge tone={l.uom === "Ctn" ? "grey" : l.uom === "Pack" ? "amber" : "blue"}>{l.uom}</Badge></Td>
                      <Td right>{rm(l.unit_price)}</Td>
                      <Td right>{l.discount ? rm(l.discount) : "–"}</Td>
                      <Td right className="font-medium">{rm(l.amount)}</Td>
                      <Td right>{l.suom_qty ?? "–"}</Td>
                      <Td right>{canEdit && <div className="flex justify-end gap-1">
                        <button onClick={() => startEdit(l)} disabled={!!edit} title="Edit this line" className="rounded p-1 text-slate-400 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-30"><Pencil size={16} /></button>
                        <button onClick={() => remove(l)} disabled={!!edit || busy} title="Remove this line" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-30"><Trash2 size={16} /></button>
                      </div>}</Td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
