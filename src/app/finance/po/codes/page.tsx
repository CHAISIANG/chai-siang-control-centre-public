"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { Card, PageHeader, Td, Th } from "@/components/ui";
import { btnGhost, btnPrimary, Field, inputCls } from "@/components/finui";
import { usePo } from "@/components/po";
import { rmFmt } from "@/lib/po";

const blank = { id: undefined as string | undefined, custCode: "", barcode: "", ourCode: "", desc: "", pack: 24, ctnPrice: 0 };

export default function ItemCodes() {
  const { clients, itemCodes, saveItemCode, removeItemCode, canManage } = usePo();
  const [clientId, setClientId] = useState("");
  const [q, setQ] = useState("");
  const [d, setD] = useState(blank);
  const [err, setErr] = useState<string | null>(null);
  const shown = itemCodes.filter((m) => m.clientId === clientId && (!q || [m.custCode, m.barcode, m.ourCode, m.desc].join(" ").toLowerCase().includes(q.toLowerCase())));

  async function save() {
    if (!clientId) return setErr("Choose the customer first.");
    if (!d.custCode.trim() || !d.ourCode.trim()) return setErr("Enter the customer's code and our code.");
    if (!(d.pack > 0) || !Number.isInteger(d.pack)) return setErr("Enter how many units are in a carton.");
    if (!(d.ctnPrice >= 0)) return setErr("Enter the agreed price per carton.");
    if (itemCodes.some((m) => m.clientId === clientId && m.id !== d.id && m.custCode.trim().toLowerCase() === d.custCode.trim().toLowerCase())) return setErr("This customer code is already in the list.");
    const e = await saveItemCode({ ...d, clientId });
    setErr(e);
    if (!e) setD(blank);
  }

  return (
    <>
      <Link href="/finance/po" className="mb-3 inline-flex items-center gap-1 text-sm text-indigo-700 hover:underline"><ArrowLeft size={16} /> PO & delivery tracking</Link>
      <PageHeader title="Customer item codes" sub="Each customer uses their own item codes. This list ties them to ours, with the carton size and the agreed price." />
      <div className="mb-4 max-w-sm"><Field label="Customer"><select className={inputCls} value={clientId} onChange={(e) => { setClientId(e.target.value); setD(blank); setErr(null); }}><option value="">Choose customer</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select></Field></div>
      {clientId && (
        <Card title="Items" right={<input placeholder="Search" aria-label="Search item codes" value={q} onChange={(e) => setQ(e.target.value)} className="w-44 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm" />}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200"><tr><Th first>Their code</Th><Th>Barcode</Th><Th>Our code</Th><Th>Item</Th><Th right>Per carton</Th><Th right>Agreed price / carton</Th>{canManage && <Th />}</tr></thead>
              <tbody>
                {shown.length === 0 && <tr><Td first className="text-slate-500">{itemCodes.some((m) => m.clientId === clientId) ? "No items match." : "No items yet for this customer."}</Td></tr>}
                {shown.map((m) => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <Td first className="font-medium text-slate-900">{m.custCode}</Td><Td>{m.barcode}</Td><Td>{m.ourCode}</Td><Td className="!whitespace-normal">{m.desc}</Td><Td right>{m.pack}</Td><Td right>{rmFmt(m.ctnPrice)}</Td>
                    {canManage && <Td right>
                      <button aria-label={`Edit ${m.custCode}`} onClick={() => { setD({ id: m.id, custCode: m.custCode, barcode: m.barcode, ourCode: m.ourCode, desc: m.desc, pack: m.pack, ctnPrice: m.ctnPrice }); setErr(null); }} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Pencil size={16} /></button>
                      <button aria-label={`Remove ${m.custCode}`} onClick={async () => setErr(await removeItemCode(m.id!))} className="rounded p-1.5 text-slate-500 hover:bg-slate-100"><Trash2 size={16} /></button>
                    </Td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canManage && (
            <div className="space-y-2 border-t border-slate-100 p-4">
              <div className="text-sm font-medium text-slate-600">{d.id ? "Edit item" : "Add an item"}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
                <input aria-label="Their code" placeholder="Their code" className={`${inputCls} !mt-0`} value={d.custCode} onChange={(e) => setD({ ...d, custCode: e.target.value })} />
                <input aria-label="Barcode" placeholder="Barcode" className={`${inputCls} !mt-0`} value={d.barcode} onChange={(e) => setD({ ...d, barcode: e.target.value })} />
                <input aria-label="Our code" placeholder="Our code" className={`${inputCls} !mt-0`} value={d.ourCode} onChange={(e) => setD({ ...d, ourCode: e.target.value })} />
                <input aria-label="Item name" placeholder="Item name" className={`${inputCls} !mt-0`} value={d.desc} onChange={(e) => setD({ ...d, desc: e.target.value })} />
                <input aria-label="Units per carton" type="number" min={1} className={`${inputCls} !mt-0`} value={d.pack} onChange={(e) => setD({ ...d, pack: Number(e.target.value) })} />
                <input aria-label="Agreed price per carton" type="number" step="0.01" min={0} className={`${inputCls} !mt-0`} value={d.ctnPrice} onChange={(e) => setD({ ...d, ctnPrice: Number(e.target.value) })} />
              </div>
              {err && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</p>}
              <div className="flex gap-2"><button onClick={save} className={btnPrimary}>{d.id ? "Save changes" : "Add item"}</button>{d.id && <button onClick={() => { setD(blank); setErr(null); }} className={btnGhost}>Cancel</button>}</div>
            </div>
          )}
          {!canManage && err && <p role="alert" className="border-t border-slate-100 p-4 text-sm text-rose-800">{err}</p>}
        </Card>
      )}
    </>
  );
}
