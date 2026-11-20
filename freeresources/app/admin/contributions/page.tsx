import Link from "next/link";
import { CheckCircle2, Clock, FileUp, XCircle } from "lucide-react";

import { listContributions } from "@/lib/admin";
import { contributionReviewSummary } from "@/lib/admin-contributions";
import { formatBytes, formatDate } from "@/lib/format";

const FILTERS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export default async function AdminContributionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status = "" } = await searchParams;
  const rows = listContributions(status);
  const summary = contributionReviewSummary();

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Library</p>
        <h1 className="mt-1 text-2xl">Contributions</h1>
        <p className="mt-1 text-sm text-muted">
          Submitted PDFs stay private until an administrator reviews them. Approval publishes them immediately.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending", value: summary.pending, icon: Clock },
          { label: "Approved", value: summary.approved, icon: CheckCircle2 },
          { label: "Rejected", value: summary.rejected, icon: XCircle },
        ].map((item) => (
          <div key={item.label} className="card flex items-center gap-3 px-4 py-3">
            <item.icon size={16} className="text-muted" />
            <div>
              <p className="font-display text-xl leading-none">{item.value}</p>
              <p className="mt-1 text-[0.66rem] uppercase tracking-wide text-muted">{item.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/contributions?status=${filter.value}` : "/admin/contributions"}
            className={`chip ${status === filter.value ? "border-primary/40 bg-mint text-primary" : ""}`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            <FileUp size={22} className="mx-auto mb-2 text-muted" />
            No {status || ""} contributions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.65rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Contribution</th>
                  <th className="px-4 py-2 font-semibold">Institution</th>
                  <th className="px-4 py-2 font-semibold">Contributor</th>
                  <th className="px-4 py-2 font-semibold">File</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Submitted</th>
                  <th className="px-4 py-2 text-right font-semibold" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-paper/60">
                    <td className="max-w-[18rem] px-4 py-2.5">
                      <p className="truncate font-medium">{row.title}</p>
                      <p className="text-[0.66rem] text-muted">
                        {row.publicId} · {row.categoryName} · Sem {row.semester}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{row.universityShort}</p>
                      <p className="max-w-[12rem] truncate text-[0.65rem] text-muted">{row.programmeName}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p>{row.contributorName}</p>
                      <p className="text-[0.65rem] text-muted">{row.email}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="max-w-[10rem] truncate">{row.fileName}</p>
                      <p className="text-[0.65rem] text-muted">{formatBytes(row.fileSize)}</p>
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                          row.status === "pending"
                            ? "bg-accent-soft text-accent"
                            : row.status === "approved"
                              ? "bg-mint text-primary"
                              : "bg-red-50 text-red-700"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <Link href={`/admin/contributions/${row.id}`} className="text-[0.7rem] font-medium text-primary hover:underline">
                        {row.status === "pending" ? "Review" : "Open"}
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
