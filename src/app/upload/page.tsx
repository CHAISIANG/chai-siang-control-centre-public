"use client";
import Link from "next/link";
import { UploadCloud } from "lucide-react";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { useData } from "@/components/data";
import { fmt } from "@/lib/mock";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur" });

export default function UploadPage() {
  const { uploads, asAt } = useData();
  return (
    <>
      <PageHeader title="Data Upload" sub="The four weekly Excel reports are loaded into the database. This page shows what was loaded and when." />
      <Card title="Load new reports">
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-8 text-center">
          <UploadCloud className="text-slate-400" size={36} />
          <p className="text-sm font-medium text-slate-700">Uploading from this page is coming. For now the reports are loaded by your system administrator.</p>
          <p className="text-xs text-slate-500">To look at a set of reports before they are loaded, use the Real data test run.</p>
          <Link href="/test-run" className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Open the test run</Link>
        </div>
      </Card>
      <Card title={`Upload history${asAt ? `, aging as at ${asAt.slice(8)}/${asAt.slice(5, 7)}/${asAt.slice(0, 4)}` : ""}`} className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th first>Report</Th><Th>File</Th><Th>Loaded</Th><Th right>Rows</Th><Th>Status</Th></tr></thead>
            <tbody>
              {uploads.length === 0 && <tr><Td first className="text-slate-500">No reports have been loaded yet.</Td></tr>}
              {uploads.map((u, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0">
                  <Td first><b>{u.report}</b></Td><Td>{u.file_name ?? "–"}</Td><Td>{when(u.uploaded_at)}</Td><Td right>{u.row_count ? fmt(u.row_count) : "–"}</Td>
                  <Td><Badge tone={u.status === "OK" ? "green" : u.status === "Late" ? "amber" : "red"}>{u.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
