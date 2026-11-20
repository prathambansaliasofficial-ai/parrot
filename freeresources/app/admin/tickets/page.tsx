import Link from "next/link";
import { LifeBuoy } from "lucide-react";

import { listAdminTickets } from "@/lib/admin";
import { formatDate } from "@/lib/format";

const FILTERS = [
  { value: "", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export default async function AdminTicketsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status = "" } = await searchParams;
  const allRows = listAdminTickets();
  const rows = status ? allRows.filter((row) => row.status === status) : allRows;
  const count = (value: string) => allRows.filter((row) => row.status === value).length;

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Students</p>
        <h1 className="mt-1 text-2xl">Support tickets</h1>
        <p className="mt-1 text-sm text-muted">Broken files, copyright reports and account issues submitted from /support.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/tickets?status=${filter.value}` : "/admin/tickets"}
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
            <LifeBuoy size={22} className="mx-auto mb-2" /> No tickets in this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.65rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Ticket</th>
                  <th className="px-4 py-2 font-semibold">From</th>
                  <th className="px-4 py-2 font-semibold">Category</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Created</th>
                  <th className="px-4 py-2 text-right font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-paper/60">
                    <td className="max-w-[20rem] px-4 py-2.5">
                      <p className="truncate font-medium">{row.subject}</p>
                      <p className="text-[0.66rem] text-muted">{row.publicId}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{row.name}</p>
                      <p className="text-[0.65rem] text-muted">{row.email}</p>
                    </td>
                    <td className="px-4 py-2.5 capitalize">{row.category.replace(/-/g, " ")}</td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex rounded-full bg-paper px-2 py-0.5 text-[0.65rem] capitalize">
                        {row.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <Link href={`/admin/tickets/${row.id}`} className="text-[0.7rem] font-medium text-primary hover:underline">
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
