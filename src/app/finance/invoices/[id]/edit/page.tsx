"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import InvoiceForm from "@/components/InvoiceForm";
import { useFinance } from "@/components/finance";

export default function EditInvoice() {
  const { id } = useParams<{ id: string }>();
  const { invoices, canManage } = useFinance();
  const inv = invoices.find((i) => i.id === id);
  if (!inv) return <p className="text-slate-500">Invoice not found. <Link href="/finance/invoices" className="text-indigo-600 underline">Back to invoices</Link></p>;
  if (!canManage) return <p className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 text-slate-600">Your role can view invoices but not edit them.</p>;
  if (inv.status === "paid" || inv.status === "void") return <p className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 text-slate-600">A {inv.status} invoice cannot be edited. <Link href={`/finance/invoices/${inv.id}`} className="text-indigo-600 underline">Back to {inv.invoice_no}</Link></p>;
  return <InvoiceForm invoice={inv} />;
}
