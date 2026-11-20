import { NextResponse } from "next/server";

import { all, one, run } from "@/lib/db";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";
import { addManualCandidate, createManualRun, executeDiscoveryRun } from "@/lib/acquisition/discovery";
import { approveJob, rejectJob, unpublishResource } from "@/lib/acquisition/pipeline";
import {
  cancelJob,
  createJob,
  createRun,
  getJobRecord,
  newId,
  parsePayload,
  recordEvent,
  retryJob,
  setRunStatus,
  updatePayload,
} from "@/lib/acquisition/queue";
import { auditAcquisition, setSetting } from "@/lib/acquisition/store";
import { parseUnits } from "@/lib/acquisition/pipeline";
import { storage } from "@/lib/acquisition/storage";
import { isProfile } from "@/lib/acquisition/types";

export const runtime = "nodejs";

type Payload = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function number(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function id(): string {
  return newId();
}

/** Reads either a JSON body or an HTML form submission. */
async function readPayload(request: Request): Promise<{ payload: Payload; form: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { payload: (await request.json()) as Payload, form: false };
  }
  const data = await request.formData();
  const payload: Payload = {};
  for (const [key, value] of data.entries()) {
    if (typeof value === "string") payload[key] = value;
  }
  return { payload, form: true };
}

function back(request: Request, params: Record<string, string>): NextResponse {
  // A relative fallback must be resolved against the request, otherwise a client
  // that sends no Referer header turns every form action into a 500.
  const referer = request.headers.get("referer");
  const url = referer ? new URL(referer) : new URL("/admin/acquisition", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const userId = auth.user.id;

  let body: { payload: Payload; form: boolean };
  try {
    body = await readPayload(request);
  } catch {
    return fail("Could not read the request body.", 400);
  }
  const { payload, form } = body;
  const action = text(payload.action);

  const respond = (message: string, status = 200) => {
    if (form) return back(request, { ok: message });
    return ok({ ok: true, message }, status);
  };

  try {
    switch (action) {
      /* ------------------------------------------------------------ discovery */
      case "start_discovery": {
        const scope = {
          universitySlug: text(payload.universitySlug) || "aktu",
          programmeSlug: text(payload.programmeSlug) || undefined,
          branchSlug: text(payload.branchSlug) || undefined,
          semester: number(payload.semester) ?? undefined,
          subjectId: text(payload.subjectId) || undefined,
          limit: number(payload.limit) ?? 5,
        };
        const runId = createRun({ mode: "gap", scope, userId });
        auditAcquisition(userId, "acquisition.discovery.started", "discovery_run", runId, scope);
        if (form) return back(request, { ok: "Discovery queued. The worker will start it shortly.", run: runId });
        // JSON callers get a synchronous run so single requests are useful.
        await executeDiscoveryRun(runId, userId);
        return ok({ ok: true, runId });
      }

      case "pause_discovery": {
        const runId = text(payload.runId);
        setRunStatus(runId, "paused");
        auditAcquisition(userId, "acquisition.discovery.paused", "discovery_run", runId, {});
        return respond("Discovery paused.");
      }

      case "resume_discovery": {
        const runId = text(payload.runId);
        setRunStatus(runId, "queued");
        auditAcquisition(userId, "acquisition.discovery.resumed", "discovery_run", runId, {});
        return respond("Discovery resumed.");
      }

      case "cancel_discovery": {
        const runId = text(payload.runId);
        setRunStatus(runId, "cancelled");
        auditAcquisition(userId, "acquisition.discovery.cancelled", "discovery_run", runId, {});
        return respond("Discovery cancelled. Completed jobs are untouched.");
      }

      /* ----------------------------------------------------------- candidates */
      case "select_candidate": {
        const candidateId = text(payload.candidateId);
        const candidate = one<{ id: string; url: string; run_id: string; status: string; job_id: string | null }>(
          "SELECT id, url, run_id, status, job_id FROM discovered_candidates WHERE id = ?",
          [candidateId],
        );
        if (!candidate) return fail("Candidate not found.", 404);
        if (candidate.job_id) return fail("That candidate is already queued.", 409);

        let context: Record<string, unknown> | null = null;
        try {
          context = (JSON.parse(
            one<{ reason: string | null }>("SELECT reason FROM discovered_candidates WHERE id = ?", [candidateId])?.reason ?? "{}",
          ) as { context?: Record<string, unknown> }).context ?? null;
        } catch {
          context = null;
        }
        if (!context) {
          const subjectId = text(payload.subjectId);
          const subject = subjectId
            ? one<{ id: string; name: string; code: string | null; semester: number }>(
                "SELECT id, name, code, semester FROM subjects WHERE id = ?",
                [subjectId],
              )
            : undefined;
          if (!subject) return fail("Choose a subject for this candidate.", 422);
          const enrolment = one<{ programme_slug: string; branch_slug: string | null; university_slug: string }>(
            `SELECT p.slug AS programme_slug, b.slug AS branch_slug, u.slug AS university_slug
               FROM subjects s JOIN universities u ON u.id=s.university_id
               JOIN programmes p ON p.id=s.programme_id LEFT JOIN branches b ON b.id=s.branch_id
              WHERE s.id = ?`,
            [subject.id],
          );
          context = {
            subjectId: subject.id,
            subjectName: subject.name,
            subjectCode: subject.code,
            semester: subject.semester,
            universitySlug: enrolment?.university_slug ?? "aktu",
            programmeSlug: enrolment?.programme_slug ?? "",
            branchSlug: enrolment?.branch_slug ?? null,
            curriculumId: null,
            kind: "syllabus",
          };
        }

        const jobId = createJob({
          candidateId,
          payload: { ...context, categorySlug: "syllabus", confidence: 1, sourceProvider: "manual-selection" },
        });
        run("UPDATE discovered_candidates SET status='selected', job_id=? WHERE id = ?", [jobId, candidateId]);
        auditAcquisition(userId, "acquisition.candidate.selected", "discovered_candidate", candidateId, { jobId });
        return respond("Candidate selected and queued for processing.");
      }

      case "reject_candidate": {
        const candidateId = text(payload.candidateId);
        run("UPDATE discovered_candidates SET status='rejected' WHERE id = ?", [candidateId]);
        auditAcquisition(userId, "acquisition.candidate.rejected", "discovered_candidate", candidateId, {});
        return respond("Candidate rejected.");
      }

      case "add_manual_url": {
        const url = text(payload.url);
        const subjectId = text(payload.subjectId);
        if (!/^https?:\/\//i.test(url)) return fail("Enter a full http(s) URL.", 422);
        const subject = one<{
          id: string;
          name: string;
          code: string | null;
          semester: number;
          programme_slug: string;
          branch_slug: string | null;
          university_slug: string;
          curriculum_id: string | null;
        }>(
          `SELECT s.id, s.name, s.code, s.semester, p.slug AS programme_slug, b.slug AS branch_slug,
                  u.slug AS university_slug,
                  (SELECT cu.id FROM curricula cu WHERE cu.university_id=s.university_id
                     AND cu.programme_id=s.programme_id AND IFNULL(cu.branch_id,'')=IFNULL(s.branch_id,'') LIMIT 1) AS curriculum_id
             FROM subjects s JOIN universities u ON u.id=s.university_id
             JOIN programmes p ON p.id=s.programme_id LEFT JOIN branches b ON b.id=s.branch_id
            WHERE s.id = ?`,
          [subjectId],
        );
        if (!subject) return fail("Choose a subject.", 422);
        const context = {
          universitySlug: subject.university_slug,
          programmeSlug: subject.programme_slug,
          branchSlug: subject.branch_slug,
          semester: subject.semester,
          subjectId: subject.id,
          subjectName: subject.name,
          subjectCode: subject.code,
          curriculumId: subject.curriculum_id,
          kind: "syllabus" as const,
        };
        const runId = text(payload.runId);
        if (runId) {
          addManualCandidate({ runId, url, context, userId });
        } else {
          createManualRun(url, context, userId);
        }
        return respond("URL queued for processing.");
      }

      /* ----------------------------------------------------------------- jobs */
      case "approve_job": {
        const jobId = text(payload.jobId);
        approveJob(jobId, userId, {
          title: text(payload.title) || undefined,
          filename: text(payload.filename) || undefined,
          academicYear: text(payload.academicYear) || undefined,
          subjectCode: text(payload.subjectCode) || undefined,
          semester: number(payload.semester) ?? undefined,
        });
        auditAcquisition(userId, "acquisition.document.approved", "ingestion_job", jobId, {});
        return respond("Approved. The worker is completing storage and publication.");
      }

      case "reject_job": {
        const jobId = text(payload.jobId);
        rejectJob(jobId, userId, text(payload.reason) || "Rejected by an administrator.");
        auditAcquisition(userId, "acquisition.document.rejected", "ingestion_job", jobId, {});
        return respond("Document rejected.");
      }

      case "retry_job": {
        const jobId = text(payload.jobId);
        retryJob(jobId, "Retried by an administrator.");
        auditAcquisition(userId, "acquisition.job.retried", "ingestion_job", jobId, {});
        return respond("Job re-queued.");
      }

      case "cancel_job": {
        const jobId = text(payload.jobId);
        cancelJob(jobId, "Cancelled by an administrator.");
        auditAcquisition(userId, "acquisition.job.cancelled", "ingestion_job", jobId, {});
        return respond("Job cancelled. Stored documents are untouched.");
      }

      case "unpublish_document": {
        const jobId = text(payload.jobId);
        unpublishResource(jobId, userId);
        auditAcquisition(userId, "acquisition.document.unpublished", "ingestion_job", jobId, {});
        return respond("Document unpublished.");
      }

      case "update_metadata": {
        const jobId = text(payload.jobId);
        const job = getJobRecord(jobId);
        if (!job) return fail("Job not found.", 404);
        const patch: Record<string, unknown> = {};
        for (const key of ["title", "subjectName", "subjectCode", "academicYear", "filename", "branch", "programme"]) {
          const value = text(payload[key]);
          if (value) patch[key] = value;
        }
        const semester = number(payload.semester);
        if (semester) patch.semester = semester;
        if (!Object.keys(patch).length) return fail("Nothing to update.", 422);
        const current = parsePayload(job);
        updatePayload(jobId, { adminMetadata: { ...((current.adminMetadata as object) ?? {}), ...patch } });
        recordEvent(jobId, job.stage, job.state, "Metadata edited by an administrator.", "info", patch);
        auditAcquisition(userId, "acquisition.document.metadata", "ingestion_job", jobId, patch);
        return respond("Metadata saved.");
      }

      case "reprocess_document": {
        const jobId = text(payload.jobId);
        const job = getJobRecord(jobId);
        if (!job) return fail("Job not found.", 404);
        if (!job.asset_id) return fail("This job has no stored document to reprocess.", 409);
        run("DELETE FROM document_versions WHERE asset_id = ? AND kind='optimized'", [job.asset_id]);
        run(
          `UPDATE ingestion_jobs SET stage='optimization', state='queued', progress=60, next_run_at=datetime('now'),
              lease_owner=NULL, lease_expires_at=NULL, updated_at=datetime('now') WHERE id = ?`,
          [jobId],
        );
        recordEvent(jobId, "optimization", "queued", "Reprocessing requested by an administrator.");
        auditAcquisition(userId, "acquisition.document.reprocessed", "ingestion_job", jobId, {});
        return respond("Reprocessing queued.");
      }

      case "replace_document": {
        const jobId = text(payload.jobId);
        const url = text(payload.url);
        const job = getJobRecord(jobId);
        if (!job) return fail("Job not found.", 404);
        if (!/^https?:\/\//i.test(url)) return fail("Enter a full http(s) source URL.", 422);
        const current = parsePayload(job);
        updatePayload(jobId, {
          sourceUrl: url,
          replacedAssetId: job.asset_id,
          adminMetadata: current.adminMetadata ?? {},
        });
        run(
          `UPDATE ingestion_jobs SET stage='downloading', state='queued', progress=20, asset_id=NULL,
              document_version_id=NULL, next_run_at=datetime('now'), lease_owner=NULL, lease_expires_at=NULL,
              updated_at=datetime('now') WHERE id = ?`,
          [jobId],
        );
        recordEvent(jobId, "downloading", "queued", `Replacement source queued: ${url}. Previous version is preserved.`);
        auditAcquisition(userId, "acquisition.document.replaced", "ingestion_job", jobId, { url });
        return respond("Replacement queued; the previous version is preserved.");
      }

      /* ---------------------------------------------------------------- sources */
      case "save_source": {
        const sourceId = text(payload.sourceId);
        const domain = text(payload.domain).replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
        const label = text(payload.label) || domain;
        const kind = text(payload.kind) || "official";
        const credibility = Math.min(Math.max(number(payload.credibility) ?? 0.5, 0), 1);
        if (!domain) return fail("Enter a source domain.", 422);
        if (sourceId) {
          run(
            `UPDATE discovery_sources SET domain=?, label=?, kind=?, credibility=?, enabled=?, restrictions=? WHERE id=?`,
            [domain, label, kind, credibility, payload.enabled === "0" ? 0 : 1, text(payload.restrictions) || null, sourceId],
          );
          auditAcquisition(userId, "acquisition.source.updated", "discovery_source", sourceId, { domain });
          return respond("Source updated.");
        }
        const exists = one<{ id: string }>("SELECT id FROM discovery_sources WHERE domain = ?", [domain]);
        if (exists) return fail("That domain is already registered.", 409);
        const newSourceId = id();
        run(
          `INSERT INTO discovery_sources (id, domain, label, kind, credibility, enabled, restrictions)
           VALUES (?, ?, ?, ?, ?, 1, ?)`,
          [newSourceId, domain, label, kind, credibility, text(payload.restrictions) || null],
        );
        auditAcquisition(userId, "acquisition.source.created", "discovery_source", newSourceId, { domain });
        return respond("Source added.");
      }

      case "toggle_source": {
        const sourceId = text(payload.sourceId);
        const source = one<{ enabled: number }>("SELECT enabled FROM discovery_sources WHERE id = ?", [sourceId]);
        if (!source) return fail("Source not found.", 404);
        run("UPDATE discovery_sources SET enabled = ? WHERE id = ?", [source.enabled ? 0 : 1, sourceId]);
        auditAcquisition(userId, "acquisition.source.toggled", "discovery_source", sourceId, { enabled: !source.enabled });
        return respond(source.enabled ? "Source disabled." : "Source enabled.");
      }

      /* ---------------------------------------------------------- institutions */
      case "save_institution": {
        const name = text(payload.name);
        if (!name) return fail("Enter the institution name.", 422);
        const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
        const slug = `${slugBase}-${Math.random().toString(36).slice(2, 6)}`;
        const institutionId = id();
        run(
          `INSERT INTO institutions (id, slug, name, kind, university_id, college_id, city, state, website, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            institutionId,
            slug,
            name,
            text(payload.kind) || "affiliated_college",
            text(payload.universityId) || null,
            text(payload.collegeId) || null,
            text(payload.city) || null,
            text(payload.state) || null,
            text(payload.website) || null,
            "needs_verification",
            text(payload.notes) || null,
          ],
        );
        auditAcquisition(userId, "acquisition.institution.created", "institution", institutionId, { name });
        return respond("Institution added and marked for verification.");
      }

      case "set_institution_status": {
        const institutionId = text(payload.institutionId);
        const status = text(payload.status);
        if (!["active", "archived", "needs_verification"].includes(status)) return fail("Unknown status.", 422);
        run("UPDATE institutions SET status = ? WHERE id = ?", [status, institutionId]);
        auditAcquisition(userId, "acquisition.institution.status", "institution", institutionId, { status });
        return respond("Institution updated.");
      }

      /* -------------------------------------------------------------- mappings */
      case "save_mapping": {
        const institutionId = text(payload.institutionId);
        const curriculumId = text(payload.curriculumId);
        const relation = text(payload.relation) || "pending_verification";
        if (!institutionId || !curriculumId) return fail("Choose an institution and a curriculum.", 422);
        const mappingId = id();
        const academicYear = text(payload.academicYear) || null;
        const existingMapping = one<{ id: string }>(
          `SELECT id FROM institution_curricula WHERE institution_id = ? AND curriculum_id = ?
             AND IFNULL(academic_year,'') = IFNULL(?,'')`,
          [institutionId, curriculumId, academicYear],
        );
        if (existingMapping) {
          run(
            `UPDATE institution_curricula SET relation=?, verification_status='unverified',
                evidence_url=?, evidence_note=?, verified_by=NULL, verified_at=NULL WHERE id=?`,
            [relation, text(payload.evidenceUrl) || null, text(payload.evidenceNote) || null, existingMapping.id],
          );
        } else {
          run(
            `INSERT INTO institution_curricula (id, institution_id, curriculum_id, relation, verification_status,
               evidence_url, evidence_note, academic_year)
             VALUES (?, ?, ?, ?, 'unverified', ?, ?, ?)`,
            [
              mappingId,
              institutionId,
              curriculumId,
              relation,
              text(payload.evidenceUrl) || null,
              text(payload.evidenceNote) || null,
              academicYear,
            ],
          );
        }
        auditAcquisition(userId, "acquisition.mapping.saved", "institution_curriculum", mappingId, {
          institutionId,
          curriculumId,
          relation,
        });
        return respond("Mapping saved. Verify it once you have authoritative evidence.");
      }

      case "verify_mapping": {
        const mappingId = text(payload.mappingId);
        const mapping = one<{ evidence_url: string | null }>(
          "SELECT evidence_url FROM institution_curricula WHERE id = ?",
          [mappingId],
        );
        if (!mapping) return fail("Mapping not found.", 404);
        if (!text(payload.evidenceUrl) && !mapping.evidence_url) {
          return fail("Add an evidence URL before verifying this mapping.", 422);
        }
        run(
          `UPDATE institution_curricula SET verification_status='verified', evidence_url=COALESCE(?, evidence_url),
              relation=COALESCE(NULLIF(?,''), relation), verified_by=?, verified_at=datetime('now') WHERE id=?`,
          [text(payload.evidenceUrl) || null, text(payload.relation), userId, mappingId],
        );
        auditAcquisition(userId, "acquisition.mapping.verified", "institution_curriculum", mappingId, {});
        return respond("Mapping verified.");
      }

      /* ------------------------------------------------------------- curricula */
      case "save_curriculum": {
        const universityId = text(payload.universityId);
        const programmeId = text(payload.programmeId);
        const schemeLabel = text(payload.schemeLabel);
        if (!universityId || !programmeId || !schemeLabel) {
          return fail("University, programme and scheme label are required.", 422);
        }
        const curriculumId = id();
        const branchId = text(payload.branchId) || null;
        const existingCurriculum = one<{ id: string }>(
          `SELECT id FROM curricula WHERE university_id=? AND programme_id=? AND IFNULL(branch_id,'')=IFNULL(?,'')
             AND scheme_label = ? COLLATE NOCASE`,
          [universityId, programmeId, branchId, schemeLabel],
        );
        if (!existingCurriculum) {
          run(
            `INSERT INTO curricula (id, university_id, programme_id, branch_id, scheme_label, scheme_year, effective_from, effective_to)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              curriculumId,
              universityId,
              programmeId,
              branchId,
              schemeLabel,
              number(payload.schemeYear) ?? null,
              text(payload.effectiveFrom) || null,
              text(payload.effectiveTo) || null,
            ],
          );
        }
        const saved = one<{ id: string }>(
          `SELECT id FROM curricula WHERE university_id=? AND programme_id=? AND IFNULL(branch_id,'')=IFNULL(?,'')
             AND scheme_label = ? COLLATE NOCASE`,
          [universityId, programmeId, text(payload.branchId) || null, schemeLabel],
        );
        auditAcquisition(userId, "acquisition.curriculum.saved", "curriculum", saved?.id ?? curriculumId, { schemeLabel });
        return respond("Canonical curriculum ready.");
      }

      case "add_curriculum_subject": {
        const curriculumId = text(payload.curriculumId);
        const subjectId = text(payload.subjectId);
        const semester = number(payload.semester);
        if (!curriculumId || !subjectId || !semester) return fail("Curriculum, subject and semester are required.", 422);
        run(
          `INSERT INTO curriculum_subjects (id, curriculum_id, subject_id, semester, sequence, is_elective)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(curriculum_id, subject_id, semester) DO UPDATE SET sequence=excluded.sequence, is_elective=excluded.is_elective`,
          [id(), curriculumId, subjectId, semester, number(payload.sequence) ?? 0, payload.isElective === "1" ? 1 : 0],
        );
        auditAcquisition(userId, "acquisition.curriculum.subject", "curriculum", curriculumId, { subjectId, semester });
        return respond("Subject attached to the canonical curriculum.");
      }

      case "save_syllabus_version": {
        const curriculumId = text(payload.curriculumId);
        const versionLabel = text(payload.versionLabel);
        if (!curriculumId || !versionLabel) return fail("Curriculum and version label are required.", 422);
        const versionId = id();
        run(
          `INSERT INTO syllabus_versions (id, curriculum_id, subject_id, version_label, academic_year, regulation,
             status, confidence, verified_by, verified_at)
           VALUES (?, ?, ?, ?, ?, ?, 'verified', ?, ?, datetime('now'))`,
          [
            versionId,
            curriculumId,
            text(payload.subjectId) || null,
            versionLabel,
            text(payload.academicYear) || null,
            text(payload.regulation) || null,
            number(payload.confidence) ?? null,
            userId,
          ],
        );
        const units = parseUnits(text(payload.unitsText));
        for (const unit of units) {
          run(
            `INSERT INTO syllabus_units (id, syllabus_version_id, subject_id, unit_no, title, topics, page_ref)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [id(), versionId, text(payload.subjectId) || null, unit.unitNo, unit.title, unit.topics, null],
          );
        }
        auditAcquisition(userId, "acquisition.syllabus.version", "syllabus_version", versionId, { versionLabel, units: units.length });
        return respond(`Syllabus version saved${units.length ? ` with ${units.length} units` : ""}.`);
      }

      /* -------------------------------------------------------------- settings */
      case "save_settings": {
        const allowed = ["discovery_interval_minutes", "source_recheck_hours", "compression_profile", "max_download_mb", "auto_select_threshold", "scheduler_enabled"];
        const saved: Record<string, string> = {};
        for (const key of allowed) {
          const value = text(payload[key]);
          if (!value) continue;
          if (key === "compression_profile" && !isProfile(value)) return fail("Unknown compression profile.", 422);
          saved[key] = value;
        }
        for (const [key, value] of Object.entries(saved)) setSetting(key, value);
        auditAcquisition(userId, "acquisition.settings.updated", "acquisition_settings", null, saved);
        return respond("Settings saved.");
      }

      case "delete_asset_cache": {
        const assetId = text(payload.assetId);
        const versions = all<{ storage_key: string }>("SELECT storage_key FROM document_versions WHERE asset_id = ?", [assetId]);
        for (const version of versions) await storage().delete(version.storage_key);
        run("DELETE FROM document_assets WHERE id = ?", [assetId]);
        auditAcquisition(userId, "acquisition.asset.deleted", "document_asset", assetId, { objects: versions.length });
        return respond("Asset and its stored objects deleted.");
      }

      default:
        return fail(`Unknown action "${action}".`, 400);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "The action failed.";
    if (form) return back(request, { error: message });
    return fail(message, 400);
  }
}
