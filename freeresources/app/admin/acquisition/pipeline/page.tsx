import Link from "next/link";

import { listJobs } from "@/lib/acquisition/store";
import { STAGE_LABELS, STATE_LABELS, isStage, type JobState, type Stage } from "@/lib/acquisition/types";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "awaiting_approval", label: "Awaiting approval" },
  { value: "running", label: "Running" },
  { value: "queued", label: "Queued" },
  { value: "retry_scheduled", label: "Retrying" },
  { value: "failed", label: "Failed" },
  { value: "needs_review", label: "Needs review" },
  { value: "completed", label: "Completed" },
  { value: "skipped", label: "Skipped" },
];

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; ok?: string; error?: string }>;
}) {
  const { state = "", ok, error } = await searchParams;
  const jobs = listJobs({ state: state || undefined, limit: 150 });

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Durable queue</p>
        <h1 className="mt-1 text-2xl">Processing pipeline</h1>
        <p className="mt-1 text-sm text-muted">
          Every acquired document moves through the same audited stages. Jobs survive worker restarts.
        </p>
      </div>

      {(ok || error) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"}`}>
          {error ?? ok}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value ? `/admin/acquisition/pipeline?state=${filter.value}` : "/admin/acquisition/pipeline"}
            className={`rounded-full border px-2.5 py-1 text-[0.68rem] ${
              state === filter.value ? "border-primary bg-mint text-primary" : "border-line text-muted hover:border-primary/40"
            }`}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      <div className="card overflow-hidden">
        {jobs.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-muted">No jobs in this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[58rem] text-left text-xs">
              <thead className="bg-paper/70 text-[0.62rem] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-2 font-semibold">Document</th>
                  <th className="px-4 py-2 font-semibold">Source</th>
                  <th className="px-4 py-2 font-semibold">Stage</th>
                  <th className="px-4 py-2 font-semibold">State</th>
                  <th className="px-4 py-2 font-semibold">Progress</th>
                  <th className="px-4 py-2 font-semibold">Size</th>
                  <th className="px-4 py-2 font-semibold">Attempt</th>
                  <th className="px-4 py-2 font-semibold">Updated</th>
                  <th className="px-4 py-2 text-right font-semibold"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-paper/60">
                    <td className="max-w-[16rem] px-4 py-2">
                      <Link href={`/admin/acquisition/jobs/${job.id}`} className="block truncate font-medium hover:text-primary">
                        {job.filename ?? job.title ?? "Untitled document"}
                      </Link>
                      {job.last_error && <p className="truncate text-[0.62rem] text-red-700">{job.last_error}</p>}
                    </td>
                    <td className="max-w-[14rem] px-4 py-2">
                      {job.source_url ? (
                        <a href={job.source_url} target="_blank" rel="noreferrer" className="block truncate text-muted hover:text-primary">
                          {job.domain}
                        </a>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">{STAGE_LABELS[job.stage as Stage] ?? job.stage}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[0.62rem] ${
                          job.state === "failed"
                            ? "bg-red-100 text-red-800"
                            : job.state === "awaiting_approval"
                              ? "bg-accent-soft text-accent"
                              : job.state === "completed"
                                ? "bg-mint text-primary"
                                : "bg-paper text-muted"
                        }`}
                      >
                        {STATE_LABELS[job.state as JobState] ?? job.state}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-line">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${job.progress}%` }} />
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 font-mono text-[0.66rem] text-muted">
                      {job.optimized_bytes ? (
                        <span title={`Original ${formatBytes(job.original_bytes)}`}>
                          {formatBytes(job.optimized_bytes)} <span className="text-primary">−{job.saving}%</span>
                        </span>
                      ) : (
                        formatBytes(job.original_bytes)
                      )}
                    </td>
                    <td className="px-4 py-2 text-muted">
                      {job.attempt}/{job.max_attempts}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-muted">{formatDate(job.updated_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <Link href={`/admin/acquisition/jobs/${job.id}`} className="text-[0.68rem] font-medium text-primary hover:underline">
                        Inspect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[0.68rem] text-muted">
        Stage labels: {Object.values(STAGE_LABELS).filter((_, index) => isStage(Object.keys(STAGE_LABELS)[index])).join(" → ")}
      </p>
    </div>
  );
}
