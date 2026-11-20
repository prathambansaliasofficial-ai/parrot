import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ExternalLink, FileText } from "lucide-react";

import ConfirmForm from "@/components/admin/confirm-form";
import { getJob, getJobEvents, getAsset } from "@/lib/acquisition/store";
import { STAGE_LABELS, STATE_LABELS, type JobState, type Stage } from "@/lib/acquisition/types";
import { formatBytes, formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function parse(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  const job = getJob(id);
  if (!job) notFound();

  const events = getJobEvents(id);
  const payload = parse(job.payload);
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  const adminMetadata = (payload.adminMetadata ?? {}) as Record<string, unknown>;
  const asset = job.asset_id ? getAsset(job.asset_id) : null;
  const versions = asset?.versions ?? [];

  const effective = { ...metadata, ...adminMetadata } as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/admin/acquisition/pipeline" className="text-[0.68rem] text-muted hover:text-primary">
            ← Pipeline
          </Link>
          <h1 className="mt-1 truncate text-xl">{job.filename ?? job.title ?? "Untitled document"}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="rounded-full bg-paper px-2 py-0.5">{STAGE_LABELS[job.stage as Stage] ?? job.stage}</span>
            <span className="rounded-full bg-paper px-2 py-0.5">{STATE_LABELS[job.state as JobState] ?? job.state}</span>
            <span>Attempt {job.attempt}/{job.max_attempts}</span>
            <span>· {formatDate(job.updated_at)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {job.state === "awaiting_approval" && (
            <ConfirmForm>
              <input type="hidden" name="action" value="approve_job" />
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn btn-primary btn-sm">
                <CheckCircle2 size={13} /> Approve & publish
              </button>
            </ConfirmForm>
          )}
          {(job.state === "failed" || job.state === "retry_scheduled") && (
            <ConfirmForm>
              <input type="hidden" name="action" value="retry_job" />
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn btn-secondary btn-sm">Retry</button>
            </ConfirmForm>
          )}
          {job.published_resource_id && (
            <ConfirmForm message="Unpublish this document from the public library?">
              <input type="hidden" name="action" value="unpublish_document" />
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn btn-secondary btn-sm">Unpublish</button>
            </ConfirmForm>
          )}
          {job.asset_id && (
            <ConfirmForm message="Delete the optimised derivative and regenerate it?">
              <input type="hidden" name="action" value="reprocess_document" />
              <input type="hidden" name="jobId" value={job.id} />
              <button type="submit" className="btn btn-ghost btn-sm">Reprocess</button>
            </ConfirmForm>
          )}
          <ConfirmForm message="Cancel this job? Completed work is kept.">
            <input type="hidden" name="action" value="cancel_job" />
            <input type="hidden" name="jobId" value={job.id} />
            <button type="submit" className="btn btn-ghost btn-sm text-red-700">Cancel</button>
          </ConfirmForm>
        </div>
      </div>

      {(ok || error) && (
        <div className={`rounded-lg border px-3 py-2 text-xs ${error ? "border-red-300/60 bg-red-50 text-red-800" : "border-primary/30 bg-mint text-primary"}`}>
          {error ?? ok}
        </div>
      )}

      {job.last_error && (
        <div className="rounded-lg border border-red-300/60 bg-red-50 px-3 py-2 text-xs text-red-800">{job.last_error}</div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Document metadata</h2>
          <ConfirmForm className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <input type="hidden" name="action" value="update_metadata" />
            <input type="hidden" name="jobId" value={job.id} />
            <div className="sm:col-span-2">
              <label htmlFor="title" className="label">Title</label>
              <input id="title" name="title" defaultValue={String(effective.title ?? "")} className="input" />
            </div>
            <div>
              <label htmlFor="filename" className="label">Filename</label>
              <input id="filename" name="filename" defaultValue={String(effective.filename ?? "")} className="input font-mono text-[0.7rem]" />
            </div>
            <div>
              <label htmlFor="subjectCode" className="label">Subject code</label>
              <input id="subjectCode" name="subjectCode" defaultValue={String(effective.subjectCode ?? "")} className="input" />
            </div>
            <div>
              <label htmlFor="academicYear" className="label">Academic year / scheme</label>
              <input id="academicYear" name="academicYear" defaultValue={String(effective.academicYear ?? "")} className="input" />
            </div>
            <div>
              <label htmlFor="semester" className="label">Semester</label>
              <input id="semester" name="semester" type="number" min={1} max={12} defaultValue={Number(effective.semester ?? 0) || ""} className="input" />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-secondary btn-sm">Save metadata</button>
              {metadata.aiNotes ? <p className="mt-2 text-[0.68rem] text-muted">AI note: {String(metadata.aiNotes)}</p> : null}
              {metadata.aiSkipped ? (
                <p className="mt-1 text-[0.68rem] text-accent">AI classification was skipped — no provider configured.</p>
              ) : null}
            </div>
          </ConfirmForm>
        </section>

        <section className="card p-5">
          <h2 className="text-sm font-semibold">Source &amp; storage</h2>
          <dl className="mt-3 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Source</dt>
              <dd className="max-w-[16rem] truncate text-right">
                {job.source_url ? (
                  <a href={job.source_url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {job.domain} <ExternalLink size={10} className="inline" />
                  </a>
                ) : (
                  "—"
                )}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Pages</dt>
              <dd>{job.page_count ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Original size</dt>
              <dd className="font-mono">{formatBytes(job.original_bytes)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Optimised size</dt>
              <dd className="font-mono">
                {formatBytes(job.optimized_bytes)} {job.saving !== null ? `(−${job.saving}%)` : ""}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Content hash</dt>
              <dd className="font-mono text-[0.62rem]">{String(payload.sha256 ?? "—").slice(0, 24)}…</dd>
            </div>
          </dl>

          {versions.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs">
              {versions.map((version) => (
                <li key={version.id} className="flex items-center gap-2">
                  <FileText size={13} className="text-primary" />
                  <span className="capitalize">{version.kind}</span>
                  <span className="font-mono text-[0.62rem] text-muted">{formatBytes(version.size_bytes)}</span>
                  {version.profile && <span className="text-[0.62rem] text-muted">{version.profile}</span>}
                  <a
                    href={`/api/admin/acquisition/files/${version.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-[0.68rem] text-primary hover:underline"
                  >
                    View
                  </a>
                  <a
                    href={`/api/admin/acquisition/files/${version.id}?download=1`}
                    className="text-[0.68rem] text-muted hover:text-primary"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 border-t border-line pt-3">
            <ConfirmForm className="flex items-end gap-2" message="Replace the source document? The previous version is preserved.">
              <input type="hidden" name="action" value="replace_document" />
              <input type="hidden" name="jobId" value={job.id} />
              <div className="flex-1">
                <label htmlFor="url" className="label">Replace with a new PDF URL</label>
                <input id="url" name="url" type="url" placeholder="https://…/syllabus.pdf" className="input" required />
              </div>
              <button type="submit" className="btn btn-secondary btn-sm">Replace</button>
            </ConfirmForm>
          </div>
        </section>
      </div>

      {job.state === "awaiting_approval" && (
        <section className="card p-5">
          <h2 className="text-sm font-semibold">Approval</h2>
          <p className="mt-1 text-xs text-muted">
            Approving stores the serving copy, publishes it, and attaches a verified syllabus version to the canonical curriculum.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ConfirmForm className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="action" value="approve_job" />
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label htmlFor="approveFilename" className="label">Filename to publish</label>
                <input
                  id="approveFilename"
                  name="filename"
                  defaultValue={String(effective.filename ?? "")}
                  className="input w-72 font-mono text-[0.7rem]"
                />
              </div>
              <button type="submit" className="btn btn-primary btn-sm">Approve &amp; publish</button>
            </ConfirmForm>

            <ConfirmForm className="flex items-end gap-2" message="Reject this document?">
              <input type="hidden" name="action" value="reject_job" />
              <input type="hidden" name="jobId" value={job.id} />
              <div>
                <label htmlFor="reason" className="label">Rejection reason</label>
                <input id="reason" name="reason" placeholder="Wrong scheme, poor scan…" className="input w-64" />
              </div>
              <button type="submit" className="btn btn-ghost btn-sm text-red-700">Reject</button>
            </ConfirmForm>
          </div>
        </section>
      )}

      <section className="card p-5">
        <h2 className="text-sm font-semibold">Processing timeline</h2>
        {events.length === 0 ? (
          <p className="mt-3 text-xs text-muted">No events recorded.</p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {events.map((event) => (
              <li key={event.id} className="flex gap-3 text-xs">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{STAGE_LABELS[event.stage as Stage] ?? event.stage}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[0.58rem] ${
                        event.level === "error" ? "bg-red-100 text-red-800" : event.level === "warn" ? "bg-accent-soft text-accent" : "bg-paper text-muted"
                      }`}
                    >
                      {event.state}
                    </span>
                    <span className="text-[0.62rem] text-muted">{formatDate(event.created_at)}</span>
                  </p>
                  <p className="text-muted">{event.message}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
