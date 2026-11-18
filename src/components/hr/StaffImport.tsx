"use client";
import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { Modal, btnBlue, btnLine } from "@/components/hr/ui";
import { useHr } from "@/lib/hr/store";

const HEAD = ["Employee code", "Full name", "Position", "Department", "Gender (F/M)", "State", "Date joined (YYYY-MM-DD)", "Manager code", "Access (employee/manager/hr)", "Email (login)", "Phone", "Still working (Y/N)"];
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const str = (v: unknown) => (v == null ? "" : String(v).trim());

function toIso(v: unknown): string {
  if (v instanceof Date) return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`;
  const s = str(v);
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // 12/06/2023, day first as in Malaysia
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

type Row = Record<string, unknown> & { code: string; name: string };

/** Add or update many staff at once from the Excel template. Matched by employee code; a blank cell keeps nothing out. */
export function StaffImport({ onDone }: { onDone: (t: string) => void }) {
  const { data, importStaff, live } = useHr();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function template() {
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    const head = (t: string) => ({ value: t, fontWeight: "bold" as const, backgroundColor: "#fff3bf" });
    const code = (id: string | null) => data.employees.find((e) => e.id === id)?.code ?? "";
    const body = data.employees.map((e) => [e.code, e.name, e.position, e.dept, e.gender, e.state, e.joined, code(e.managerId), e.role, e.email, e.phone, e.active ? "Y" : "N"].map((value) => ({ value })));
    await writeExcelFile([{ sheet: "Staff", columns: HEAD.map((h) => ({ width: h.length > 14 ? 24 : 16 })), data: [HEAD.map(head), ...body] }]).toFile("staff-template.xlsx");
  }

  async function read(f: File | undefined) {
    if (!f) return;
    const { readSheet } = await import("read-excel-file/browser");
    const sheet = (await readSheet(f)) as unknown[][];
    const hi = sheet.findIndex((r) => r.some((c) => norm(c) === "employeecode"));
    if (hi < 0) { setProblems(['The column "Employee code" was not found. Use the downloaded template.']); setRows([]); return; }
    const h = sheet[hi].map(norm);
    const col = (start: string) => h.findIndex((x) => x.startsWith(norm(start)));
    const c = { code: col("Employee code"), name: col("Full name"), position: col("Position"), dept: col("Department"), gender: col("Gender"), state: col("State"), joined: col("Date joined"), manager: col("Manager code"), access: col("Access"), email: col("Email"), phone: col("Phone"), active: col("Still working") };
    const out: Row[] = [], bad: string[] = [];
    const codes = new Set([...data.employees.map((e) => e.code.toUpperCase())]);
    sheet.slice(hi + 1).forEach((r, i) => {
      const line = hi + i + 2, code = str(r[c.code]).toUpperCase();
      if (!code) return;
      codes.add(code);
      const g = str(r[c.gender]).toUpperCase().slice(0, 1), joined = toIso(r[c.joined]), access = str(r[c.access]).toLowerCase() || "employee", email = str(r[c.email]);
      if (!str(r[c.name])) bad.push(`Row ${line} (${code}): full name is empty.`);
      if (g !== "F" && g !== "M") bad.push(`Row ${line} (${code}): gender must be F or M.`);
      if (!joined) bad.push(`Row ${line} (${code}): date joined is missing or not a date.`);
      if (!["employee", "manager", "hr"].includes(access)) bad.push(`Row ${line} (${code}): access must be employee, manager or hr.`);
      if (email && !/\S+@\S+\.\S+/.test(email)) bad.push(`Row ${line} (${code}): email looks wrong.`);
      out.push({ code, name: str(r[c.name]), position: str(r[c.position]), dept: str(r[c.dept]), gender: g, state: str(r[c.state]) || "Selangor", joined, manager_code: str(r[c.manager]).toUpperCase(), hr_role: access, email, phone: str(r[c.phone]), active: !/^n/i.test(str(r[c.active])) });
    });
    out.forEach((r) => { if (r.manager_code && !codes.has(String(r.manager_code))) bad.push(`${r.code}: manager code ${r.manager_code} is not in the file or the staff list.`); });
    const dup = out.map((r) => r.code).filter((x, i, a) => a.indexOf(x) !== i);
    if (dup.length) bad.push(`Employee code used twice: ${[...new Set(dup)].join(", ")}.`);
    setRows(out); setProblems(bad);
  }

  async function save() {
    if (!rows) return;
    setBusy(true);
    const r = await importStaff(rows);
    setBusy(false);
    if (r.ok) { setRows(null); onDone(r.text); } else setProblems([r.text]);
  }

  const known = new Set(data.employees.map((e) => e.code.toUpperCase()));
  return (
    <>
      <button onClick={template} className={`${btnLine} !py-2 text-sm`}><Download size={16} /> Staff template</button>
      <button onClick={() => input.current?.click()} className={`${btnLine} !py-2 text-sm`}><FileUp size={16} /> Import from Excel</button>
      <input ref={input} type="file" accept=".xlsx" className="hidden" onChange={(e) => { void read(e.target.files?.[0]); e.target.value = ""; }} />
      {rows && (
        <Modal title="Check before importing" onClose={() => setRows(null)}>
          <p className="text-sm text-slate-700">{rows.length} rows: {rows.filter((r) => !known.has(r.code)).length} new, {rows.filter((r) => known.has(r.code)).length} updates to people already on file.</p>
          {!live && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This is the sample: importing works once HR is connected to the database.</p>}
          {problems.length > 0
            ? <ul className="mt-3 max-h-60 list-disc space-y-0.5 overflow-y-auto pl-5 text-sm text-rose-800">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            : <ul className="mt-3 max-h-60 overflow-y-auto text-sm text-slate-600">{rows.slice(0, 40).map((r) => <li key={r.code}>{r.code} · {r.name} · {String(r.position)}{r.manager_code ? ` · reports to ${r.manager_code}` : ""}</li>)}</ul>}
          <p className="mt-3 text-xs text-slate-500">Logins are separate: each person signs in with the email given here, and their record links by itself.</p>
          <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => setRows(null)} className={btnLine}>Cancel</button><button disabled={problems.length > 0 || !rows.length || busy} onClick={save} className={btnBlue}>{busy ? "Importing…" : `Import ${rows.length}`}</button></div>
        </Modal>
      )}
    </>
  );
}
