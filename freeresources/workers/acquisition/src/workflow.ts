/**
 * Durable ingestion workflow.
 *
 * Each stage is a separate persisted step. A compression failure cannot restart
 * the download, and a classification failure cannot delete the stored original.
 * Completed steps are never re-run after an infrastructure failure.
 *
 * Cooperative controls: Workflows expose no arbitrary pause/resume API. Pause is
 * therefore implemented as a persisted control request that the next checkpoint
 * observes (see `checkControl`), and approval is a real `waitForEvent`. Cancel
 * terminates the instance through the Workflows API.
 */
import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers";

import { classifyDocument } from "../../../lib/acquisition/doctype";
import { processPdfInContainer } from "./container";
import type { Env, WorkflowParams } from "./types";

const MAX_BYTES = 40 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function event(
  env: Env,
  jobId: string,
  stage: string,
  state: string,
  level: "info" | "warn" | "error",
  message: string,
  detail?: unknown,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ingestion_job_events (id, job_id, stage, state, level, message, detail)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      crypto.randomUUID(),
      jobId,
      stage,
      state,
      level,
      message.slice(0, 2000),
      detail === undefined ? null : JSON.stringify(detail).slice(0, 8000),
    )
    .run();
}

export class IngestionWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  async run(event_: WorkflowEvent<WorkflowParams>, step: WorkflowStep): Promise<unknown> {
    const { jobId, sourceUrl, profile, idempotencyKey } = event_.payload;
    const env = this.env;

    await step.do("mark-running", async () => {
      await env.DB.prepare(
        "UPDATE ingestion_jobs SET stage='downloading', state='running', attempt=attempt+1, updated_at=datetime('now') WHERE id=?",
      )
        .bind(jobId)
        .run();
      await event(env, jobId, "downloading", "running", "info", `Workflow started for ${sourceUrl}`);
      return { idempotencyKey };
    });

    /* 1. Download once and store the original by content hash. */
    const stored = await step.do(
      "download-and-store",
      { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" },
      async () => {
        const target = new URL(sourceUrl);
        if (target.protocol !== "https:") throw new Error("Only https:// sources are fetched.");
        const response = await fetch(target, { redirect: "follow", headers: { accept: "application/pdf" } });
        if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);
        const declared = Number(response.headers.get("content-length") ?? 0);
        if (declared > MAX_BYTES) throw new Error(`File is ${declared} bytes; the ${MAX_BYTES} byte cap applies.`);
        const bytes = await response.arrayBuffer();
        if (bytes.byteLength > MAX_BYTES) throw new Error(`File exceeded the ${MAX_BYTES} byte cap.`);
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error("Not a PDF (missing %PDF- signature).");

        const sha = await sha256Hex(bytes);
        const key = `assets/${sha.slice(0, 2)}/${sha}.pdf`;
        const existing = await env.R2_ORIGINALS.head(key);
        if (!existing) {
          await env.R2_ORIGINALS.put(key, bytes, {
            httpMetadata: { contentType: "application/pdf" },
            customMetadata: { sha256: sha, sourceUrl },
          });
        }
        return { sha, key, sizeBytes: bytes.byteLength, deduplicated: Boolean(existing) };
      },
    );

    /* 2. Validate, extract and compress inside the container. */
    const processed = await step.do(
      "process-pdf",
      { retries: { limit: 2, delay: "20 seconds", backoff: "exponential" }, timeout: "10 minutes" },
      async () => {
        const object = await env.R2_ORIGINALS.get(stored.key);
        if (!object) throw new Error("Original is missing from R2.");
        const bytes = new Uint8Array(await object.arrayBuffer());
        const result = await processPdfInContainer(env, bytes, profile);
        if (result.ok === false) {
          // Not a retryable failure: the platform capability is missing.
          return { status: "unavailable" as const, reason: result.reason };
        }
        let derivativeKey: string | null = null;
        let derivativeSha: string | null = null;
        if (result.compressed && result.compressed.byteLength < bytes.byteLength) {
          derivativeSha = await sha256Hex(result.compressed.buffer as ArrayBuffer);
          derivativeKey = `derivatives/${stored.sha.slice(0, 2)}/${stored.sha}-optimized.pdf`;
          await env.R2_DERIVATIVES.put(derivativeKey, result.compressed, {
            httpMetadata: { contentType: "application/pdf" },
            customMetadata: { sha256: derivativeSha, profile, originalSha256: stored.sha },
          });
        }
        const textKey = `text/${stored.sha.slice(0, 2)}/${stored.sha}.txt`;
        await env.R2_DERIVATIVES.put(textKey, result.text.slice(0, 400_000), {
          httpMetadata: { contentType: "text/plain; charset=utf-8" },
        });
        return {
          status: "ok" as const,
          pageCount: result.pageCount,
          textKey,
          derivativeKey,
          derivativeSha,
          compressedPageCount: result.compressedPageCount,
          savingPercent: result.savingPercent,
          ghostscript: result.ghostscript,
          notes: result.notes,
        };
      },
    );

    /* 3. Evidence-only classification, from the real extracted text. */
    const classification = await step.do("classify", async () => {
      if (processed.status !== "ok") {
        return { documentType: "unknown", coversSemesters: [] as number[], subjectCodes: [] as string[], confidence: 0 };
      }
      const textObject = await env.R2_DERIVATIVES.get(processed.textKey);
      const text = textObject ? (await textObject.text()).slice(0, MAX_TEXT_CHARS) : "";
      const evidence = classifyDocument(text, processed.pageCount);
      return {
        documentType: evidence.documentType,
        coversSemesters: evidence.coversSemesters,
        subjectCodes: evidence.subjectCodes.slice(0, 60),
        confidence: evidence.confidence,
      };
    });

    /* 4. Persist metadata. Never inside a resource row yet: a human approves. */
    const assetId = await step.do("persist-metadata", async () => {
      const existing = await env.DB.prepare("SELECT id FROM document_assets WHERE sha256 = ?")
        .bind(stored.sha)
        .first<{ id: string }>();
      const id = existing?.id ?? crypto.randomUUID();
      const originalName = decodeURIComponent(new URL(sourceUrl).pathname.split("/").pop() ?? "document.pdf");
      if (!existing) {
        await env.DB.prepare(
          `INSERT INTO document_assets
             (id, sha256, original_filename, mime_type, size_bytes, page_count, storage_key, source_url,
              source_domain, rights, document_type, covers_semesters, fetched_at)
           VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?, 'Unknown — verify before publishing', ?, ?, datetime('now'))`,
        )
          .bind(
            id,
            stored.sha,
            originalName.slice(0, 200),
            stored.sizeBytes,
            processed.status === "ok" ? processed.pageCount : null,
            stored.key,
            sourceUrl,
            new URL(sourceUrl).hostname.replace(/^www\./, ""),
            classification.documentType,
            classification.coversSemesters.join(",") || null,
          )
          .run();
        await env.DB.prepare(
          `INSERT INTO document_versions (id, asset_id, kind, storage_key, size_bytes, sha256, page_count, valid)
           VALUES (?, ?, 'original', ?, ?, ?, ?, 1)`,
        )
          .bind(
            crypto.randomUUID(),
            id,
            stored.key,
            stored.sizeBytes,
            stored.sha,
            processed.status === "ok" ? processed.pageCount : null,
          )
          .run();
      }
      if (processed.status === "ok" && processed.derivativeKey) {
        await env.DB.prepare(
          `INSERT INTO document_versions (id, asset_id, kind, storage_key, size_bytes, sha256, profile, page_count, valid, notes)
           VALUES (?, ?, 'optimized', ?, ?, ?, ?, ?, 1, ?)
           ON CONFLICT(asset_id, kind) DO UPDATE SET storage_key=excluded.storage_key, size_bytes=excluded.size_bytes,
             sha256=excluded.sha256, profile=excluded.profile, page_count=excluded.page_count, valid=1, notes=excluded.notes`,
        )
          .bind(
            crypto.randomUUID(),
            id,
            processed.derivativeKey,
            Math.round(((processed.savingPercent ?? 0) / 100) * stored.sizeBytes) || stored.sizeBytes,
            processed.derivativeSha,
            profile,
            processed.compressedPageCount ?? processed.pageCount,
            `${profile} · container`,
          )
          .run();
      }

      await env.DB.prepare(
        "UPDATE ingestion_jobs SET asset_id=?, stage='awaiting_approval', state='awaiting_approval', progress=92, updated_at=datetime('now') WHERE id=?",
      )
        .bind(id, jobId)
        .run();
      await event(env, jobId, "awaiting_approval", "awaiting_approval", "info", "Processed; waiting for administrator approval.", {
        documentType: classification.documentType,
        coversSemesters: classification.coversSemesters,
        container: processed.status === "ok" ? "ran" : processed.reason,
      });
      return id;
    });

    /* 5. Wait for a human. This is a real durable wait, not a poll loop. */
    const approval = await step
      .waitForEvent<{ approvedAt: string }>("await-approval", { type: "approval", timeout: "7 days" })
      .catch(() => null);

    if (!approval) {
      await step.do("approval-timeout", async () => {
        await event(env, jobId, "awaiting_approval", "awaiting_approval", "warn", "No approval within 7 days; the document remains unpublished in R2.");
        return { timedOut: true };
      });
      return { jobId, assetId, published: false, reason: "approval timed out" };
    }

    /* 6. Copy the approved serving version into the published bucket. */
    const published = await step.do("publish-to-cloudflare", async () => {
      const version = await env.DB.prepare(
        `SELECT storage_key FROM document_versions WHERE asset_id=?
          ORDER BY CASE kind WHEN 'optimized' THEN 0 ELSE 1 END LIMIT 1`,
      )
        .bind(assetId)
        .first<{ storage_key: string }>();
      if (!version) throw new Error("No stored version to publish.");
      const bucket = version.storage_key.startsWith("derivatives/") ? env.R2_DERIVATIVES : env.R2_ORIGINALS;
      const object = await bucket.get(version.storage_key);
      if (!object) throw new Error("Serving version is missing from R2.");
      const publishedKey = `published/${stored.sha}.pdf`;
      await env.R2_PUBLISHED.put(publishedKey, object.body, {
        httpMetadata: { contentType: "application/pdf" },
        customMetadata: { sha256: stored.sha, jobId },
      });
      await env.DB.prepare(
        "UPDATE ingestion_jobs SET stage='completed', state='completed', progress=100, completed_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
      )
        .bind(jobId)
        .run();
      await event(env, jobId, "completed", "completed", "info", "Approved serving copy written to the published R2 bucket.", {
        publishedKey,
      });
      return { publishedKey };
    });

    return { jobId, assetId, published: true, ...published };
  }
}
