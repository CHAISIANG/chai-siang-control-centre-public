"use client";
import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Card, Td, Th } from "@/components/ui";
import { btnBlue, btnLine, field } from "@/components/hr/ui";
import { TAXES, type Category } from "@/lib/claims/rules";
import { useClaims } from "@/lib/claims/store";
import { useT } from "@/lib/i18n";

const cell = "w-full rounded border border-slate-300 bg-white px-2 py-1 text-sm";

export default function ClaimSettingsPage() {
  const { t } = useT();
  const { data, saveCategories, saveSettings, canAdmin } = useClaims();
  const person = (id: string) => data.staff.find((e) => e.id === id)!;
  const FINANCE = data.finance, DIRECTORS = data.directors, STAFF = data.staff;
  const [cats, setCats] = useState<Category[]>(data.categories.map((c) => ({ ...c })));
  const [s, setS] = useState(data.settings);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");
  async function save() {
    const a = await saveCategories(cats);
    if (!a.ok) { setErr(a.text); setSaved(false); return; }
    const b = await saveSettings(s);
    if (!b.ok) { setErr(b.text); setSaved(false); return; }
    setErr(""); setSaved(true);
  }
  const setCat = (code: string, patch: Partial<Category>) => { setCats((l) => l.map((c) => (c.code === code ? { ...c, ...patch } : c))); setSaved(false); };
  if (!canAdmin) return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">{t("Claim settings are for admins (HR, Finance or Management). Switch “Viewing as” above to Finance or Director to see them.")}</p>;
  const lbl = "text-sm font-medium text-slate-700";

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">{t("Claim settings")}</h1>
      <p className="text-slate-500">{t("Rules for expense claims. Checks warn the employee and the approvers; they never stop a claim being sent.")}</p>

      <Card className="mt-4" title={t("Expense categories")} right={<button onClick={() => setCats((l) => [...l, { code: `C${Date.now().toString(36).toUpperCase()}`, name: "", perItemLimit: null, monthlyBudget: null, receiptRequired: true, mileage: false, active: true }])} className={`${btnLine} !py-1.5 text-sm`}><Plus size={16} /> {t("Add category")}</button>}>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Name</Th><Th right>Limit per item (RM)</Th><Th right>Company budget a month (RM)</Th><Th>Receipt needed</Th><Th>In use</Th></tr></thead>
            <tbody>
              {cats.map((c) => (
                <tr key={c.code} className={`border-b border-slate-100 ${c.active ? "" : "opacity-50"}`}>
                  <Td first><input value={c.name} onChange={(e) => setCat(c.code, { name: e.target.value })} className={cell} placeholder={t("Category name")} aria-label={t("Category name")} />{c.mileage && <div className="mt-0.5 text-xs text-slate-500">{t("Paid per km, no receipt")}</div>}</Td>
                  <Td right><input type="number" min={0} value={c.perItemLimit ?? ""} placeholder={t("No limit")} onChange={(e) => setCat(c.code, { perItemLimit: e.target.value === "" ? null : Number(e.target.value) })} className={`${cell} w-28 text-right`} aria-label={`${t("Limit per item for")} ${c.name}`} disabled={c.mileage} /></Td>
                  <Td right><input type="number" min={0} value={c.monthlyBudget ?? ""} placeholder={t("No budget")} onChange={(e) => setCat(c.code, { monthlyBudget: e.target.value === "" ? null : Number(e.target.value) })} className={`${cell} w-28 text-right`} aria-label={`${t("Monthly budget for")} ${c.name}`} /></Td>
                  <Td><input type="checkbox" checked={c.receiptRequired} disabled={c.mileage} onChange={(e) => setCat(c.code, { receiptRequired: e.target.checked })} className="h-4 w-4" aria-label={`${t("Receipt needed for")} ${c.name}`} /></Td>
                  <Td><input type="checkbox" checked={c.active} onChange={(e) => setCat(c.code, { active: e.target.checked })} className="h-4 w-4" aria-label={`${c.name} ${t("in use")}`} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate-500">{t("A category no longer in use stays on old claims but cannot be picked for new ones.")}</p>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title={t("Limits and rates")}>
          <div className="grid grid-cols-2 gap-3">
            <label className={lbl}>{t("Monthly limit per person (RM)")}<input type="number" min={0} value={s.monthlyLimit} onChange={(e) => { setS({ ...s, monthlyLimit: Number(e.target.value) }); setSaved(false); }} className={field} /></label>
            <label className={lbl}>{t("Mileage rate (RM per km)")}<input type="number" min={0} step={0.01} value={s.mileageRate} onChange={(e) => { setS({ ...s, mileageRate: Number(e.target.value) }); setSaved(false); }} className={field} /></label>
          </div>
          <p className="mt-2 text-sm text-slate-500">{t("Going over the monthly limit is flagged, not blocked.")}</p>
          <h3 className="mt-4 text-sm font-semibold text-slate-900">{t("SST rates")}</h3>
          <ul className="mt-1 grid grid-cols-2 gap-x-4 text-sm text-slate-700">{TAXES.filter((x) => x.code !== "none").map((x) => <li key={x.code}>{t(x.label)}</li>)}</ul>
          <p className="mt-1 text-sm text-slate-500">{t("Staff pick the tax on each receipt; the SST inside the total is worked out for the SST report.")}</p>
        </Card>

        <Card title={t("Approval steps")}>
          <ol className="space-y-2 text-sm">
            {([["manager", t("1. Direct manager"), t("The person's manager in Employees. Skipped when someone has no manager.")], ["finance", t("2. Finance"), `${t("Checks receipts and amounts.")} ${t("Now")}: ${FINANCE.map((id) => person(id).name).join(", ")}.`], ["director", t("3. Director"), `${t("Final approval.")} ${t("Now")}: ${DIRECTORS.map((id) => person(id).name).join(", ")}.`]] as const).map(([k, ttl, d]) => (
              <li key={k} className="flex items-start gap-2">
                <input type="checkbox" checked={s.levels[k]} onChange={(e) => { setS({ ...s, levels: { ...s.levels, [k]: e.target.checked } }); setSaved(false); }} className="mt-0.5 h-4 w-4" aria-label={ttl} />
                <span><b className="font-medium text-slate-900">{ttl}</b><span className="block text-slate-500">{d}</span></span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-slate-500">{t("After the last approval, Finance pays. Nobody can approve their own claim; it goes to the next person at that step. Who is Finance or a Director comes from their login role in")} <Link href="/users" className="font-medium text-blue-600 hover:underline">{t("Users")}</Link>.</p>
          <p className="mt-1 text-sm text-slate-500">{t("Staff list")}: <Link href="/hr/admin/employees" className="font-medium text-blue-600 hover:underline">{t("Employees")}</Link> ({t("{n} in the sample", { n: STAFF.length })}).</p>
        </Card>
      </div>

      {err && <p role="alert" className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{t(err)}</p>}
      <div className="mt-4 flex items-center gap-3"><button onClick={save} disabled={cats.some((c) => !c.name.trim())} className={btnBlue}>{t("Save settings")}</button>{saved && <span role="status" className="text-sm text-emerald-700">{t("Saved. New claims use these rules; claims already sent keep their route.")}</span>}</div>
    </div>
  );
}
