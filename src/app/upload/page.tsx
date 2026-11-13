import { UploadCloud } from "lucide-react";
import { Badge, Card, PageHeader, Td, Th } from "@/components/ui";
import { fmt, uploads } from "@/lib/mock";

export default function UploadPage() {
  return (
    <>
      <PageHeader title="Data Upload" sub="Upload the daily Excel exports. The dashboard updates after each upload." />
      <Card>
        <div className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-10 text-center">
          <UploadCloud className="text-slate-400" size={36} />
          <p className="text-sm font-medium text-slate-700">Drop Excel files here, or click to browse</p>
          <p className="text-xs text-slate-500">The system detects the report type (DA1, Customer Master, Promotional Discount, Aging…)</p>
          <button className="mt-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">Choose files</button>
        </div>
      </Card>
      <Card title="Upload status" className="mt-4">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200"><tr><Th>Report</Th><Th>Source</Th><Th>Last upload</Th><Th right>Rows</Th><Th>Status</Th></tr></thead>
            <tbody>
              {uploads.map((u) => (
                <tr key={u.name} className="border-b border-slate-100 last:border-0">
                  <Td><b>{u.name}</b></Td><Td>{u.source}</Td><Td>{u.last}</Td><Td right>{u.rows ? fmt(u.rows) : "–"}</Td>
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
