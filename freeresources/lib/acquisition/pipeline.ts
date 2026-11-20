import { randomUUID } from "node:crypto";

import { all, one, run } from "../db";
import { slugify } from "../format";
import { storePdfBuffer } from "../storage";
import { aiConfig, classifyDocument } from "./ai";
import { DOCUMENT_TYPE_LABELS, classifyDocument as classifyEvidence } from "./doctype";
import { buildDocumentName } from "./naming";
import { compressPdf, extractText, inspectPdf, sha256 } from "./pdf";
import {
  advanceJob,
  failJob,
  getJobRecord,
  parsePayload,
  recordEvent,
  setJobStage,
  setJobState,
  updatePayload,
  type JobRecord,
} from "./queue";
import { FetchBlocked, fetchPdf } from "./safety";
import { getSettings } from "./store";
import { storage } from "./storage";
import { STAGES, isProfile, stageIndex, type JobState, type Stage } from "./types";

/**
 * Stage handlers for the ingestion pipeline.
 *
 * Every handler is idempotent: it reads its inputs from storage/database, writes
 * results, and advances the job. A crashed or restarted worker re-leases the same
 * job and re-enters the same stage without duplicating records.
 */

const PERMANENT_FETCH_FAILURES = new Set([
  "robots_disallowed",
  "private_address",
  "bad_scheme",
  "not_pdf",
  "too_large",
  "credentials_in_url",
  "invalid_url",
]);

function progressFor(stage: Stage): number {
  return Math.min(99, Math.round((stageIndex(stage) / (STAGES.length - 1)) * 100));
}

function stagingKey(jobId: string): string {
  return `staging/${jobId}.pdf`;
}

function stagingTextKey(jobId: string): string {
  return `staging/${jobId}.txt`;
}

async function cleanupStaging(jobId: string): Promise<void> {
  await storage().delete(stagingKey(jobId)).catch(() => undefined);
  await storage().delete(stagingTextKey(jobId)).catch(() => undefined);
}

async function readStagedPdf(job: JobRecord): Promise<Buffer> {
  const payload = parsePayload(job);
  const key = typeof payload.stagedKey === "string" ? payload.stagedKey : stagingKey(job.id);
  return storage().get(key);
}

function requireContext(payload: Record<string, unknown>): {
  subjectId: string;
  subjectName: string;
  semester: number;
  universitySlug: string;
  programmeSlug: string;
  branchSlug: string | null;
  curriculumId: string | null;
} {
  const subjectId = typeof payload.subjectId === "string" ? payload.subjectId : "";
  if (!subjectId) throw new Error("Job is missing its subject context.");
  return {
    subjectId,
    subjectName: typeof payload.subjectName === "string" ? payload.subjectName : "Subject",
    semester: typeof payload.semester === "number" ? payload.semester : 0,
    universitySlug: typeof payload.universitySlug === "string" ? payload.universitySlug : "aktu",
    programmeSlug: typeof payload.programmeSlug === "string" ? payload.programmeSlug : "",
    branchSlug: typeof payload.branchSlug === "string" ? payload.branchSlug : null,
    curriculumId: typeof payload.curriculumId === "string" ? payload.curriculumId : null,
  };
}

/**
 * The real name the publisher gave the file. Never the discovery query's
 * subject: a 100-page CSE stream document must not be stored as
 * "Data Structures.pdf".
 */
function sourceFilenameFromUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return /\.pdf$/i.test(name) && name.length <= 200 ? name : null;
  } catch {
    return null;
  }
}

/* --------------------------------------------------------------- stage work */

async function downloading(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  const candidate = job.candidate_id
    ? one<{ url: string }>("SELECT url FROM discovered_candidates WHERE id = ?", [job.candidate_id])
    : undefined;
  const url = typeof payload.sourceUrl === "string" ? payload.sourceUrl : candidate?.url;
  if (!url) throw new Error("Job has no source URL.");

  const settings = getSettings();
  const maxBytes = Math.max(1, Number(settings.max_download_mb)) * 1024 * 1024;
  recordEvent(job.id, "downloading", "running", `Fetching ${url}`, "info");
  const fetched = await fetchPdf(url, { maxBytes });
  const hash = sha256(fetched.bytes);
  await storage().put(stagingKey(job.id), fetched.bytes);
  updatePayload(job.id, {
    stagedKey: stagingKey(job.id),
    sha256: hash,
    sizeBytes: fetched.bytes.byteLength,
    finalUrl: fetched.finalUrl,
    fetchedAt: new Date().toISOString(),
  });
  advanceJob(job.id, { progress: progressFor("validating"), message: `Downloaded ${Math.round(fetched.bytes.byteLength / 1024)} KB (SHA-256 ${hash.slice(0, 12)}…).` });
}

async function validating(job: JobRecord): Promise<void> {
  const bytes = await readStagedPdf(job);
  const inspection = await inspectPdf(bytes);
  if (!inspection.valid) {
    await cleanupStaging(job.id);
    setJobState(job.id, "needs_review", `PDF validation failed: ${inspection.reason ?? "unreadable file"}.`);
    return;
  }
  updatePayload(job.id, { pageCount: inspection.pageCount, encrypted: inspection.encrypted, riskyMarkers: inspection.riskyMarkers });
  advanceJob(job.id, {
    progress: progressFor("safety_check"),
    message: `Valid PDF · ${inspection.pageCount} page${inspection.pageCount === 1 ? "" : "s"}.`,
  });
}

/**
 * Markers that are ordinary document features rather than executable content.
 * Official AKTU syllabi are published as "hyperlinked" PDFs, so a /URI entry is
 * expected; blocking those would reject the authoritative source. Scripts,
 * launch actions, embedded files and rich media still require manual review.
 */
const BENIGN_PDF_MARKERS = new Set(["/URI"]);

async function safetyCheck(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  const risky = Array.isArray(payload.riskyMarkers) ? (payload.riskyMarkers as string[]) : [];
  const encrypted = payload.encrypted === true;
  const blocking = risky.filter((marker) => !BENIGN_PDF_MARKERS.has(marker));
  const benign = risky.filter((marker) => BENIGN_PDF_MARKERS.has(marker));

  if (encrypted) {
    setJobState(job.id, "needs_review", "The PDF is encrypted; an administrator must confirm it is safe before processing.");
    return;
  }
  if (blocking.length > 0) {
    setJobState(
      job.id,
      "needs_review",
      `The PDF contains active content (${blocking.join(", ")}). Manual review required before it is served.`,
    );
    return;
  }
  advanceJob(job.id, {
    progress: progressFor("text_extraction"),
    message: benign.length
      ? `No scripts, launch actions or embedded files detected (hyperlinks present: ${benign.join(", ")}).`
      : "No scripts, launch actions or embedded files detected.",
  });
}

async function textExtraction(job: JobRecord): Promise<void> {
  const bytes = await readStagedPdf(job);
  let text = "";
  let error: string | null = null;
  try {
    text = await extractText(bytes);
  } catch (caught) {
    error = caught instanceof Error ? caught.message : "Text extraction failed.";
  }
  const payload = parsePayload(job);
  // Deterministic, evidence-only classification. Runs even when no AI provider
  // is configured, so a stream-level document can never be filed as the
  // subject the discovery query happened to mention.
  const evidence = classifyEvidence(text, typeof payload.pageCount === "number" ? payload.pageCount : null);

  await storage().put(stagingTextKey(job.id), Buffer.from(text, "utf8"));
  updatePayload(job.id, {
    textKey: stagingTextKey(job.id),
    textChars: text.length,
    textError: error,
    evidence,
    documentType: evidence.documentType,
    coversSemesters: evidence.coversSemesters,
  });
  advanceJob(job.id, {
    progress: progressFor("ai_classification"),
    message: error
      ? `Text extraction failed (${error.slice(0, 160)}); the document may be a scan.`
      : `Extracted ${text.length.toLocaleString("en-IN")} characters. Detected: ${DOCUMENT_TYPE_LABELS[evidence.documentType]} (${evidence.subjectCodes.length} course codes, semester(s) ${evidence.coversSemesters.join(", ") || "unknown"}).`,
    detail: error ? { error } : { documentType: evidence.documentType, coversSemesters: evidence.coversSemesters },
  });
}

async function aiClassification(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  if (!aiConfig().configured) {
    updatePayload(job.id, { aiSkipped: true });
    advanceJob(job.id, {
      progress: progressFor("duplicate_check"),
      message: "AI classification skipped: no provider is configured (set AI_API_KEY to enable it).",
    });
    return;
  }

  let text = "";
  try {
    const key = typeof payload.textKey === "string" ? payload.textKey : stagingTextKey(job.id);
    text = (await storage().get(key)).toString("utf8");
  } catch {
    text = "";
  }

  try {
    const classification = await classifyDocument({
      filename: typeof payload.suggestedName === "string" ? payload.suggestedName : `${payload.subjectName as string}.pdf`,
      url: typeof payload.finalUrl === "string" ? payload.finalUrl : null,
      text,
    });
    updatePayload(job.id, { ai: classification });
    advanceJob(job.id, {
      progress: progressFor("duplicate_check"),
      message: `AI classified the document with ${Math.round(classification.confidence * 100)}% confidence.`,
      detail: classification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI classification failed.";
    advanceJob(job.id, {
      progress: progressFor("duplicate_check"),
      message: `AI classification unavailable: ${message.slice(0, 200)}`,
    });
  }
}

async function duplicateCheck(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  const hash = String(payload.sha256 ?? "");
  if (!hash) throw new Error("Job is missing its content hash.");

  const existing = one<{ id: string; original_filename: string }>(
    "SELECT id, original_filename FROM document_assets WHERE sha256 = ?",
    [hash],
  );

  if (existing) {
    if (job.candidate_id) run("UPDATE discovered_candidates SET status='duplicate' WHERE id = ?", [job.candidate_id]);
    await cleanupStaging(job.id);
    run("UPDATE ingestion_jobs SET asset_id = ? WHERE id = ?", [existing.id, job.id]);
    setJobStage(job.id, "duplicate_check", { state: "skipped", progress: progressFor("duplicate_check") });
    recordEvent(
      job.id,
      "duplicate_check",
      "skipped",
      `Duplicate document prevented: identical file already stored as "${existing.original_filename}".`,
      "warn",
      { assetId: existing.id, sha256: hash },
    );
    return;
  }

  const bytes = await readStagedPdf(job);
  const key = `assets/${hash.slice(0, 2)}/${hash}.pdf`;
  await storage().put(key, bytes);

  let extractedText = "";
  try {
    const textKey = typeof payload.textKey === "string" ? payload.textKey : stagingTextKey(job.id);
    extractedText = (await storage().get(textKey)).toString("utf8");
  } catch {
    extractedText = "";
  }

  const assetId = randomUUID();
  const evidence = (payload.evidence ?? {}) as { documentType?: string; coversSemesters?: number[] };
  run(
    `INSERT INTO document_assets (id, sha256, original_filename, mime_type, size_bytes, page_count, storage_key,
       source_url, source_domain, rights, text_content, document_type, covers_semesters, fetched_at)
     VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      assetId,
      hash,
      sourceFilenameFromUrl(payload.finalUrl) ?? `${String(payload.subjectName ?? "document")}.pdf`,
      Number(payload.sizeBytes ?? bytes.byteLength),
      typeof payload.pageCount === "number" ? payload.pageCount : null,
      key,
      typeof payload.finalUrl === "string" ? payload.finalUrl : null,
      typeof payload.finalUrl === "string" ? new URL(payload.finalUrl).hostname.replace(/^www\./, "") : null,
      typeof payload.rights === "string" ? payload.rights : "Unknown — verify before publishing",
      extractedText.slice(0, 400_000),
      evidence.documentType ?? null,
      Array.isArray(evidence.coversSemesters) && evidence.coversSemesters.length
        ? evidence.coversSemesters.join(",")
        : null,
    ],
  );

  run(
    `INSERT INTO document_versions (id, asset_id, kind, storage_key, size_bytes, sha256, page_count, valid)
     VALUES (?, ?, 'original', ?, ?, ?, ?, 1)`,
    [randomUUID(), assetId, key, bytes.byteLength, hash, typeof payload.pageCount === "number" ? payload.pageCount : null],
  );

  run("UPDATE ingestion_jobs SET asset_id = ? WHERE id = ?", [assetId, job.id]);
  await cleanupStaging(job.id);
  advanceJob(job.id, {
    progress: progressFor("optimization"),
    message: "New document stored; no duplicate found.",
    detail: { assetId, sha256: hash },
  });
}

async function optimization(job: JobRecord): Promise<void> {
  const settings = getSettings();
  const profile = isProfile(settings.compression_profile) ? settings.compression_profile : "balanced";
  const payload = parsePayload(job);
  if (!job.asset_id) throw new Error("Job has no asset to optimise.");

  const original = one<{ size_bytes: number; page_count: number | null }>(
    "SELECT size_bytes, page_count FROM document_assets WHERE id = ?",
    [job.asset_id],
  );
  if (!original) throw new Error("Asset record is missing.");

  const bytes = await storage().get(`assets/${String(payload.sha256).slice(0, 2)}/${String(payload.sha256)}.pdf`);
  const result = await compressPdf(bytes, profile, original.page_count);

  if (result.status === "optimized") {
    const key = `derivatives/${String(payload.sha256).slice(0, 2)}/${String(payload.sha256)}-optimized.pdf`;
    await storage().put(key, result.bytes);
    run(
      `INSERT INTO document_versions (id, asset_id, kind, storage_key, size_bytes, sha256, profile, page_count, valid, notes)
       VALUES (?, ?, 'optimized', ?, ?, ?, ?, ?, 1, ?)
       ON CONFLICT(asset_id, kind) DO UPDATE SET
         storage_key=excluded.storage_key, size_bytes=excluded.size_bytes, sha256=excluded.sha256,
         profile=excluded.profile, page_count=excluded.page_count, valid=1, notes=excluded.notes, created_at=datetime('now')`,
      [
        randomUUID(),
        job.asset_id,
        key,
        result.sizeBytes,
        sha256(result.bytes),
        profile,
        result.pageCount,
        result.note,
      ],
    );
    advanceJob(job.id, {
      progress: progressFor("naming"),
      message: `Optimised derivative created: ${original.size_bytes} → ${result.sizeBytes} bytes (${result.savingPercent}% smaller).`,
      detail: { profile, savingPercent: result.savingPercent },
    });
    return;
  }

  recordEvent(job.id, "optimization", "running", result.reason, result.status === "failed" ? "warn" : "info", { profile, status: result.status });
  advanceJob(job.id, {
    progress: progressFor("naming"),
    message: "No optimised derivative was accepted; the original remains the serving version.",
    detail: { profile, status: result.status, reason: result.reason },
  });
}

async function naming(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  const context = requireContext(payload);
  const ai = (payload.ai ?? {}) as Record<string, unknown>;
  const evidence = (payload.evidence ?? {}) as { documentType?: string };
  // A scheme table covering many subjects is named for its scope, not for the
  // subject the discovery query mentioned.
  const streamLevel = ["course_structure", "complete_curriculum", "branch_syllabus"].includes(
    String(evidence.documentType),
  );
  const yearSource =
    (typeof ai.academicYear === "string" && ai.academicYear) ||
    (typeof payload.academicYear === "string" && payload.academicYear) ||
    String(new Date().getFullYear());

  const suggestedName = buildDocumentName({
    university: context.universitySlug,
    programme: context.programmeSlug,
    branch: context.branchSlug,
    semester: streamLevel ? null : context.semester,
    subject: streamLevel ? "COURSE STRUCTURE" : context.subjectName,
    kind: streamLevel ? "scheme" : "syllabus",
    year: yearSource,
  });

  updatePayload(job.id, { suggestedName });
  advanceJob(job.id, { progress: progressFor("metadata"), message: `Proposed filename: ${suggestedName}` });
}

async function metadata(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  const context = requireContext(payload);
  const ai = (payload.ai ?? {}) as Record<string, unknown>;

  const approved = (payload.adminMetadata ?? {}) as Record<string, unknown>;
  const evidence = (payload.evidence ?? {}) as {
    documentType?: string;
    coversSemesters?: number[];
    subjectCodes?: string[];
  };
  const streamLevel = ["course_structure", "complete_curriculum", "branch_syllabus"].includes(
    String(evidence.documentType),
  );
  const detectedSemesters = Array.isArray(evidence.coversSemesters) ? evidence.coversSemesters : [];
  // Evidence wins over the discovery context: we do not claim a subject or
  // semester the document itself contradicts.
  const fallbackSemester = streamLevel && detectedSemesters.length ? detectedSemesters[0] : context.semester;
  const fallbackTitle = streamLevel
    ? `${context.branchSlug ?? context.programmeSlug ?? "Programme"} — course structure (${typeof ai.academicYear === "string" ? ai.academicYear : "scheme"})`
    : `${context.subjectName} — Syllabus`;
  const metadata = {
    title: (approved.title as string) || (typeof ai.title === "string" && ai.title) || fallbackTitle,
    subjectName: (approved.subjectName as string) || (typeof ai.subject === "string" && ai.subject) || context.subjectName,
    subjectCode:
      streamLevel
        ? null
        : (approved.subjectCode as string) ||
          (typeof ai.subjectCode === "string" && ai.subjectCode) ||
          (typeof payload.subjectCode === "string" && payload.subjectCode) ||
          null,
    semester: (approved.semester as number) || (typeof ai.semester === "number" && ai.semester) || fallbackSemester,
    programme: (approved.programme as string) || (typeof ai.programme === "string" && ai.programme) || context.programmeSlug,
    branch: (approved.branch as string) || (typeof ai.branch === "string" && ai.branch) || context.branchSlug,
    kind: (approved.kind as string) || (typeof ai.kind === "string" && ai.kind) || (streamLevel ? "course_structure" : "syllabus"),
    academicYear: (approved.academicYear as string) || (typeof ai.academicYear === "string" && ai.academicYear) || null,
    filename: (approved.filename as string) || (payload.suggestedName as string) || "syllabus.pdf",
    confidence:
      typeof approved.confidence === "number"
        ? approved.confidence
        : typeof ai.confidence === "number"
          ? ai.confidence
          : typeof payload.confidence === "number"
            ? payload.confidence
            : 0.5,
    aiNotes: typeof ai.notes === "string" ? ai.notes : "",
    aiSkipped: payload.aiSkipped === true,
    documentType: evidence.documentType ?? null,
    coversSemesters: detectedSemesters,
  };

  // Warn when the document's own semester coverage contradicts the subject the
  // job was filed against. The administrator can still approve, but not blindly.
  const filedSemester = Number(metadata.semester);
  if (detectedSemesters.length > 0 && !detectedSemesters.includes(filedSemester)) {
    recordEvent(
      job.id,
      "awaiting_approval",
      "awaiting_approval",
      `Semester mismatch: the PDF covers semester(s) ${detectedSemesters.join(", ")} but this job is filed against semester ${filedSemester}. Confirm the subject mapping before approving.`,
      "warn",
      { detected: detectedSemesters, filed: filedSemester },
    );
  }

  updatePayload(job.id, { metadata });
  setJobStage(job.id, "awaiting_approval", { state: "awaiting_approval", progress: 92 });
  recordEvent(job.id, "awaiting_approval", "awaiting_approval", "Processed and waiting for administrator approval.", "info", metadata);
}

async function uploading(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  if (!job.asset_id) throw new Error("Job has no asset to upload.");
  const version = one<{ storage_key: string; size_bytes: number }>(
    `SELECT storage_key, size_bytes FROM document_versions WHERE asset_id = ? ORDER BY kind='optimized' DESC LIMIT 1`,
    [job.asset_id],
  );
  if (!version) throw new Error("No stored version found for this asset.");

  const bytes = await storage().get(version.storage_key);
  const name = String((payload.metadata as Record<string, unknown> | undefined)?.filename ?? "document.pdf");
  const served = await storePdfBuffer(bytes, name);
  updatePayload(job.id, { servedKey: served.storageKey, servedSize: served.sizeBytes });
  advanceJob(job.id, { progress: progressFor("indexing"), message: "Serving copy written to the site file store." });
}

function uniqueSlug(base: string): string {
  const clean = slugify(base) || "document";
  let candidate = clean;
  let suffix = 1;
  while (one("SELECT id FROM resources WHERE slug = ?", [candidate])) {
    suffix += 1;
    candidate = `${clean}-${suffix}`;
  }
  return candidate;
}

async function indexing(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  const context = requireContext(payload);
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;

  const subject = one<{
    id: string;
    university_id: string;
    programme_id: string;
    branch_id: string | null;
    semester: number;
    name: string;
    code: string | null;
  }>("SELECT id, university_id, programme_id, branch_id, semester, name, code FROM subjects WHERE id = ?", [
    context.subjectId,
  ]);
  if (!subject) throw new Error("The linked subject no longer exists.");

  const category = one<{ id: string }>("SELECT id FROM categories WHERE slug = 'syllabus'");
  if (!category) throw new Error("The syllabus category is missing.");

  const existing = one<{ id: string }>("SELECT id FROM resources WHERE id = ?", [job.published_resource_id ?? ""]);
  let resourceId = existing?.id;

  if (!resourceId) {
    resourceId = randomUUID();
    const title = String(metadata.title ?? `${subject.name} — Syllabus`);
    run(
      `INSERT INTO resources (id, slug, title, description, subject_id, category_id, university_id, programme_id,
         branch_id, semester, session, status, contributor_name, uploaded_by, is_sample)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, NULL, 0)`,
      [
        resourceId,
        uniqueSlug(title),
        title,
        `Acquired from ${String(payload.finalUrl ?? "an external source")} and reviewed by an administrator.`,
        subject.id,
        category.id,
        subject.university_id,
        subject.programme_id,
        subject.branch_id,
        subject.semester,
        String(metadata.academicYear ?? payload.academicYear ?? "") || null,
        "FreeResources acquisition",
      ],
    );
    run("UPDATE ingestion_jobs SET published_resource_id = ? WHERE id = ?", [resourceId, job.id]);
  }

  const servedKey = typeof payload.servedKey === "string" ? payload.servedKey : null;
  if (servedKey) {
    const already = one<{ id: string }>("SELECT id FROM resource_files WHERE resource_id = ? AND storage_key = ?", [
      resourceId,
      servedKey,
    ]);
    if (!already) {
      run(
        `INSERT INTO resource_files (id, resource_id, storage_key, original_name, mime_type, size_bytes, label, is_primary)
         VALUES (?, ?, ?, ?, 'application/pdf', ?, 'Acquisition copy', 1)`,
        [
          randomUUID(),
          resourceId,
          servedKey,
          String(metadata.filename ?? "document.pdf"),
          Number(payload.servedSize ?? 0),
        ],
      );
    }
  }

  advanceJob(job.id, { progress: progressFor("publishing"), message: "Indexed against the canonical subject." });
}

export function parseUnits(text: string): { unitNo: number; title: string | null; topics: string }[] {
  if (!text) return [];
  const units: { unitNo: number; title: string | null; topics: string }[] = [];
  const regex = /UNIT\s*[-–:]?\s*(I{1,3}V?|IV|V|VI{0,3}|\d{1,2})\b([\s\S]{0,1600}?)(?=UNIT\s*[-–:]?\s*(?:I{1,3}V?|IV|V|VI{0,3}|\d{1,2})\b|$)/gi;
  const roman: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8 };

  for (const match of text.matchAll(regex)) {
    const raw = match[1].toUpperCase();
    const unitNo = /^\d+$/.test(raw) ? Number(raw) : roman[raw] ?? 0;
    if (!unitNo || units.some((unit) => unit.unitNo === unitNo)) continue;
    const body = match[2].replace(/\s+/g, " ").trim();
    if (body.length < 20) continue;
    const [firstLine] = body.split(/[:.-]\s/);
    units.push({
      unitNo,
      title: firstLine && firstLine.length <= 90 ? firstLine : null,
      topics: body.slice(0, 1200),
    });
  }
  return units.sort((a, b) => a.unitNo - b.unitNo);
}

async function publishing(job: JobRecord): Promise<void> {
  const payload = parsePayload(job);
  const context = requireContext(payload);
  const metadata = (payload.metadata ?? {}) as Record<string, unknown>;
  if (!job.published_resource_id) throw new Error("The draft resource record is missing.");

  run("UPDATE resources SET status='published', published_at=datetime('now'), updated_at=datetime('now') WHERE id = ?", [
    job.published_resource_id,
  ]);

  if (context.curriculumId) {
    const stored = job.asset_id
      ? one<{ text_content: string | null; page_count: number | null }>(
          "SELECT text_content, page_count FROM document_assets WHERE id = ?",
          [job.asset_id],
        )
      : undefined;
    const pageCount = stored?.page_count ?? 0;
    // Unit headings only belong to one subject when the document is a
    // single-subject syllabus. A 100-page stream course-structure PDF would
    // otherwise scatter unrelated headings across one subject record, so its
    // units wait for an administrator instead of being invented.
    const autoUnits = pageCount > 0 && pageCount <= 12 ? parseUnits(stored?.text_content ?? "") : [];
    const versionStatus = autoUnits.length > 0 || pageCount <= 12 ? "verified" : "in_review";
    // One verified version per source document. A replacement document creates a
    // new version and leaves the previous one intact as history.
    const existing = one<{ id: string }>(
      "SELECT id FROM syllabus_versions WHERE source_asset_id = ? LIMIT 1",
      [job.asset_id],
    );
    let versionId = existing?.id;
    if (!versionId) {
      versionId = randomUUID();
      run(
        `INSERT INTO syllabus_versions (id, curriculum_id, subject_id, version_label, academic_year, regulation,
           status, source_asset_id, confidence, verified_by, verified_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
        [
          versionId,
          context.curriculumId,
          context.subjectId,
          String(metadata.academicYear ?? payload.academicYear ?? "Unlabelled version"),
          typeof metadata.academicYear === "string" ? metadata.academicYear : null,
          context.programmeSlug.toUpperCase(),
          versionStatus,
          job.asset_id,
          typeof metadata.confidence === "number" ? metadata.confidence : null,
          job.approved_by,
        ],
      );

      if (versionStatus === "in_review") {
        recordEvent(
          job.id,
          "publishing",
          "running",
          `Multi-subject document (${pageCount} pages): units were not auto-attached. Review the subject mapping and enter units before these are shown as verified.`,
          "warn",
        );
      }
      for (const unit of autoUnits) {
        run(
          `INSERT INTO syllabus_units (id, syllabus_version_id, subject_id, unit_no, title, topics, page_ref)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [randomUUID(), versionId, context.subjectId, unit.unitNo, unit.title, unit.topics, null],
        );
      }
    }
  }

  run(
    `UPDATE ingestion_jobs SET state='completed', stage='completed', progress=100, completed_at=datetime('now'),
        lease_owner=NULL, lease_expires_at=NULL, updated_at=datetime('now') WHERE id = ?`,
    [job.id],
  );
  recordEvent(job.id, "completed", "completed", "Document published to the public library.", "info", {
    resourceId: job.published_resource_id,
  });
}

/* --------------------------------------------------------------- dispatcher */

export async function processJob(jobId: string): Promise<void> {
  const job = getJobRecord(jobId);
  if (!job) return;

  const runStage = async (): Promise<void> => {
    switch (job.stage as Stage) {
      case "selected":
        advanceJob(job.id, { progress: progressFor("downloading"), message: "Candidate accepted by an administrator." });
        return;
      case "downloading":
        return downloading(job);
      case "validating":
        return validating(job);
      case "safety_check":
        return safetyCheck(job);
      case "text_extraction":
        return textExtraction(job);
      case "ai_classification":
        return aiClassification(job);
      case "duplicate_check":
        return duplicateCheck(job);
      case "optimization":
        return optimization(job);
      case "naming":
        return naming(job);
      case "metadata":
        return metadata(job);
      case "uploading":
        return uploading(job);
      case "indexing":
        return indexing(job);
      case "publishing":
        return publishing(job);
      case "awaiting_approval":
        setJobState(job.id, "awaiting_approval", "Waiting for administrator approval.");
        return;
      case "awaiting_selection":
        setJobState(job.id, "needs_review", "Waiting for an administrator to select this candidate.");
        return;
      default: {
        const next = Math.min(stageIndex(job.stage as Stage) + 1, STAGES.length - 1);
        advanceJob(job.id, { progress: progressFor(STAGES[next]), message: "Stage recorded." });
      }
    }
  };

  try {
    await runStage();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Stage failed.";
    const reason = error instanceof FetchBlocked ? error.reason : "";
    const retry = !(error instanceof FetchBlocked && PERMANENT_FETCH_FAILURES.has(reason));
    if (error instanceof FetchBlocked) {
      recordEvent(job.id, job.stage, "failed", message, "error", { reason });
    }
    failJob(job.id, message, retry);
  }
}

/** Administrator approval: jump to uploading and let the worker finish. */
export function approveJob(jobId: string, userId: string, overrides: Record<string, unknown> = {}): void {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  if (job.state !== "awaiting_approval") throw new Error("Only documents awaiting approval can be approved.");

  const payload = parsePayload(job);
  if (Object.keys(overrides).length) {
    const clean = Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined && value !== ""),
    );
    // The metadata stage already ran, so an approval-time edit must also update
    // the effective metadata that publishing reads — not just the admin layer.
    updatePayload(jobId, {
      adminMetadata: { ...((payload.adminMetadata as object) ?? {}), ...clean },
      metadata: { ...((payload.metadata as Record<string, unknown>) ?? {}), ...clean },
    });
  }
  run(
    `UPDATE ingestion_jobs SET stage='uploading', state='queued', progress=94, approved_by=?,
        next_run_at=datetime('now'), lease_owner=NULL, lease_expires_at=NULL, updated_at=datetime('now')
      WHERE id=?`,
    [userId, jobId],
  );
  recordEvent(jobId, "uploading", "queued", "Approved by an administrator; completing storage and publication.");
}

export function rejectJob(jobId: string, userId: string, reason: string): void {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  run(
    `UPDATE ingestion_jobs SET state='rejected', last_error=?, approved_by=?, lease_owner=NULL,
        lease_expires_at=NULL, updated_at=datetime('now') WHERE id=?`,
    [reason.slice(0, 500), userId, jobId],
  );
  recordEvent(jobId, job.stage, "rejected", `Rejected by an administrator: ${reason}`);
}

export function unpublishResource(jobId: string, userId: string): void {
  const job = getJobRecord(jobId);
  if (!job) throw new Error("Job not found.");
  if (!job.published_resource_id) throw new Error("This job has no published resource.");
  run("UPDATE resources SET status='draft', published_at=NULL, updated_at=datetime('now') WHERE id = ?", [
    job.published_resource_id,
  ]);
  recordEvent(jobId, job.stage, "paused", `Unpublished by administrator ${userId}.`);
}

export function documentListForCurriculum(curriculumId: string) {
  return all<{ id: string; filename: string; size_bytes: number }>(
    `SELECT a.id, a.original_filename AS filename, a.size_bytes
       FROM syllabus_versions sv JOIN document_assets a ON a.id=sv.source_asset_id
      WHERE sv.curriculum_id = ?`,
    [curriculumId],
  );
}

export type { JobState };
