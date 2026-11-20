/**
 * FreeResources acquisition worker.
 *
 * Runs the durable ingestion queue and the discovery scheduler in a long-lived
 * process, outside Next.js request handlers. Safe to stop at any time: jobs are
 * leased from SQLite, so unfinished work is re-leased when the worker restarts.
 *
 *   npm run worker            # continuous
 *   npm run worker -- --once  # drain the queue, then exit (CI / acceptance tests)
 */
import os from "node:os";
import { randomUUID } from "node:crypto";

import { loadEnv } from "../lib/acquisition/env";

// Must run before any module reads process.env (storage, AI, search).
loadEnv();

import { all, one, run } from "../lib/db";
import { executeDiscoveryRun } from "../lib/acquisition/discovery";
import { leaseNextJob, recordEvent, setRunStatus } from "../lib/acquisition/queue";
import { processJob } from "../lib/acquisition/pipeline";
import { getSettings, setSetting } from "../lib/acquisition/store";

const WORKER_ID = `${os.hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const POLL_MS = Number(process.env.WORKER_POLL_MS || 2000);
const ONCE = process.argv.includes("--once");
const MAX_ITERATIONS = ONCE ? 400 : Number.POSITIVE_INFINITY;

let stopping = false;

function log(message: string, detail?: unknown): void {
  const stamp = new Date().toISOString();
  console.log(`[${stamp}] [${WORKER_ID}] ${message}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
}

async function runDiscoveryQueue(): Promise<boolean> {
  const pending = one<{ id: string; triggered_by: string | null }>(
    "SELECT id, triggered_by FROM discovery_runs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1",
  );
  if (!pending) return false;

  setRunStatus(pending.id, "running");
  log("discovery run started", { runId: pending.id });
  try {
    await executeDiscoveryRun(pending.id, pending.triggered_by);
    log("discovery run finished", { runId: pending.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discovery failed.";
    setRunStatus(pending.id, "failed", { error: message });
    log("discovery run failed", { runId: pending.id, error: message });
  }
  return true;
}

async function processOneJob(): Promise<boolean> {
  const job = leaseNextJob(WORKER_ID, 300);
  if (!job) return false;
  log("job leased", { jobId: job.id, stage: job.stage, attempt: job.attempt });
  const started = Date.now();
  await processJob(job.id);
  const after = one<{ stage: string; state: string }>("SELECT stage, state FROM ingestion_jobs WHERE id = ?", [job.id]);
  log("job processed", { jobId: job.id, stage: after?.stage, state: after?.state, ms: Date.now() - started });
  return true;
}

/* ---------------------------------------------------------------- scheduler */

function dueForDaily(): boolean {
  const settings = getSettings();
  const last = settings.last_daily_run_at;
  if (!last) return true;
  const intervalMinutes = Math.max(5, Number(settings.discovery_interval_minutes) || 1440);
  return Date.now() - new Date(last).getTime() >= intervalMinutes * 60_000;
}

function dueForWeekly(): boolean {
  const settings = getSettings();
  if (!settings.last_weekly_run_at) return true;
  const hours = Math.max(1, Number(settings.source_recheck_hours) || 168);
  return Date.now() - new Date(settings.last_weekly_run_at).getTime() >= hours * 3_600_000;
}

async function schedulerTick(): Promise<void> {
  const settings = getSettings();
  if (settings.scheduler_enabled !== "1") return;

  if (dueForDaily()) {
    const runId = randomUUID();
    run(
      `INSERT INTO discovery_runs (id, mode, scope, status, created_at) VALUES (?, 'scheduled', ?, 'queued', datetime('now'))`,
      [runId, JSON.stringify({ universitySlug: "aktu", limit: 10, reason: "daily" })],
    );
    setSetting("last_daily_run_at", new Date().toISOString());
    recordEvent(runId, "discovering", "queued", "Daily coverage-gap discovery queued by the scheduler.");
    log("scheduled daily discovery", { runId });
  }

  if (dueForWeekly()) {
    run(
      `UPDATE discovery_sources SET last_checked_at=datetime('now'),
          next_check_at=datetime('now', '+' || CAST(? AS TEXT) || ' hours')
        WHERE enabled=1`,
      [settings.source_recheck_hours],
    );
    const runId = randomUUID();
    run(
      `INSERT INTO discovery_runs (id, mode, scope, status, created_at) VALUES (?, 'source', ?, 'queued', datetime('now'))`,
      [runId, JSON.stringify({ universitySlug: "aktu", limit: 15, reason: "weekly-source-recheck" })],
    );
    setSetting("last_weekly_run_at", new Date().toISOString());
    log("scheduled weekly source recheck", { runId });
  }
}

/* --------------------------------------------------------------------- loop */

async function main(): Promise<void> {
  log("worker started", {
    once: ONCE,
    pollMs: POLL_MS,
    pendingJobs: all("SELECT id FROM ingestion_jobs WHERE state IN ('queued','retry_scheduled')").length,
  });

  let iterations = 0;
  while (!stopping && iterations < MAX_ITERATIONS) {
    iterations += 1;
    let didWork = false;

    try {
      didWork = (await processOneJob()) || didWork;
      if (!didWork) didWork = await runDiscoveryQueue();
      await schedulerTick();
    } catch (error) {
      log("worker loop error", { error: error instanceof Error ? error.message : String(error) });
    }

    if (ONCE && !didWork) break;
    if (!didWork) await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }

  log("worker stopped");
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (stopping) process.exit(0);
    stopping = true;
    log(`${signal} received; finishing the current job before exit`);
  });
}

main().catch((error) => {
  console.error("Worker crashed:", error);
  process.exit(1);
});
