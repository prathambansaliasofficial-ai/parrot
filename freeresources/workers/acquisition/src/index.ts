/**
 * Durable acquisition Worker.
 *
 * This Worker owns the Cloudflare-native execution path:
 *   - Queues      dispatch discovery and ingestion work (at-least-once)
 *   - Workflows   run each ingestion stage as a persisted, retryable step
 *   - Containers  run Ghostscript / PDF text extraction (native binaries)
 *   - Cron        queue daily gap discovery and weekly source rechecks
 *   - D1          single source of truth for job state and candidates
 *   - R2          originals, derivatives and extracted text
 *
 * The Next.js site is deployed separately through @opennextjs/cloudflare.
 * Nothing here writes to SQLite, and nothing here touches PG Hunter.
 */
import { IngestionWorkflow } from "./workflow";
import { containerAvailable } from "./container";
import { runDiscovery } from "./discovery";
import type { DiscoveryMessage, Env, IngestionMessage } from "./types";

export { IngestionWorkflow };

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), { status, headers: JSON_HEADERS });
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return diff === 0;
}

/** Mutations require the server-side token. Missing config fails closed. */
function authorise(request: Request, env: Env): Response | null {
  if (!env.ADMIN_API_TOKEN) {
    return json(
      {
        error: "not_configured",
        message:
          "ADMIN_API_TOKEN is not set on this Worker. Set it with `wrangler secret put ADMIN_API_TOKEN` before using the mutation API.",
      },
      503,
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !constantTimeEqual(token, env.ADMIN_API_TOKEN)) {
    return json({ error: "unauthorised" }, 401);
  }
  return null;
}

/** Stable idempotency key for a source document + subject context. */
async function jobIdFor(sourceUrl: string, subjectId: string): Promise<string> {
  const input = new TextEncoder().encode(`${sourceUrl}\n${subjectId}`);
  const digest = await crypto.subtle.digest("SHA-256", input);
  const bytes = [...new Uint8Array(digest)].slice(0, 16);
  const hex = bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

async function startWorkflow(env: Env, jobId: string): Promise<"started" | "already_running"> {
  const row = await env.DB.prepare("SELECT payload, stage, state FROM ingestion_jobs WHERE id = ?").bind(jobId).first<{
    payload: string | null;
    stage: string;
    state: string;
  }>();
  const payload = row?.payload ? (JSON.parse(row.payload) as Record<string, unknown>) : {};
  const params = {
    jobId,
    sourceUrl: String(payload.sourceUrl ?? ""),
    profile: (payload.profile as "balanced") ?? "balanced",
    idempotencyKey: jobId,
  };
  try {
    await env.INGESTION_WORKFLOW.create({ id: `job-${jobId}`, params });
    return "started";
  } catch {
    // The instance already exists: duplicate delivery is a no-op, not a failure.
    return "already_running";
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (path === "/health" && request.method === "GET") {
      const checks: Record<string, unknown> = {};
      let ok = true;
      try {
        const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
        checks.d1 = row?.ok === 1 ? "ok" : "unexpected_response";
        ok = ok && row?.ok === 1;
      } catch (error) {
        checks.d1 = error instanceof Error ? error.message : "failed";
        ok = false;
      }
      try {
        await env.R2_ORIGINALS.list({ limit: 1 });
        checks.r2_originals = "ok";
      } catch (error) {
        checks.r2_originals = error instanceof Error ? error.message : "failed";
        ok = false;
      }
      checks.workflow_binding = env.INGESTION_WORKFLOW ? "bound" : "missing";
      checks.container_binding = containerAvailable(env)
        ? "bound"
        : "missing (deploy workers/pdf-container and bind PDF_PROCESSOR)";
      checks.admin_api = env.ADMIN_API_TOKEN ? "configured" : "disabled (ADMIN_API_TOKEN missing)";
      checks.environment = env.ENVIRONMENT;
      return json({ ok, checks }, ok ? 200 : 503);
    }

    if (path === "/jobs" && request.method === "GET") {
      const state = url.searchParams.get("state");
      const rows = state
        ? await env.DB.prepare(
            "SELECT id, stage, state, attempt, last_error, updated_at FROM ingestion_jobs WHERE state = ? ORDER BY updated_at DESC LIMIT 100",
          )
            .bind(state)
            .all()
        : await env.DB.prepare(
            "SELECT id, stage, state, attempt, last_error, updated_at FROM ingestion_jobs ORDER BY updated_at DESC LIMIT 100",
          ).all();
      return json({ jobs: rows.results });
    }

    const jobMatch = path.match(/^\/jobs\/([0-9a-f-]{36})$/);
    if (jobMatch && request.method === "GET") {
      const job = await env.DB.prepare("SELECT * FROM ingestion_jobs WHERE id = ?").bind(jobMatch[1]).first();
      if (!job) return json({ error: "not_found" }, 404);
      const events = await env.DB.prepare(
        "SELECT stage, state, level, message, created_at FROM ingestion_job_events WHERE job_id = ? ORDER BY created_at ASC",
      )
        .bind(jobMatch[1])
        .all();
      return json({ job, events: events.results });
    }

    if (path === "/jobs" && request.method === "POST") {
      const denied = authorise(request, env);
      if (denied) return denied;
      const body = (await request.json().catch(() => null)) as
        | { sourceUrl?: string; subjectId?: string; profile?: string }
        | null;
      if (!body?.sourceUrl || !body?.subjectId) {
        return json({ error: "invalid_request", message: "sourceUrl and subjectId are required." }, 400);
      }
      let parsed: URL;
      try {
        parsed = new URL(body.sourceUrl);
      } catch {
        return json({ error: "invalid_request", message: "sourceUrl must be an absolute URL." }, 400);
      }
      if (parsed.protocol !== "https:") {
        return json({ error: "invalid_request", message: "Only https:// sources are accepted." }, 400);
      }

      const jobId = await jobIdFor(body.sourceUrl, body.subjectId);
      const payload = JSON.stringify({
        sourceUrl: body.sourceUrl,
        subjectId: body.subjectId,
        profile: body.profile ?? "balanced",
      });
      const inserted = await env.DB.prepare(
        `INSERT OR IGNORE INTO ingestion_jobs (id, payload, stage, state, next_run_at)
         VALUES (?, ?, 'selected', 'queued', datetime('now'))`,
      )
        .bind(jobId, payload)
        .run();
      const created = (inserted.meta?.changes ?? 0) > 0;
      if (created) {
        await env.DB.prepare(
          `INSERT INTO ingestion_job_events (id, job_id, stage, state, level, message)
           VALUES (?, ?, 'selected', 'queued', 'info', ?)`,
        )
          .bind(crypto.randomUUID(), jobId, "Queued by the Cloudflare API (idempotent job id).")
          .run();
      }
      await env.INGESTION_QUEUE.send({ type: "ingest", jobId });
      return json({ jobId, created, idempotent: !created }, created ? 202 : 200);
    }

    const approveMatch = path.match(/^\/jobs\/([0-9a-f-]{36})\/approve$/);
    if (approveMatch && request.method === "POST") {
      const denied = authorise(request, env);
      if (denied) return denied;
      const instance = await env.INGESTION_WORKFLOW.get(`job-${approveMatch[1]}`);
      try {
        await instance.sendEvent({ type: "approval", payload: { approvedAt: new Date().toISOString() } });
        return json({ ok: true, message: "Approval event delivered to the workflow instance." });
      } catch (error) {
        return json(
          {
            ok: false,
            error: "workflow_unavailable",
            message:
              error instanceof Error
                ? error.message
                : "No running workflow instance. Cooperative controls require the job to be mid-workflow.",
          },
          409,
        );
      }
    }

    if (path === "/runs" && request.method === "POST") {
      const denied = authorise(request, env);
      if (denied) return denied;
      const runId = crypto.randomUUID();
      await env.DB.prepare(
        `INSERT INTO discovery_runs (id, mode, scope, status, created_at)
         VALUES (?, 'manual', ?, 'queued', datetime('now'))`,
      )
        .bind(runId, JSON.stringify({ universitySlug: env.ACQUISITION_UNIVERSITY_SLUG }))
        .run();
      await env.DISCOVERY_QUEUE.send({ type: "discover", runId });
      return json({ runId, status: "queued" }, 202);
    }

    return json({ error: "not_found" }, 404);
  },

  async queue(batch: MessageBatch<IngestionMessage | DiscoveryMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      try {
        if (message.body.type === "ingest") {
          const result = await startWorkflow(env, message.body.jobId);
          if (result === "already_running") {
            console.log(`[queue] duplicate delivery for job ${message.body.jobId}; workflow already exists.`);
          }
          message.ack();
        } else if (message.body.type === "discover") {
          await runDiscovery(env, message.body.runId);
          message.ack();
        } else {
          message.ack(); // Unknown shape: do not retry forever.
        }
      } catch (error) {
        console.error(`[queue] message failed: ${error instanceof Error ? error.message : String(error)}`);
        message.retry();
      }
    }
  },

  async scheduled(controller: ScheduledController, env: Env): Promise<void> {
    // "0 2 * * *" daily gap discovery, "0 3 * * 1" weekly source recheck.
    const weekly = controller.cron === "0 3 * * 1";
    const runId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO discovery_runs (id, mode, scope, status, created_at)
       VALUES (?, 'scheduled', ?, 'queued', datetime('now'))`,
    )
      .bind(
        runId,
        JSON.stringify({
          universitySlug: env.ACQUISITION_UNIVERSITY_SLUG,
          reason: weekly ? "weekly-source-recheck" : "daily",
          cron: controller.cron,
        }),
      )
      .run();
    await env.DISCOVERY_QUEUE.send({ type: "discover", runId });
    console.log(`[cron] ${controller.cron} queued discovery run ${runId}`);
  },
};
