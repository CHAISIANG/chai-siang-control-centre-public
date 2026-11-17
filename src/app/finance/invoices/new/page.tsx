"use client";
import InvoiceForm from "@/components/InvoiceForm";
import { useFinance } from "@/components/finance";

export default function NewInvoice() {
  const { canManage } = useFinance();
  if (!canManage) return <p className="rounded-xl border border-slate-200 bg-white shadow-sm p-6 text-slate-600">Your role can view invoices but not create them.</p>;
  return <InvoiceForm />;
}
