import Link from "next/link";
import { Download, FileText, Plus, Search } from "lucide-react";

import { listAdminResources } from "@/lib/admin";
import { formatBytes, formatDate } from "@/lib/format";

export default async function AdminResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const { q = "", status = "" } = await searchParams;
  const rows = listAdminResources(q, status);
  const published = rows.filter((row) => row.status === "published").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Library</p>
          <h1 className="mt-1 text-2xl">Resources</h1>
          <p className="mt-1 text-sm text-muted">Upload files, publish drafts and manage versions.</p>
        </div>
        <Link href="/admin/resources/new" className="btn btn-primary btn-sm">
          <Plus size={14} /> Upload resource
        </Link>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <form action="/admin/resources" className="flex flex-1 items-center gap-2 sm:max-w-md">
          <div className="relative flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input type="search" name="q" defaultValue={q} placeholder="Title, subject, code or university…" className="input pl-8" />
          </div>
          <select name="status" defaultValue={status} className="input w-auto">
            <option value="">All</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
          <button type="submit" className="btn btn-secondary btn-sm">
            Filter
          </button>
        </form>
        {(q || status) && (
          <Link href="/admin/resources" className="text-xs text-muted hover:text-primary">
            Clear filters
          </Link>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[
          ["In this view", rows.length],
          ["Published", published],
          ["Drafts", rows.length - published],
        ].map(([label, value]) => (
          <div key={String(label)} className="card px-4 py-3">
            <p className="text-[0.65rem] uppercase tracking-wide text-muted">{label}</p>
            <p className="mt-0.5 font-display text-xl">{value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted">
            No resources match this view.{" "}
            <Link href="/admin/resources/new" className="text-primary hover:underline">
              Upload one
            </Link>
            .
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.65rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Resource</th>
                  <th className="px-4 py-2 font-semibold">Subject</th>
                  <th className="px-4 py-2 font-semibold">Category</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">File</th>
                  <th className="px-4 py-2 font-semibold">Size</th>
                  <th className="px-4 py-2 font-semibold">Downloads</th>
                  <th className="px-4 py-2 font-semibold">Created</th>
                  <th className="px-4 py-2 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-paper/60">
                    <td className="max-w-[18rem] px-4 py-2.5">
                      <p className="truncate font-medium">{row.title}</p>
                      <p className="text-[0.66rem] text-muted">
                        {row.universityShort} · {row.programmeShort} · Sem {row.semester}
                        {row.isSample ? " · sample" : ""}
                      </p>
                    </td>
                    <td className="px-4 py-2.5">
                      <p className="max-w-[12rem] truncate">{row.subjectName}</p>
                      {row.subjectCode && <p className="font-mono text-[0.65rem] text-muted">{row.subjectCode}</p>}
                    </td>
                    <td className="px-4 py-2.5">{row.categoryName}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.65rem] font-medium ${
                          row.status === "published" ? "bg-mint text-primary" : "bg-accent-soft text-accent"
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      {row.fileId ? (
                        <span className="inline-flex items-center gap-1 text-muted">
                          <FileText size={12} /> {row.fileCount}
                        </span>
                      ) : (
                        <span className="text-red-700">Missing</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[0.7rem] text-muted">
                      {formatBytes(row.fileSize)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-1 text-muted">
                        <Download size={12} /> {row.downloadCount}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-muted">{formatDate(row.createdAt)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      {row.fileId && (
                        <a
                          href={`/api/admin/resources/${row.id}/files/${row.fileId}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mr-3 text-[0.7rem] text-muted hover:text-primary"
                        >
                          Preview
                        </a>
                      )}
                      <Link href={`/admin/resources/${row.id}`} className="text-[0.7rem] font-medium text-primary hover:underline">
                        Edit
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
