"use client";
import { useState } from "react";
import { Check, Paperclip, X } from "lucide-react";
import { Modal, StatusBadge, TypeTag, btnBlue, btnLine, dayTxt, field } from "@/components/hr/ui";
import { addDays, fmtDate } from "@/lib/hr/rules";
import { TODAY, type LeaveRequest } from "@/lib/hr/sample";
import { approverOf, balance, findEmp } from "@/lib/hr/calc";
import { useHr } from "@/lib/hr/store";

export default function Approvals() {
  const { data, me, role, decide, mcLink, live } = useHr();
  // a manager decides for their own team; HR can decide for anyone (except themselves)
  const forMe = (r: LeaveRequest) => { const e = findEmp(data, r.empId); return !!e && r.empId !== me.id && (role === "hr" || approverOf(data, e) === me.id); };
  const mine = data.requests.filter((r) => !r.calendarOnly && forMe(r));
  const [picked, setPicked] = useState<string[]>([]);
  const [rejecting, setRejecting] = useState<LeaveRequest | null>(null);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tab, setTab] = useState<"pending" | "decided">("pending");
  const pending = mine.filter((r) => r.status === "Pending").sort((a, b) => a.from.localeCompare(b.from));
  const decided = mine.filter((r) => r.status !== "Pending").sort((a, b) => (b.decidedAt ?? b.from).localeCompare(a.decidedAt ?? a.from)).slice(0, 20);
  const [busy, setBusy] = useState(false);
  const run = async (ids: string[], status: "Approved" | "Rejected", why?: string) => { setBusy(true); const r = await decide(ids, status, why); setBusy(false); setMsg(r); if (r.ok) setPicked((p) => p.filter((x) => !ids.includes(x))); return r.ok; };
  const livePicked = picked.filter((x) => pending.some((r) => r.id === x));
  const allPicked = pending.length > 0 && pending.every((r) => picked.includes(r.id));

  if (role === "employee") return <p className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-6 text-slate-600">Approvals are for managers and HR. Switch “Viewing as” to Manager or HR admin to try them.</p>;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="font-display text-2xl font-semibold text-slate-900">Leave approvals</h1>
      <p className="text-slate-500">{role === "hr" ? "Requests from everyone." : "Requests from your team."} Approving takes the days off their balance; rejecting gives them back.</p>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">
          {([["pending", `Waiting (${pending.length})`], ["decided", "Decided"]] as const).map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 ${tab === k ? "bg-blue-500 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{l}</button>)}
        </div>
        {tab === "pending" && pending.length > 1 && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={allPicked} onChange={(e) => setPicked(e.target.checked ? pending.map((r) => r.id) : [])} className="h-4 w-4" /> Select all</label>
            <button onClick={() => run(livePicked, "Approved")} disabled={!livePicked.length || busy} className={`${btnBlue} !py-1.5 text-sm`}><Check size={16} /> Approve {livePicked.length || ""}</button>
          </div>
        )}
      </div>
      {msg && <p role="status" className={`mt-3 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>{msg.text}</p>}

      {tab === "pending" ? (
        <ul className="mt-3 space-y-2">
          {pending.length === 0 && <li className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-500">Nothing waiting. You are all caught up.</li>}
          {pending.map((r) => {
            const e = findEmp(data, r.empId)!, b = balance(data, e, r.type);
            const late = r.type === "EL" && r.from < addDays(r.appliedAt, -2);
            const clash = data.requests.filter((x) => x.id !== r.id && x.status === "Approved" && x.from <= r.to && x.to >= r.from && findEmp(data, x.empId)?.managerId === e.managerId).map((x) => findEmp(data, x.empId)!.name.split(" ")[0]);
            return (
              <li key={r.id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={picked.includes(r.id)} onChange={(x) => setPicked((p) => (x.target.checked ? [...p, r.id] : p.filter((y) => y !== r.id)))} className="mt-1 h-4 w-4" aria-label={`Select ${e.name}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium text-slate-900">{e.name}</span><TypeTag t={r.type} /></div>
                    <div className="mt-0.5 text-slate-800">{fmtDate(r.from)}{r.to !== r.from ? ` – ${fmtDate(r.to)}` : ""}{r.half ? ` (${r.half === "AM" ? "morning" : "afternoon"})` : ""} · <b className="font-semibold">{dayTxt(r.days)}</b>{r.from < TODAY && <span className="ml-2 text-sm text-amber-700">backdated</span>}</div>
                    <div className="text-sm text-slate-600">“{r.reason}” · applied {fmtDate(r.appliedAt, { day: "numeric", month: "short" })}</div>
                    <div className="mt-1 text-sm text-slate-600">{b.available === null ? "No limit for this type." : <>Balance {dayTxt(b.available + r.days)} → <b className="text-slate-900">{dayTxt(b.available)}</b> if approved.</>}</div>
                    {r.mcFile && <button onClick={async () => { const u = await mcLink(r.mcFile!); if (u) window.open(u, "_blank", "noopener"); else setMsg({ ok: false, text: live ? "The MC could not be opened." : "Sample MC: in the live system this opens the file." }); }} className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:underline"><Paperclip size={14} /> View MC ({r.mcFile.split("/").pop()?.replace(/^\d+-/, "")})</button>}
                    {late && <p className="mt-1 text-sm text-rose-700">Applied more than 48 hours after the day.</p>}
                    {clash.length > 0 && <p className="mt-1 text-sm text-amber-700">Also away then: {[...new Set(clash)].join(", ")}.</p>}
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
                      <button onClick={() => run([r.id], "Approved")} disabled={busy} className={`${btnBlue} !py-2`}><Check size={16} /> Approve</button>
                      <button onClick={() => { setRejecting(r); setNote(""); }} className={`${btnLine} !py-2 !text-rose-700`}><X size={16} /> Reject</button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {decided.length === 0 && <li className="p-4 text-sm text-slate-500">Nothing decided yet.</li>}
          {decided.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              <span className="min-w-0"><span className="font-medium text-slate-900">{findEmp(data, r.empId)?.name}</span><span className="ml-2 text-sm text-slate-600">{fmtDate(r.from, { day: "numeric", month: "short" })}{r.to !== r.from ? ` – ${fmtDate(r.to, { day: "numeric", month: "short" })}` : ""} · {dayTxt(r.days)}</span>{r.decisionNote && <span className="block text-sm text-rose-700">{r.decisionNote}</span>}</span>
              <span className="flex items-center gap-3"><TypeTag t={r.type} /><StatusBadge s={r.status} /></span>
            </li>
          ))}
        </ul>
      )}

      {rejecting && (
        <Modal title={`Reject ${findEmp(data, rejecting.empId)?.name.split(" ")[0]}'s leave?`} onClose={() => setRejecting(null)}>
          <p className="text-sm text-slate-600">{fmtDate(rejecting.from)}{rejecting.to !== rejecting.from ? ` – ${fmtDate(rejecting.to)}` : ""}, {dayTxt(rejecting.days)}. The days go back to their balance and they see your reason.</p>
          <label className="mt-3 block text-sm font-medium text-slate-700">Reason (required)<textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={field} placeholder="For example: stock-take that week, please choose another date" autoFocus /></label>
          <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => setRejecting(null)} className={btnLine}>Keep it</button><button disabled={!note.trim()} onClick={async () => { if (await run([rejecting.id], "Rejected", note)) setRejecting(null); }} className={`${btnBlue} !bg-rose-600 hover:!bg-rose-700`}>Reject</button></div>
        </Modal>
      )}
    </div>
  );
}
