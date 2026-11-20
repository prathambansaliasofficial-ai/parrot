import Link from "next/link";
import { Inbox } from "lucide-react";

import { listAdminRequests } from "@/lib/admin";
import { formatDate } from "@/lib/format";

const FILTERS = [
  { value: "", label: "All" },
  { value: "new", label: "New" },
  { value: "in_progress", label: "In progress" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "closed", label: "Closed" },
];

export default async function AdminRequestsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const allRows = listAdminRequests();
  const rows = status ? allRows.filter((row) => row.status === status) : allRows;
  const count = (value: string) => allRows.filter((row) => row.status === value).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Students</p>
        <h1 className="mt-1 text-2xl">Resource requests</h1>
        <p className="mt-1 text-sm text-muted">What students asked for. Update the status as material is sourced.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/requests?status=${filter.value}` : "/admin/requests"}
            className={`chip ${status === filter.value ? "border-primary/40 bg-mint text-primary" : ""}`}
          >
            {filter.label}
            {filter.value && <span className="text-[0.62rem] opacity-70">{count(filter.value)}</span>}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            <Inbox size={22} className="mx-auto mb-2" /> No requests in this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.65rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Request</th>
                  <th className="px-4 py-2 font-semibold">University</th>
                  <th className="px-4 py-2 font-semibold">Requester</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Created</th>
                  <th className="px-4 py-2 text-right font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-paper/60">
                    <td className="max-w-[18rem] px-4 py-2.5">
                      <p className="truncate font-medium">{row.subjectName}</p>
                      <p className="text-[0.66rem] text-muted">
                        {row.publicId} · {row.subjectCode ?? "no code"} · Sem {row.semester ?? "?"}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{row.universityShort}</p>
                      <p className="text-[0.65rem] text-muted">{row.programmeShort}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <a href={`mailto:${row.email}`} className="hover:text-primary">
                        {row.email}
                      </a>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full bg-paper px-2 py-0.5 text-[0.65rem] capitalize">
                        {row.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/admin/requests/${row.id}`} className="text-[0.7rem] font-medium text-primary hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
