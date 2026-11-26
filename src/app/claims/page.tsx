"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, FileText, ImagePlus, Paperclip, Plus, Printer, Trash2, UploadCloud, X } from "lucide-react";
import { useRole } from "@/components/role";
import { useAuth } from "@/components/auth";
import { SignCard, useCustomerSign } from "@/components/paf/CustomerSign";
import { SubmitPreview } from "@/components/paf/SubmitPreview";
import { ClaimInvoices, type InvoicePod, type Lookup } from "@/components/paf/ClaimInvoices";
import { DEFAULT_PLACEMENT, fixPlacement } from "@/lib/paf/stamp";
import { useData, type ClaimFile } from "@/components/data";
import PafFill from "@/components/PafFill";
import PafSheet, { toDisplayDate } from "@/components/PafSheet";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { rm, type Claim, type ClaimStatus } from "@/lib/mock";
import { supabase } from "@/lib/supabase";
import { blankValues, checkboxCells, FORMS, lastNum, NEW_FORM_KEYS, recompute, reTypeBoxes, signatureCells, type FormKey, type Values } from "@/lib/paf";

const tone: Record<ClaimStatus, "grey" | "amber" | "blue" | "green" | "red"> = {
  Draft: "grey", "Pending supervisor": "amber", "Pending Colgate": "blue", "Approved by Colgate": "green", Paid: "green", Returned: "red",
};
const flow: ClaimStatus[] = ["Draft", "Pending supervisor", "Pending Colgate", "Approved by Colgate", "Paid"];
// Until the next person has approved, the people before them can still change the claim.
const SALESMAN_EDITS: ClaimStatus[] = ["Draft", "Returned", "Pending supervisor"];
const SUPERVISOR_EDITS: ClaimStatus[] = ["Draft", "Returned", "Pending supervisor", "Pending Colgate"];
type ClaimEvent = { at: string; actor_name: string | null; action: string; note: string | null };
const fmtAt = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Item = { key: string; name: string; url?: string; file?: File; path?: string | null; fileId?: number };

const outletName = (name: string, code: string | null) => (code ? `${name} - ${code.slice(-5)}` : name);
const safeName = (n: string) => n.replace(/[^\w.\-]+/g, "_");
const today = () => toDisplayDate(new Date().toISOString().slice(0, 10));

export default function Claims() {
  const { filterSalesman, can } = useRole();
  const { claims, claimFiles, reloadClaims } = useData();
  const [filter, setFilter] = useState<ClaimStatus | "All">("All");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const mine = claims.filter((c) => !filterSalesman || c.salesmanCode === filterSalesman);
  const rows = mine.filter((c) => filter === "All" || c.status === filter);
  const canCreate = can("claims_create");
  const selected = open ? claims.find((c) => c.id === open) ?? null : null;
  const count = (c: Claim) => claimFiles.filter((f) => f.claimId === c.id).length;

  return (
    <>
      <PageHeader title="Claims · PAF Forms" sub="Fill the form on screen and attach photos. The supervisor checks it, then Colgate gives the final approval. Print in the same layout as your Excel template"
        right={canCreate ? <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"><Plus size={16} /> New claim</button> : undefined} />
      <div className="mb-4 flex flex-wrap gap-2">
        {(["All", ...flow, "Returned"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${filter === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>
            {s} {s !== "All" && <span className="opacity-60">({mine.filter((c) => c.status === s).length})</span>}
          </button>
        ))}
      </div>

      <Card>
        <ul className="space-y-3 sm:hidden">
          {rows.map((c) => (
            <li key={c.id}>
              <button onClick={() => setOpen(c.id)} className="w-full rounded-lg border border-slate-200 p-3 text-left active:bg-slate-50">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-base text-slate-900">{c.id}</b>
                  <Badge tone={tone[c.status]}>{c.status}</Badge>
                </div>
                <div className="mt-1 text-base text-slate-700">{c.customer}</div>
                <div className="text-sm text-slate-500">{FORMS[c.formKey].label}, {c.salesman}, {c.submitted}</div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-display text-2xl font-semibold text-slate-900">{rm(c.amount)}</span>
                  <span className="inline-flex items-center gap-1 text-sm text-slate-500"><Paperclip size={14} />{count(c)}</span>
                </div>
              </button>
            </li>
          ))}
          {!rows.length && <li className="text-slate-500">No claims yet.{canCreate ? " Use New claim to add the first one." : ""}</li>}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Claim</Th><Th>Form</Th><Th>Customer</Th><Th>Salesman</Th><Th right>Amount</Th><Th>Status</Th><Th>Files</Th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} onClick={() => setOpen(c.id)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <Td first><b>{c.id}</b><div className="text-sm text-slate-500">{c.submitted}</div></Td>
                  <Td>{FORMS[c.formKey].label}</Td>
                  <Td>{c.customer}</Td>
                  <Td>{c.salesman}</Td>
                  <Td right>{rm(c.amount)}</Td>
                  <Td><Badge tone={tone[c.status]}>{c.status}</Badge></Td>
                  <Td><span className="inline-flex items-center gap-1 text-xs text-slate-500"><Paperclip size={12} />{count(c)}</span></Td>
                </tr>
              ))}
              {!rows.length && <tr><Td>No claims yet.{canCreate ? " Use New claim to add the first one." : ""}</Td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {(creating || selected) && (
        <ClaimModal
          key={creating ? "new" : selected!.id}
          claim={creating ? null : selected}
          files={creating ? [] : claimFiles.filter((f) => f.claimId === selected!.id)}
          onClose={() => { setOpen(null); setCreating(false); }}
          onChanged={async () => { await reloadClaims(); }}
        />
      )}
    </>
  );
}

function ClaimModal({ claim, files, onClose, onChanged }: { claim: Claim | null; files: ClaimFile[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const { can, role, salesmanCode: mySalesman } = useRole();
  const { profile } = useAuth();
  const { customers, salesmen } = useData();
  const seesAll = can("view_all_data");
  const isNew = claim === null;

  const [formKey, setFormKey] = useState<FormKey>(claim?.formKey ?? "fixed");
  const [customer, setCustomer] = useState(claim?.customer ?? "");
  const [customerCode, setCustomerCode] = useState<string | null>(claim?.customerCode ?? null);
  const [salesmanCode, setSalesmanCode] = useState<string | null>(claim?.salesmanCode ?? (seesAll ? salesmen[0]?.code ?? null : mySalesman));
  const status: ClaimStatus = claim?.status ?? "Draft";
  const [remark, setRemark] = useState(claim?.remark ?? "");
  const [values, setValues] = useState<Values>(() => {
    if (claim && Object.keys(claim.values).length) return recompute(FORMS[claim.formKey], claim.values); // refreshes line numbers, Cost % and the fixed name on older claims
    const def = FORMS[claim?.formKey ?? "fixed"];
    const v = blankValues(def);
    const sig = signatureCells(def.layout);
    const sm = salesmen.find((s) => s.code === (claim?.salesmanCode ?? (seesAll ? salesmen[0]?.code : mySalesman)));
    v[sig.name[1]] = (sm?.name ?? "").toUpperCase();
    v[sig.date[1]] = today();
    return recompute(def, v);
  });
  const [photos, setPhotos] = useState<Item[]>(() => files.filter((f) => f.kind === "photo").map((f) => ({ key: `f${f.id}`, name: f.name, path: f.path, fileId: f.id })));
  const [docs, setDocs] = useState<Item[]>(() => files.filter((f) => f.kind === "document").map((f) => ({ key: `f${f.id}`, name: f.name, path: f.path, fileId: f.id })));
  const [invoices, setInvoices] = useState<InvoicePod[]>(() => files.filter((f) => f.kind === "pod" && f.invoiceNo).map((f) => ({ docNo: f.invoiceNo!, date: f.invoiceDate ?? "", amount: f.invoiceAmount ?? 0, podFile: f.name, path: f.path, fileId: f.id })));
  const [removed, setRemoved] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const docInput = useRef<HTMLInputElement>(null);

  const def = FORMS[formKey];
  const isMine = seesAll || claim?.salesmanCode === mySalesman;
  // Who can still change the claim: the salesman until the supervisor acts, the supervisor until Colgate approves.
  const editable = isNew ? can("claims_create") : (can("claims_approve") && SUPERVISOR_EDITS.includes(status)) || (can("claims_edit_draft") && isMine && SALESMAN_EDITS.includes(status));
  const canSubmit = editable && (isNew || status === "Draft" || status === "Returned");
  const [editing, setEditing] = useState(false);
  // Submit first shows the whole claim to check; it is only sent when the salesman confirms there.
  const [previewing, setPreviewing] = useState(false);
  const [drag, setDrag] = useState(false);
  const canApprove = !isNew && can("claims_approve") && status === "Pending supervisor";
  const isPrincipal = role === "principal";
  const canFinal = !isNew && isPrincipal && status === "Pending Colgate";
  const canReturn = !isNew && ((can("claims_approve") && (status === "Pending supervisor" || status === "Pending Colgate")) || canFinal);
  const canPullBack = !isNew && editable && status === "Pending supervisor";
  const canPay = !isNew && can("claims_pay") && status === "Approved by Colgate";
  const canDelete = !isNew && editable;
  const [asking, setAsking] = useState<null | "return" | "delete">(null);
  const [reason, setReason] = useState("");
  const [events, setEvents] = useState<ClaimEvent[]>([]);
  // The Customer representative name on the form always follows the customer chosen above.
  const custNameCell = signatureCells(def.layout).name[0];
  const sigCells = signatureCells(def.layout);
  const approvedByColgate = !!claim && (status === "Approved by Colgate" || status === "Paid") && !!claim.principalName;
  const shownValues = useMemo(() => {
    // the customer's chop goes in the Customer box, so the customer's name is not written there
    const v = { ...values, [custNameCell]: "" };
    // The Colgate representative box shows who approved and when.
    if (approvedByColgate && claim) { v[sigCells.name[3]] = claim.principalName.toUpperCase(); v[sigCells.date[3]] = toDisplayDate(claim.principalOn); }
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, custNameCell, approvedByColgate, claim?.principalName, claim?.principalOn]);
  // The customer's chop and signature. A claim made after this rule cannot go on without them.
  const needsSign = isNew || claim?.signRequired !== false;
  const savedSign = claim?.sign ? { customerCode: claim.customerCode ?? "", signaturePath: claim.sign.signaturePath, chopPath: claim.sign.chopPath, placement: fixPlacement({ ...DEFAULT_PLACEMENT, ...claim.sign.placement }), signerName: claim.sign.signerName, signedAt: claim.sign.signedAt, by: claim.sign.by } : null;
  const csign = useCustomerSign({ customerCode: customerCode ?? "", values: shownValues, dateCell: sigCells.date[0], onDate: (iso) => setValue(sigCells.date[0], toDisplayDate(iso)), by: profile?.full_name ?? "Salesman", saved: savedSign, useLibrary: editable });
  const total = lastNum(values.H37);
  // A claim can only be for a customer appointed to the salesman. The list is theirs alone, and typing a name that is not on it is not accepted.
  const myCustomers = useMemo(() => customers.filter((c) => !!salesmanCode && c.salesman === salesmanCode), [customers, salesmanCode]);
  const customerOk = (!!customerCode && myCustomers.some((c) => c.code === customerCode)) || (!isNew && !!claim && customer === claim.customer && !!customer);
  const ticked = useMemo(() => checkboxCells(def.layout).some((b) => values[b.box] === "X"), [def, values]);
  const lineRows = Array.from({ length: def.lines.rows[1] - def.lines.rows[0] + 1 }, (_, i) => def.lines.rows[0] + i);
  const hasLine = lineRows.some((r) => lastNum(values[`${def.lines.cols.cost ?? def.lines.cols.sell ?? "I"}${r}`]) > 0 || (def.lines.cols.desc && (values[`${def.lines.cols.desc}${r}`] ?? "").trim() !== ""));
  const checklist: { ok: boolean; text: string }[] = [
    { ok: customerOk, text: "Customer chosen from your own customers" },
    { ok: !!values.I7 && !!values.O7, text: "Start and end dates filled in" },
    { ok: ticked, text: "At least one box ticked (RE type, category or promotion type)" },
    { ok: hasLine, text: "At least one line with a description or an amount" },
    ...(def.key.startsWith("pkg") ? [{ ok: (() => { const b = reTypeBoxes(def.layout); return (!!b.lp && values[b.lp] === "X") || (!!b.ws && values[b.ws] === "X"); })(), text: "Package Buy: RE type LP or WS ticked" }] : []),
    ...(needsSign ? [{ ok: csign.signed, text: "Customer chop and signature" }] : []),
    ...(def.photoBox ? [{ ok: photos.length > 0, text: "A photo of the display is attached" }] : []),
  ];
  const custLabel = (c: { name: string; code: string }) => `${c.name} (${c.code})`;
  const custInput = useMemo(() => { const c = customers.find((x) => x.code === customerCode); return c && customer === c.name ? custLabel(c) : customer; }, [customers, customerCode, customer]);

  // Signed links for photos already saved in storage.
  useEffect(() => {
    const paths = photos.filter((p) => p.path && !p.url).map((p) => p.path as string);
    if (!paths.length) return;
    let active = true;
    supabase.storage.from("claim-files").createSignedUrls(paths, 3600).then(({ data }) => {
      if (!active || !data) return;
      setPhotos((prev) => prev.map((p) => (p.path && !p.url ? { ...p, url: data.find((d) => d.path === p.path)?.signedUrl ?? undefined } : p)));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Signed links for the delivery proofs already on the claim.
  useEffect(() => {
    const paths = invoices.filter((i) => i.path && !i.podUrl).map((i) => i.path as string);
    if (!paths.length) return;
    let active = true;
    supabase.storage.from("claim-files").createSignedUrls(paths, 3600).then(({ data }) => {
      if (!active || !data) return;
      setInvoices((prev) => prev.map((i) => (i.path && !i.podUrl ? { ...i, podUrl: data.find((d) => d.path === i.path)?.signedUrl ?? undefined } : i)));
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A delivered invoice of this customer: the database checks it, then its POD scan is fetched to go with the claim. */
  async function findPod(doc: string, cust: string): Promise<Lookup> {
    const { data, error: e } = await supabase.rpc("claim_invoice_pod", { p_doc: doc, p_customer: cust });
    if (e) return { ok: false, text: e.message.replace(/^.*?ERROR:\s*/, "") };
    const r = ((data ?? []) as { doc_no: string; doc_date: string | null; amount: number; pod_path: string; pod_file: string | null }[])[0];
    if (!r) return { ok: false, text: `Invoice ${doc} was not found.` };
    const dl = await supabase.storage.from("pod-scans").download(r.pod_path);
    if (dl.error || !dl.data) return { ok: false, text: "The POD scan could not be opened. Ask the warehouse to check it." };
    const name = r.pod_file || r.pod_path.split("/").pop() || `POD_${r.doc_no}.pdf`;
    const file = new File([dl.data], name, { type: dl.data.type || "application/pdf" });
    return { ok: true, item: { docNo: r.doc_no, date: r.doc_date ?? "", amount: Number(r.amount), podFile: name, podUrl: URL.createObjectURL(file), file } };
  }
  /** Taking an invoice off the claim also takes its POD off (a saved one is deleted when the claim is saved). */
  function changeInvoices(next: InvoicePod[]) {
    const gone = invoices.filter((i) => !next.some((n) => n.docNo === i.docNo) && i.fileId);
    if (gone.length) setRemoved((r) => [...r, ...gone.map((i) => ({ key: `pod${i.fileId}`, name: i.podFile, path: i.path, fileId: i.fileId }))]);
    setInvoices(next);
  }

  // History of the claim: who did what and when.
  useEffect(() => {
    if (!claim) return;
    let active = true;
    supabase.from("claim_events").select("at, actor_name, action, note").eq("claim_id", claim.id).order("at", { ascending: true }).then(({ data }) => { if (active) setEvents((data ?? []) as ClaimEvent[]); });
    return () => { active = false; };
  }, [claim]);

  const setValue = (a: string, v: string) => setValues((p) => recompute(def, { ...p, [a]: v }));

  function changeForm(k: FormKey) {
    const nd = FORMS[k];
    const od = signatureCells(def.layout), ns = signatureCells(nd.layout);
    const v = blankValues(nd);
    v.G9 = values.G9 ?? ""; v.I7 = values.I7 ?? ""; v.O7 = values.O7 ?? "";
    v[ns.name[1]] = values[od.name[1]] ?? ""; v[ns.date[1]] = values[od.date[1]] ?? "";
    setFormKey(k);
    setValues(recompute(nd, v));
  }

  function pickCustomer(label: string) {
    const c = customers.find((x) => custLabel(x) === label);
    if (c) { setCustomer(c.name); setCustomerCode(c.code); setValue("G9", outletName(c.name, c.code)); }
    else { setCustomer(label); setCustomerCode(null); }
  }

  function changeSalesman(code: string) {
    setSalesmanCode(code);
    const cur = customers.find((c) => c.code === customerCode);
    if (cur && cur.salesman !== code) { setCustomer(""); setCustomerCode(null); setValue("G9", ""); }
    const sm = salesmen.find((s) => s.code === code);
    setValue(signatureCells(def.layout).name[1], (sm?.name ?? "").toUpperCase());
  }

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const next = Array.from(list).slice(0, Math.max(0, 6 - photos.length)).map((f) => ({ key: `n${Date.now()}${f.name}`, name: f.name, file: f, url: URL.createObjectURL(f) }));
    setPhotos((p) => [...p, ...next]);
    if (photoInput.current) photoInput.current.value = "";
  }
  function addAny(list: FileList | File[] | null) {
    if (!list) return;
    const arr = Array.from(list);
    const imgs = arr.filter((f) => f.type.startsWith("image/")), other = arr.filter((f) => !f.type.startsWith("image/"));
    if (imgs.length) setPhotos((p) => [...p, ...imgs.slice(0, Math.max(0, 6 - p.length)).map((f) => ({ key: `n${Date.now()}${f.name}`, name: f.name, file: f, url: URL.createObjectURL(f) }))]);
    if (other.length) setDocs((p) => [...p, ...other.map((f) => ({ key: `n${Date.now()}${f.name}`, name: f.name, file: f }))]);
  }
  function addDocs(list: FileList | null) {
    if (!list) return;
    setDocs((p) => [...p, ...Array.from(list).map((f) => ({ key: `n${Date.now()}${f.name}`, name: f.name, file: f }))]);
    if (docInput.current) docInput.current.value = "";
  }

  async function save(submit: boolean) {
    setBusy(true); setError(null);
    try {
      const amount = lastNum(values.H37) || lastNum(values[def.totalCell ?? "H37"]);
      const salesmanName = salesmen.find((x) => x.code === salesmanCode)?.name ?? claim?.salesman ?? null;
      // The status is never written here: it only moves through the approval buttons.
      const row = { form_key: formKey, customer_code: customerCode, customer_name: customer, salesman_code: salesmanCode, salesman_name: salesmanName, amount, remark, form_values: shownValues, updated_at: new Date().toISOString() };
      let id = claim?.id ?? "";
      if (isNew) {
        const { data, error: e } = await supabase.from("claims").insert({ ...row, status: "Draft" }).select("id").single();
        if (e) throw e;
        id = data.id as string;
      } else {
        const { error: e } = await supabase.from("claims").update(row).eq("id", id);
        if (e) throw e;
      }
      for (const r of removed) {
        if (r.path) await supabase.storage.from("claim-files").remove([r.path]);
        if (r.fileId) await supabase.from("claim_files").delete().eq("id", r.fileId);
      }
      for (const [kind, list] of [["photo", photos], ["document", docs]] as const) {
        for (const it of list.filter((x) => x.file)) {
          const path = `${id}/${Date.now()}-${safeName(it.name)}`;
          const up = await supabase.storage.from("claim-files").upload(path, it.file!);
          if (up.error) throw up.error;
          const ins = await supabase.from("claim_files").insert({ claim_id: id, kind, file_name: it.name, storage_path: path });
          if (ins.error) throw ins.error;
        }
      }
      for (const it of invoices.filter((x) => x.file)) {
        const path = `${id}/pod-${Date.now()}-${safeName(it.podFile)}`;
        const up = await supabase.storage.from("claim-files").upload(path, it.file!);
        if (up.error) throw up.error;
        const ins = await supabase.from("claim_files").insert({ claim_id: id, kind: "pod", file_name: it.podFile, storage_path: path, invoice_no: it.docNo, invoice_date: it.date || null, invoice_amount: it.amount });
        if (ins.error) throw ins.error;
      }
      // A new customer signature goes onto the claim now that the claim exists and holds the final values.
      const signProblem = await csign.commit(id);
      if (signProblem) throw new Error(`The customer's signature could not be saved: ${signProblem}`);
      if (submit) {
        // Files are attached first; then the claim goes to the supervisor.
        const fin = await supabase.rpc("claim_action", { p_id: id, p_action: "submit" });
        if (fin.error) throw fin.error;
      }
      await onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Could not save.");
    }
    setBusy(false);
  }

  async function decide(action: "pull_back" | "supervisor_approve" | "return" | "principal_approve" | "mark_paid", note?: string) {
    setBusy(true); setError(null);
    const { error: e } = await supabase.rpc("claim_action", { p_id: claim!.id, p_action: action, p_note: note ?? null });
    if (e) { setError(e.message); setBusy(false); return; }
    await onChanged();
    onClose();
  }

  async function remove() {
    setBusy(true); setError(null);
    try {
      // Attached files go first; the claim and its history entry follow. Who deleted it stays in the history log.
      const paths = [...photos, ...docs, ...invoices.map((i) => ({ path: i.path }))].map((x) => x.path).filter((x): x is string => !!x);
      if (paths.length) { const r = await supabase.storage.from("claim-files").remove(paths); if (r.error) throw r.error; }
      const { error: e } = await supabase.from("claims").delete().eq("id", claim!.id);
      if (e) throw e;
      await onChanged();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : (e as { message?: string }).message ?? "Could not delete.");
      setBusy(false);
    }
  }

  return (
    <div className="paf-modal-root fixed inset-0 z-50 overflow-auto bg-slate-900/60 p-3 sm:p-6">
      <div className="mx-auto max-w-[1400px] rounded-xl bg-white shadow-2xl">
        <div className="no-print sticky top-0 z-30 flex flex-wrap items-center gap-2 rounded-t-xl border-b border-slate-200 bg-white px-4 py-3">
          <FileText size={18} className="text-indigo-600" />
          <div className="mr-2">
            <div className="text-sm font-semibold text-slate-900">{claim?.id ?? "New claim"} · {def.label}</div>
            <div className="text-xs text-slate-500">{customer || "Choose a customer"} · total {rm(total)}</div>
          </div>
          <Badge tone={tone[status]}>{status}</Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            
            <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"><Printer size={14} /> Print / PDF</button>
            {editable && (
              <>
                <button disabled={busy || !customerOk} onClick={() => void save(false)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">{isNew || status === "Draft" ? "Save draft" : "Save changes"}</button>
                {canSubmit && <button disabled={busy || !customerOk || (needsSign && !csign.signed)} title={needsSign && !csign.signed ? "The customer must sign first" : undefined} onClick={() => setPreviewing(true)} className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40">{busy ? "Saving…" : "Submit to supervisor"}</button>}
              </>
            )}
            {canPullBack && <button disabled={busy} onClick={() => void decide("pull_back")} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-40">Pull back to draft</button>}
            {canApprove && <button disabled={busy} onClick={() => void decide("supervisor_approve")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Approve and send to Colgate</button>}
            {canFinal && <button disabled={busy} onClick={() => void decide("principal_approve")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Give final approval</button>}
            {canPay && <button disabled={busy} onClick={() => void decide("mark_paid")} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Mark as Paid</button>}
            {canReturn && <button disabled={busy} onClick={() => { setAsking("return"); setReason(""); }} className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Return with reason</button>}
            {canDelete && <button disabled={busy} onClick={() => setAsking("delete")} className="inline-flex items-center gap-1 rounded-md border border-rose-300 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-50 disabled:opacity-40"><Trash2 size={14} /> Delete</button>}
            {!isNew && !editable && !canApprove && !canFinal && !canPay && <span className="text-xs text-slate-500">{status === "Approved by Colgate" || status === "Paid" ? "Locked: Colgate has approved this claim" : "View only"}</span>}
            <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
          </div>
        </div>
        {error && <p role="alert" className="no-print mx-4 mt-3 rounded bg-rose-50 px-3 py-2 text-rose-800">Could not save: {error}</p>}

        {isNew && (
          <div className="no-print grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 sm:grid-cols-3">
            <label className="text-xs font-medium text-slate-600">Form type
              <select value={formKey} onChange={(e) => changeForm(e.target.value as FormKey)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                {NEW_FORM_KEYS.map((k) => <option key={k} value={k}>{FORMS[k].label}</option>)}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-600 sm:col-span-2">Customer (outlet)
              <input list="paf-customers" value={custInput} onChange={(e) => pickCustomer(e.target.value)} placeholder={myCustomers.length ? `Choose from ${myCustomers.length} customers` : "No customers are appointed to this salesman"} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
              {customer && !customerOk && <span role="alert" className="mt-1 block text-xs font-normal text-rose-700">Choose a customer from the list. Only customers appointed to this salesman can be used.</span>}
              <datalist id="paf-customers">{myCustomers.map((x) => <option key={x.code} value={custLabel(x)} />)}</datalist>
            </label>
            {seesAll && (
              <label className="text-xs font-medium text-slate-600">Salesman
                <select value={salesmanCode ?? ""} onChange={(e) => changeSalesman(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                  {salesmen.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        <div className="grid gap-4 p-3 sm:p-5 lg:grid-cols-[minmax(340px,5fr)_minmax(0,7fr)]">
          <div className="no-print min-w-0 space-y-4">
            {!isNew && status === "Returned" && (
              <p role="status" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                <b>Returned: </b>{[...events].reverse().find((e) => e.action.startsWith("Returned"))?.note ?? "Please correct the claim and submit it again."}
              </p>
            )}
            {asking === "return" && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <label className="block text-sm font-medium text-slate-700">Reason (required)
                  <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="Tell the salesman what to correct" className="mt-1 w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
                </label>
                <div className="mt-2 flex gap-2">
                  <button disabled={busy || !reason.trim()} onClick={() => void decide("return", reason.trim())} className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Return claim</button>
                  <button onClick={() => setAsking(null)} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm">Cancel</button>
                </div>
              </div>
            )}
            {asking === "delete" && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                <p>Delete {claim?.id}? The claim and its attached files are removed. Who deleted it and when stays in the history log.</p>
                <div className="mt-2 flex gap-2">
                  <button disabled={busy} onClick={() => void remove()} className="rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">Yes, delete</button>
                  <button onClick={() => setAsking(null)} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm">Keep it</button>
                </div>
              </div>
            )}
            {!isNew && events.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-2 text-sm font-semibold text-slate-700">History</div>
                <ol className="space-y-2 border-l border-slate-200 pl-3">
                  {[...events].reverse().map((h, i) => (
                    <li key={i} className="text-sm">
                      <div className="text-slate-800">{h.action}</div>
                      <div className="text-xs text-slate-500">{h.actor_name || "System"}, {fmtAt(h.at)}</div>
                      {h.note && <div className="mt-0.5 text-xs text-slate-600">&ldquo;{h.note}&rdquo;</div>}
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {editable && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="mb-1.5 text-sm font-semibold text-slate-800">{canSubmit ? "Ready to submit?" : "Check before saving"}</div>
                <ul className="space-y-1">
                  {checklist.map((c) => <li key={c.text} className={`flex items-center gap-2 text-sm ${c.ok ? "text-emerald-700" : "text-slate-500"}`}>{c.ok ? <Check size={15} /> : <span className="inline-block h-3.5 w-3.5 rounded-full border border-slate-300" />}{c.text}</li>)}
                </ul>
              </div>
            )}
            {editable && <PafFill key={def.key} def={def} values={shownValues} onChange={setValue} followCustomer />}

            {editable ? <SignCard s={csign} customerName={customer} locked={!editable} /> : (
              <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <div className="mb-1 font-semibold text-slate-800">Customer chop and signature</div>
                {claim?.sign ? <p className="text-emerald-800">Signed by <b>{claim.sign.signerName}</b> on {claim.sign.signedAt}, on {claim.sign.by}&apos;s phone.</p> : <p className="text-slate-600">{claim && claim.signRequired === false ? "Chopped and signed on paper before this step was added." : "Not signed."}</p>}
              </div>
            )}

            <ClaimInvoices sample={false} customerCode={customerCode} items={invoices} onChange={changeInvoices} locked={!editable} lookup={findPod} />

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 text-sm font-semibold text-slate-700">Remark / description</div>
              <textarea value={remark} disabled={!editable} onChange={(e) => setRemark(e.target.value)} rows={3} placeholder="e.g. Display set up as per agreed plan, photos taken 26 Jan." className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm disabled:bg-slate-50" />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-700">
                <span>Photos &amp; supporting documents</span>
                {editable && (
                  <span className="flex gap-2">
                    <button onClick={() => photoInput.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal hover:bg-slate-50"><ImagePlus size={13} /> Add photo</button>
                    <button onClick={() => docInput.current?.click()} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs font-normal hover:bg-slate-50"><Paperclip size={13} /> Add document</button>
                  </span>
                )}
              </div>
              <input ref={photoInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => addPhotos(e.target.files)} />
              <input ref={docInput} type="file" multiple className="hidden" onChange={(e) => addDocs(e.target.files)} />
              {editable && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
                  onDrop={(e) => { e.preventDefault(); setDrag(false); addAny(e.dataTransfer.files); }}
                  className={`mb-3 flex flex-col items-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center ${drag ? "border-indigo-500 bg-indigo-50" : "border-slate-300 bg-slate-50"}`}>
                  <UploadCloud size={22} className="text-indigo-600" />
                  <span className="text-sm text-slate-700">Drag photos and documents here, or use the buttons above</span>
                  <span className="text-xs text-slate-500">Photos show in the preview. The first three photos go into the photo box on the form.</span>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={p.key} className="relative">
                    {p.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.url} alt="" className="h-16 w-16 rounded border border-slate-200 object-cover" />
                    ) : <span className="flex h-16 w-16 items-center justify-center rounded border border-slate-200 text-xs text-slate-400">…</span>}
                    {i < 3 && def.photoBox && <span className="absolute bottom-0 left-0 right-0 rounded-b bg-indigo-600/90 text-center text-[10px] text-white">On form</span>}
                    {editable && <button onClick={() => { setPhotos((x) => x.filter((it) => it.key !== p.key)); if (p.path || p.fileId) setRemoved((r) => [...r, p]); }} aria-label="Remove photo" className="absolute -right-1 -top-1 rounded-full bg-rose-600 p-0.5 text-white"><X size={10} /></button>}
                  </div>
                ))}
                {docs.map((d) => (
                  <span key={d.key} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-1 text-xs text-slate-600"><Paperclip size={11} />{d.name}
                    {editable && <button onClick={() => { setDocs((x) => x.filter((it) => it.key !== d.key)); if (d.path || d.fileId) setRemoved((r) => [...r, d]); }} aria-label={`Remove ${d.name}`}><X size={11} /></button>}
                  </span>
                ))}
                {!photos.length && !docs.length && <span className="text-xs text-slate-400">Nothing attached yet.</span>}
              </div>
            </div>
          </div>

          <div className="paf-preview-wrap min-w-0 lg:sticky lg:top-[68px] lg:max-h-[calc(100vh-88px)] lg:self-start lg:overflow-auto">
            <div className="no-print mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Live preview: this is what prints</span>
              {editable && <button onClick={() => setEditing(!editing)} className="rounded-md border border-slate-300 px-2 py-1 hover:bg-slate-50">{editing ? "Stop typing on the form" : "Type on the form itself"}</button>}
            </div>
            {editing && <p className="no-print mb-2 rounded bg-indigo-50 px-3 py-1.5 text-xs text-indigo-800">Type directly into the highlighted cells and click the boxes to tick them. The panel on the left updates too.</p>}
            <div id="paf-print">
              <PafSheet def={def} values={shownValues} sign={csign.overlay} followCustomer editing={editing && editable} onChange={setValue} photos={photos.map((p) => p.url).filter((u): u is string => !!u)} />
              <section className="paf-extra mt-6">
                <h3 className="text-sm font-semibold text-slate-800">{claim?.id ?? "New claim"} · {customer}</h3>
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{remark ? `Remark: ${remark}` : "Remark: –"}</p>
                {invoices.length > 0 && <p className="mt-2 text-xs text-slate-500">Delivered invoices (POD attached): {invoices.map((i) => i.docNo).join(", ")}</p>}
                {docs.length > 0 && <p className="mt-2 text-xs text-slate-500">Supporting documents: {docs.map((d) => d.name).join(", ")}</p>}
                {photos.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {photos.map((p) => p.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={p.key} src={p.url} alt={p.name} className="max-h-[420px] w-full rounded border border-slate-200 object-contain" />
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      </div>
      {previewing && (
        <SubmitPreview title={`${claim?.id ?? "New claim"} · ${FORMS[formKey].label} · ${customer || "no customer"}`} def={def} values={shownValues} sign={csign.overlay}
          photos={photos.map((p) => p.url).filter((u): u is string => !!u)} docNames={docs.map((d) => d.name)} invoices={invoices.map((i) => ({ docNo: i.docNo, pod: i.podFile }))} checklist={checklist} busy={busy}
          onBack={() => setPreviewing(false)} onConfirm={async () => { await save(true); setPreviewing(false); }} />
      )}
    </div>
  );
}
