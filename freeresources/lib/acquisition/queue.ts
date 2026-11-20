import { randomUUID } from "node:crypto";

import { all, one, run, transaction } from "../db";
import { HOLD_STAGES, nextStage, type JobState, type Stage } from "./types";

/** Durable job queue: enqueue, lease, heartbeat, pause/cancel, retry. */

export function newId(): string {
  return randomUUID();
}

function json(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

export function recordEvent(
  jobId: string,
  stage: Stage | string,
  state: JobState | string,
  message: string,
  level: "info" | "warn" | "error" = "info",
  detail?: unknown,
): void {
  run(
    `INSERT INTO ingestion_job_events (id, job_id, stage, state, level, message, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId(), jobId, stage, state, level, message.slice(0, 2000), json(detail)],
  );
}

export type JobRecord = {
  id: string;
  candidate_id: string | null;
  asset_id: string | null;
  document_version_id: string | null;
  stage: string;
  state: string;
  progress: number;
  attempt: number;
  max_attempts: number;
  lease_owner: string | null;
  lease_expires_at: string | null;
  next_run_at: string | null;
  last_error: string | null;
  payload: string | null;
  published_resource_id: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export function getJobRecord(id: string): JobRecord | undefined {
  return one<JobRecord>("SELECT * FROM ingestion_jobs WHERE id = ?", [id]);
}

export function parsePayload(job: JobRecord): Record<string, unknown> {
  if (!job.payload) return {};
  try {
    return JSON.parse(job.payload) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function updatePayload(jobId: string, patch: Record<string, unknown>): Record<string, unknown> {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  const merged = { ...parsePayload(job), ...patch };
  run("UPDATE ingestion_jobs SET payload = ?, updated_at = datetime('now') WHERE id = ?", [json(merged), jobId]);
  return merged;
}

/* -------------------------------------------------------------------- runs */

export function createRun(input: {
  mode: "gap" | "manual" | "scheduled" | "source";
  scope: Record<string, unknown>;
  userId: string | null;
  status?: string;
}): string {
  const id = newId();
  run(
    `INSERT INTO discovery_runs (id, mode, scope, status, triggered_by) VALUES (?, ?, ?, ?, ?)`,
    [id, input.mode, json(input.scope), input.status ?? "queued", input.userId],
  );
  return id;
}

export function setRunStatus(
  id: string,
  status: "queued" | "running" | "paused" | "cancelled" | "completed" | "failed",
  patch: { error?: string | null; stats?: unknown } = {},
): void {
  const finished = ["completed", "failed", "cancelled"].includes(status);
  run(
    `UPDATE discovery_runs
        SET status = ?,
            started_at = CASE WHEN ?='running' AND started_at IS NULL THEN datetime('now') ELSE started_at END,
            finished_at = CASE WHEN ? THEN datetime('now') ELSE finished_at END,
            error = COALESCE(?, error),
            stats = COALESCE(?, stats)
      WHERE id = ?`,
    [status, status, finished ? 1 : 0, patch.error ?? null, patch.stats === undefined ? null : json(patch.stats), id],
  );
}

export type InsertCandidateInput = {
  runId: string;
  url: string;
  domain: string;
  title?: string | null;
  snippet?: string | null;
  sourceId?: string | null;
  score: number;
  reason?: string | null;
};

/** Inserts a candidate unless the same run already saw the URL. */
export function addCandidate(input: InsertCandidateInput): string | null {
  const existing = one<{ id: string }>(
    "SELECT id FROM discovered_candidates WHERE run_id = ? AND url = ?",
    [input.runId, input.url],
  );
  if (existing) return null;
  const id = newId();
  run(
    `INSERT INTO discovered_candidates (id, run_id, url, domain, title, snippet, source_id, score, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      input.runId,
      input.url.slice(0, 2000),
      input.domain.slice(0, 255),
      input.title?.slice(0, 500) ?? null,
      input.snippet?.slice(0, 1000) ?? null,
      input.sourceId ?? null,
      input.score,
      input.reason?.slice(0, 500) ?? null,
    ],
  );
  return id;
}

export function candidateStatus(id: string, status: "candidate" | "selected" | "rejected" | "duplicate" | "failed"): void {
  run("UPDATE discovered_candidates SET status = ? WHERE id = ?", [status, id]);
}

/* -------------------------------------------------------------------- jobs */

export function createJob(input: {
  candidateId?: string | null;
  payload: Record<string, unknown>;
  stage?: Stage;
  state?: JobState;
}): string {
  const id = newId();
  run(
    `INSERT INTO ingestion_jobs (id, candidate_id, payload, stage, state, next_run_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
    [id, input.candidateId ?? null, json(input.payload), input.stage ?? "selected", input.state ?? "queued"],
  );
  recordEvent(id, input.stage ?? "selected", input.state ?? "queued", "Job queued.");
  return id;
}

export function setJobStage(
  jobId: string,
  stage: Stage,
  patch: { progress?: number; state?: JobState; error?: string | null; nextRunAt?: string | null } = {},
): void {
  run(
    `UPDATE ingestion_jobs
        SET stage = ?, progress = COALESCE(?, progress), state = COALESCE(?, state),
            last_error = ?, next_run_at = COALESCE(?, next_run_at),
            lease_owner = NULL, lease_expires_at = NULL,
            updated_at = datetime('now'),
            completed_at = CASE WHEN ?='completed' THEN datetime('now') ELSE completed_at END
      WHERE id = ?`,
    [
      stage,
      patch.progress ?? null,
      patch.state ?? null,
      patch.error ?? null,
      patch.nextRunAt ?? null,
      patch.state ?? "",
      jobId,
    ],
  );
}

export function advanceJob(
  jobId: string,
  options: { progress?: number; message?: string; detail?: unknown; state?: JobState } = {},
): void {
  const job = getJobRecord(jobId);
  if (!job) return;
  const stage = nextStage(job.stage as Stage);
  const state = options.state ?? "queued";
  setJobStage(jobId, stage, { progress: options.progress ?? job.progress, state });
  recordEvent(jobId, stage, state, options.message ?? `Entered ${stage.replace(/_/g, " ")}.`, "info", options.detail);
}

/**
 * Atomically leases the next runnable job. Expired leases are reclaimed so a
 * crashed worker never strands a job.
 */
export function leaseNextJob(owner: string, leaseSeconds = 120): JobRecord | null {
  return transaction((db) => {
    const row = db
      .prepare(
        `SELECT * FROM ingestion_jobs
          WHERE state IN ('queued','running','retry_scheduled')
            AND stage NOT IN ('awaiting_selection','awaiting_approval')
            AND (lease_expires_at IS NULL OR lease_expires_at < datetime('now'))
            AND (next_run_at IS NULL OR next_run_at <= datetime('now'))
          ORDER BY created_at ASC LIMIT 1`,
      )
      .get() as JobRecord | undefined;
    if (!row) return null;
    db.prepare(
      `UPDATE ingestion_jobs
          SET lease_owner = ?, lease_expires_at = datetime('now', ?), state = 'running',
              attempt = attempt + 1, updated_at = datetime('now')
        WHERE id = ?`,
    ).run(owner, `+${leaseSeconds} seconds`, row.id);
    return db.prepare("SELECT * FROM ingestion_jobs WHERE id = ?").get(row.id) as JobRecord;
  });
}

export function heartbeat(jobId: string, owner: string, leaseSeconds = 120): void {
  run(
    `UPDATE ingestion_jobs SET lease_expires_at = datetime('now', ?) WHERE id = ? AND lease_owner = ?`,
    [`+${leaseSeconds} seconds`, jobId, owner],
  );
}

export function failJob(jobId: string, error: string, retry: boolean): void {
  const job = getJobRecord(jobId);
  if (!job) return;
  if (retry && job.attempt < job.max_attempts) {
    const backoffSeconds = Math.min(30 * 2 ** Math.max(job.attempt - 1, 0), 900);
    run(
      `UPDATE ingestion_jobs
          SET state='retry_scheduled', last_error=?, lease_owner=NULL, lease_expires_at=NULL,
              next_run_at=datetime('now', ?), updated_at=datetime('now')
        WHERE id = ?`,
      [error.slice(0, 2000), `+${backoffSeconds} seconds`, jobId],
    );
    recordEvent(jobId, job.stage, "retry_scheduled", `Attempt ${job.attempt} failed; retrying in ${backoffSeconds}s.`, "warn", {
      error: error.slice(0, 800),
    });
    return;
  }
  run(
    `UPDATE ingestion_jobs
        SET state='failed', last_error=?, lease_owner=NULL, lease_expires_at=NULL, updated_at=datetime('now')
      WHERE id = ?`,
    [error.slice(0, 2000), jobId],
  );
  recordEvent(jobId, job.stage, "failed", error.slice(0, 800), "error");
}

export function setJobState(jobId: string, state: JobState, message: string): void {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  run(
    `UPDATE ingestion_jobs SET state=?, lease_owner=NULL, lease_expires_at=NULL, updated_at=datetime('now') WHERE id=?`,
    [state, jobId],
  );
  recordEvent(jobId, job.stage, state, message);
}

export function retryJob(jobId: string, reason: string): void {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  if (job.state === "completed") throw new Error("Completed jobs cannot be retried; reprocess the document instead.");
  run(
    `UPDATE ingestion_jobs
        SET state='queued', attempt=0, last_error=NULL, next_run_at=datetime('now'),
            lease_owner=NULL, lease_expires_at=NULL, updated_at=datetime('now')
      WHERE id=?`,
    [jobId],
  );
  recordEvent(jobId, job.stage, "queued", reason);
}

export function cancelJob(jobId: string, reason: string): void {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  run(
    `UPDATE ingestion_jobs SET state='cancelled', lease_owner=NULL, lease_expires_at=NULL,
        updated_at=datetime('now') WHERE id=?`,
    [jobId],
  );
  recordEvent(jobId, job.stage, "cancelled", reason);
}

/** Jobs waiting at a hold stage are resumed explicitly by an administrator. */
export function resumeJob(jobId: string, reason: string): void {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  if (HOLD_STAGES.includes(job.stage as Stage)) throw new Error("This job is waiting for a decision, not paused.");
  run(
    `UPDATE ingestion_jobs SET state='queued', next_run_at=datetime('now'), updated_at=datetime('now') WHERE id=?`,
    [jobId],
  );
  recordEvent(jobId, job.stage, "queued", reason);
}

export function pausedJobCount(): number {
  return Number(one<{ count: number }>("SELECT COUNT(*) AS count FROM ingestion_jobs WHERE state='paused'")?.count ?? 0);
}

export function expiredLeaseCount(): number {
  return Number(
    one<{ count: number }>(
      "SELECT COUNT(*) AS count FROM ingestion_jobs WHERE lease_expires_at IS NOT NULL AND lease_expires_at < datetime('now') AND state='running'",
    )?.count ?? 0,
  );
}

export function queuedJobStages(): { stage: string; state: string; count: number }[] {
  return all<{ stage: string; state: string; count: number }>(
    "SELECT stage, state, COUNT(*) AS count FROM ingestion_jobs GROUP BY stage, state",
  );
}
