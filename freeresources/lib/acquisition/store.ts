import { randomUUID } from "node:crypto";

import { all, one, run } from "../db";

/** Read models, settings and audit for the acquisition system. */

export const ACQUISITION_SETTING_DEFAULTS: Record<string, string> = {
  discovery_enabled: "0",
  discovery_interval_minutes: "1440",
  source_recheck_hours: "168",
  compression_profile: "balanced",
  max_download_mb: "40",
  auto_select_threshold: "0.75",
  scheduler_enabled: "0",
  last_daily_run_at: "",
  last_weekly_run_at: "",
};

export function getSettings(): Record<string, string> {
  const rows = all<{ key: string; value: string }>("SELECT key, value FROM acquisition_settings");
  const map = { ...ACQUISITION_SETTING_DEFAULTS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export function setSetting(key: string, value: string): void {
  run(
    `INSERT INTO acquisition_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [key, value],
  );
}

export function auditAcquisition(userId: string | null, action: string, entity: string, entityId: string | null, detail: unknown): void {
  run(`INSERT INTO audit_log (id, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)`, [
    randomUUID(),
    userId,
    action,
    entity,
    entityId,
    detail === undefined ? null : JSON.stringify(detail).slice(0, 4000),
  ]);
}

/* ------------------------------------------------------------------- stats */

export function getAcquisitionStats() {
  const runCounts = all<{ status: string; count: number }>(
    "SELECT status, COUNT(*) AS count FROM discovery_runs GROUP BY status",
  );
  const jobCounts = all<{ state: string; count: number }>(
    "SELECT state, COUNT(*) AS count FROM ingestion_jobs GROUP BY state",
  );
  const totals = one<{
    candidates: number;
    assets: number;
    originalBytes: number;
    optimizedBytes: number;
    duplicates: number;
    published: number;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM discovered_candidates) AS candidates,
      (SELECT COUNT(*) FROM document_assets) AS assets,
      (SELECT COALESCE(SUM(size_bytes),0) FROM document_versions WHERE kind='original') AS originalBytes,
      (SELECT COALESCE(SUM(size_bytes),0) FROM document_versions WHERE kind='optimized') AS optimizedBytes,
      (SELECT COUNT(*) FROM ingestion_job_events WHERE message LIKE '%duplicate%') AS duplicates,
      (SELECT COUNT(*) FROM resources r JOIN categories c ON c.id=r.category_id
        WHERE c.group_slug='syllabus' AND r.status='published') AS published
  `);

  const lastRun = one<{ id: string; created_at: string; status: string }>(
    "SELECT id, created_at, status FROM discovery_runs ORDER BY created_at DESC LIMIT 1",
  );
  const nextCheck = one<{ next_check_at: string }>(
    "SELECT MIN(next_check_at) AS next_check_at FROM discovery_sources WHERE enabled=1 AND next_check_at IS NOT NULL",
  );
  const approved = one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ingestion_jobs WHERE state IN ('awaiting_approval','needs_review')",
  );
  const failed = one<{ count: number }>(
    "SELECT COUNT(*) AS count FROM ingestion_jobs WHERE state='failed'",
  );
  const mappedInstitutions = one<{ count: number }>(
    "SELECT COUNT(DISTINCT institution_id) AS count FROM institution_curricula",
  );
  const curricula = one<{ count: number }>("SELECT COUNT(*) AS count FROM curricula");

  const byState = (state: string) => Number(jobCounts.find((row) => row.state === state)?.count ?? 0);
  const byRun = (status: string) => Number(runCounts.find((row) => row.status === status)?.count ?? 0);

  return {
    totalRuns: runCounts.reduce((sum, row) => sum + Number(row.count), 0),
    runningRuns: byRun("running"),
    pausedRuns: byRun("paused"),
    completedRuns: byRun("completed"),
    failedRuns: byRun("failed"),
    activeJobs: byState("running") + byState("queued"),
    completedJobs: byState("completed"),
    failedJobs: failed?.count ?? 0,
    awaitingApproval: approved?.count ?? 0,
    candidates: Number(totals?.candidates ?? 0),
    assets: Number(totals?.assets ?? 0),
    originalBytes: Number(totals?.originalBytes ?? 0),
    optimizedBytes: Number(totals?.optimizedBytes ?? 0),
    duplicatesPrevented: Number(totals?.duplicates ?? 0),
    publishedSyllabi: Number(totals?.published ?? 0),
    mappedInstitutions: Number(mappedInstitutions?.count ?? 0),
    curricula: Number(curricula?.count ?? 0),
    lastRunAt: lastRun?.created_at ?? null,
    lastRunId: lastRun?.id ?? null,
    lastRunStatus: lastRun?.status ?? null,
    nextSourceCheckAt: nextCheck?.next_check_at ?? null,
  };
}

/* -------------------------------------------------------------------- runs */

export type RunRow = {
  id: string;
  mode: string;
  scope: string | null;
  status: string;
  stats: string | null;
  error: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  candidateCount: number;
  selectedCount: number;
};

export function listRuns(limit = 20): RunRow[] {
  return all<RunRow>(
    `SELECT r.id, r.mode, r.scope, r.status, r.stats, r.error, r.started_at, r.finished_at, r.created_at,
            (SELECT COUNT(*) FROM discovered_candidates c WHERE c.run_id=r.id) AS candidateCount,
            (SELECT COUNT(*) FROM discovered_candidates c WHERE c.run_id=r.id AND c.status IN ('selected','duplicate')) AS selectedCount
       FROM discovery_runs r
      ORDER BY r.created_at DESC LIMIT ?`,
    [limit],
  );
}

export function getRun(id: string): RunRow | undefined {
  return listRuns(500).find((row) => row.id === id);
}

export type CandidateRow = {
  id: string;
  run_id: string;
  url: string;
  domain: string;
  title: string | null;
  snippet: string | null;
  score: number;
  reason: string | null;
  status: string;
  job_id: string | null;
  created_at: string;
};

export function listCandidates(runId?: string, status?: string, limit = 200): CandidateRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (runId) {
    clauses.push("run_id = ?");
    params.push(runId);
  }
  if (status) {
    clauses.push("status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<CandidateRow>(
    `SELECT id, run_id, url, domain, title, snippet, score, reason, status, job_id, created_at
       FROM discovered_candidates ${where}
      ORDER BY score DESC, created_at DESC LIMIT ?`,
    [...params, limit],
  );
}

/* -------------------------------------------------------------------- jobs */

export type JobRow = {
  id: string;
  asset_id: string | null;
  stage: string;
  state: string;
  progress: number;
  attempt: number;
  max_attempts: number;
  last_error: string | null;
  payload: string | null;
  source_url: string | null;
  domain: string | null;
  title: string | null;
  exam: string | null;
  page_count: number | null;
  original_bytes: number | null;
  optimized_bytes: number | null;
  saving: number | null;
  filename: string | null;
  created_at: string;
  updated_at: string;
  published_resource_id: string | null;
};

const JOB_SELECT = `
  SELECT j.id, j.asset_id, j.stage, j.state, j.progress, j.attempt, j.max_attempts, j.last_error, j.payload,
         c.url AS source_url, c.domain, c.title,
         a.original_filename AS filename, a.page_count, a.size_bytes AS original_bytes,
         (SELECT v.size_bytes FROM document_versions v WHERE v.asset_id=j.asset_id AND v.kind='optimized') AS optimized_bytes,
         CASE WHEN a.size_bytes > 0 AND EXISTS (SELECT 1 FROM document_versions v WHERE v.asset_id=j.asset_id AND v.kind='optimized')
              THEN ROUND(100.0 * (1 - (SELECT v.size_bytes FROM document_versions v WHERE v.asset_id=j.asset_id AND v.kind='optimized') * 1.0 / a.size_bytes), 1)
              ELSE NULL END AS saving,
         j.created_at, j.updated_at, j.published_resource_id
    FROM ingestion_jobs j
    LEFT JOIN discovered_candidates c ON c.id=j.candidate_id
    LEFT JOIN document_assets a ON a.id=j.asset_id`;

export function listJobs(filters: { state?: string; stage?: string; limit?: number } = {}): JobRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (filters.state) {
    clauses.push("j.state = ?");
    params.push(filters.state);
  }
  if (filters.stage) {
    clauses.push("j.stage = ?");
    params.push(filters.stage);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<JobRow>(`${JOB_SELECT} ${where} ORDER BY j.updated_at DESC LIMIT ?`, [...params, filters.limit ?? 100]);
}

export function getJob(id: string): JobRow | undefined {
  return one<JobRow>(`${JOB_SELECT} WHERE j.id = ?`, [id]);
}

export type JobEventRow = {
  id: string;
  stage: string;
  state: string;
  level: string;
  message: string;
  detail: string | null;
  created_at: string;
};

export function getJobEvents(jobId: string): JobEventRow[] {
  return all<JobEventRow>(
    `SELECT id, stage, state, level, message, detail, created_at FROM ingestion_job_events
      WHERE job_id = ? ORDER BY created_at ASC, rowid ASC`,
    [jobId],
  );
}

/* ----------------------------------------------------------------- sources */

export type SourceRow = {
  id: string;
  domain: string;
  label: string;
  kind: string;
  credibility: number;
  access_status: string;
  robots_status: string | null;
  last_checked_at: string | null;
  next_check_at: string | null;
  success_count: number;
  failure_count: number;
  restrictions: string | null;
  enabled: number;
  institution_name: string | null;
};

export function listSources(): SourceRow[] {
  return all<SourceRow>(
    `SELECT s.id, s.domain, s.label, s.kind, s.credibility, s.access_status, s.robots_status,
            s.last_checked_at, s.next_check_at, s.success_count, s.failure_count, s.restrictions, s.enabled,
            i.name AS institution_name
       FROM discovery_sources s
       LEFT JOIN institutions i ON i.id=s.institution_id
      ORDER BY s.enabled DESC, s.credibility DESC, s.domain`,
  );
}

/* ------------------------------------------------------------ institutions */

export type InstitutionRow = {
  id: string;
  slug: string;
  name: string;
  kind: string;
  status: string;
  city: string | null;
  state: string | null;
  website: string | null;
  university_name: string | null;
  college_slug: string | null;
  mappingCount: number;
  verifiedCount: number;
};

export function listInstitutions(): InstitutionRow[] {
  return all<InstitutionRow>(
    `SELECT i.id, i.slug, i.name, i.kind, i.status, i.city, i.state, i.website,
            u.name AS university_name, c.slug AS college_slug,
            (SELECT COUNT(*) FROM institution_curricula m WHERE m.institution_id=i.id) AS mappingCount,
            (SELECT COUNT(*) FROM institution_curricula m WHERE m.institution_id=i.id AND m.verification_status='verified') AS verifiedCount
       FROM institutions i
       LEFT JOIN universities u ON u.id=i.university_id
       LEFT JOIN colleges c ON c.id=i.college_id
      ORDER BY i.kind, i.name`,
  );
}

export type MappingRow = {
  id: string;
  relation: string;
  verification_status: string;
  evidence_url: string | null;
  evidence_note: string | null;
  academic_year: string | null;
  verified_at: string | null;
  curriculum_id: string;
  scheme_label: string;
  programme_short: string;
  branch_name: string | null;
  institution_id: string;
  institution_name: string;
};

export function listMappings(institutionId?: string, curriculumId?: string): MappingRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (institutionId) {
    clauses.push("m.institution_id = ?");
    params.push(institutionId);
  }
  if (curriculumId) {
    clauses.push("m.curriculum_id = ?");
    params.push(curriculumId);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<MappingRow>(
    `SELECT m.id, m.relation, m.verification_status, m.evidence_url, m.evidence_note,
            m.academic_year, m.verified_at, m.curriculum_id, cu.scheme_label,
            p.short_name AS programme_short, b.name AS branch_name,
            m.institution_id, i.name AS institution_name
       FROM institution_curricula m
       JOIN curricula cu ON cu.id=m.curriculum_id
       JOIN institutions i ON i.id=m.institution_id
       JOIN programmes p ON p.id=cu.programme_id
       LEFT JOIN branches b ON b.id=cu.branch_id
       ${where}
      ORDER BY m.created_at DESC`,
    params,
  );
}

/* -------------------------------------------------------------- curricula */

export type CurriculumRow = {
  id: string;
  scheme_label: string;
  scheme_year: number | null;
  status: string;
  effective_from: string | null;
  effective_to: string | null;
  university_short: string;
  university_slug: string;
  programme_short: string;
  programme_slug: string;
  branch_name: string | null;
  subjectCount: number;
  syllabusCount: number;
  institutionCount: number;
};

export function listCurricula(universitySlug?: string): CurriculumRow[] {
  const params: unknown[] = [];
  const where = universitySlug ? "WHERE u.slug = ?" : "";
  if (universitySlug) params.push(universitySlug);
  return all<CurriculumRow>(
    `SELECT cu.id, cu.scheme_label, cu.scheme_year, cu.status, cu.effective_from, cu.effective_to,
            u.short_name AS university_short, u.slug AS university_slug,
            p.short_name AS programme_short, p.slug AS programme_slug, b.name AS branch_name,
            (SELECT COUNT(*) FROM curriculum_subjects cs WHERE cs.curriculum_id=cu.id) AS subjectCount,
            (SELECT COUNT(*) FROM syllabus_versions sv WHERE sv.curriculum_id=cu.id) AS syllabusCount,
            (SELECT COUNT(DISTINCT m.institution_id) FROM institution_curricula m WHERE m.curriculum_id=cu.id) AS institutionCount
       FROM curricula cu
       JOIN universities u ON u.id=cu.university_id
       JOIN programmes p ON p.id=cu.programme_id
       LEFT JOIN branches b ON b.id=cu.branch_id
       ${where}
      ORDER BY u.short_name, p.short_name, b.name, cu.scheme_label`,
    params,
  );
}

export function getCurriculum(id: string) {
  const curriculum = one<CurriculumRow>(
    `SELECT cu.id, cu.scheme_label, cu.scheme_year, cu.status, cu.effective_from, cu.effective_to,
            u.short_name AS university_short, u.slug AS university_slug,
            p.short_name AS programme_short, p.slug AS programme_slug, b.name AS branch_name,
            (SELECT COUNT(*) FROM curriculum_subjects cs WHERE cs.curriculum_id=cu.id) AS subjectCount,
            (SELECT COUNT(*) FROM syllabus_versions sv WHERE sv.curriculum_id=cu.id) AS syllabusCount,
            (SELECT COUNT(DISTINCT m.institution_id) FROM institution_curricula m WHERE m.curriculum_id=cu.id) AS institutionCount
       FROM curricula cu
       JOIN universities u ON u.id=cu.university_id
       JOIN programmes p ON p.id=cu.programme_id
       LEFT JOIN branches b ON b.id=cu.branch_id
      WHERE cu.id = ?`,
    [id],
  );
  if (!curriculum) return null;

  const subjects = all<{
    id: string;
    subject_id: string;
    name: string;
    code: string | null;
    semester: number;
    sequence: number;
    credits_override: string | null;
    credits: string | null;
    is_elective: number;
    unitCount: number;
    versionCount: number;
  }>(
    `SELECT cs.id, cs.subject_id, s.name, s.code, cs.semester, cs.sequence, cs.credits_override,
            s.credits, cs.is_elective,
            (SELECT COUNT(*) FROM syllabus_units su JOIN syllabus_versions sv ON sv.id=su.syllabus_version_id
              WHERE sv.curriculum_id=cs.curriculum_id AND su.subject_id=cs.subject_id) AS unitCount,
            (SELECT COUNT(*) FROM syllabus_versions sv WHERE sv.curriculum_id=cs.curriculum_id AND sv.subject_id=cs.subject_id) AS versionCount
       FROM curriculum_subjects cs
       JOIN subjects s ON s.id=cs.subject_id
      WHERE cs.curriculum_id = ?
      ORDER BY cs.semester, cs.sequence, s.name`,
    [id],
  );

  const versions = all<{
    id: string;
    version_label: string;
    academic_year: string | null;
    regulation: string | null;
    status: string;
    confidence: number | null;
    subject_name: string | null;
    verified_at: string | null;
  }>(
    `SELECT sv.id, sv.version_label, sv.academic_year, sv.regulation, sv.status, sv.confidence,
            s.name AS subject_name, sv.verified_at
       FROM syllabus_versions sv
       LEFT JOIN subjects s ON s.id=sv.subject_id
      WHERE sv.curriculum_id = ?
      ORDER BY sv.created_at DESC`,
    [id],
  );

  const units = all<{
    id: string;
    syllabus_version_id: string;
    unit_no: number;
    title: string | null;
    topics: string | null;
    page_ref: string | null;
    subject_name: string | null;
  }>(
    `SELECT su.id, su.syllabus_version_id, su.unit_no, su.title, su.topics, su.page_ref, s.name AS subject_name
       FROM syllabus_units su
       JOIN syllabus_versions sv ON sv.id=su.syllabus_version_id
       LEFT JOIN subjects s ON s.id=su.subject_id
      WHERE sv.curriculum_id = ?
      ORDER BY su.unit_no`,
    [id],
  );

  return { curriculum, subjects, versions, units, mappings: listMappings(undefined, id) };
}

/* ----------------------------------------------------------------- assets */

export type AssetRow = {
  id: string;
  sha256: string;
  original_filename: string;
  size_bytes: number;
  page_count: number | null;
  storage_key: string;
  source_url: string | null;
  source_domain: string | null;
  created_at: string;
  optimized_bytes: number | null;
  hasText: number;
};

export function listAssets(limit = 100): AssetRow[] {
  return all<AssetRow>(
    `SELECT a.id, a.sha256, a.original_filename, a.size_bytes, a.page_count, a.storage_key,
            a.source_url, a.source_domain, a.created_at,
            (SELECT v.size_bytes FROM document_versions v WHERE v.asset_id=a.id AND v.kind='optimized') AS optimized_bytes,
            CASE WHEN IFNULL(a.text_content,'') = '' THEN 0 ELSE 1 END AS hasText
       FROM document_assets a ORDER BY a.created_at DESC LIMIT ?`,
    [limit],
  );
}

export function getAsset(id: string) {
  const asset = one<AssetRow & { rights: string | null; text_content: string | null }>(
    `SELECT a.id, a.sha256, a.original_filename, a.size_bytes, a.page_count, a.storage_key,
            a.source_url, a.source_domain, a.created_at, a.rights, a.text_content,
            (SELECT v.size_bytes FROM document_versions v WHERE v.asset_id=a.id AND v.kind='optimized') AS optimized_bytes,
            CASE WHEN IFNULL(a.text_content,'') = '' THEN 0 ELSE 1 END AS hasText
       FROM document_assets a WHERE a.id = ?`,
    [id],
  );
  if (!asset) return null;
  const versions = all<{
    id: string;
    kind: string;
    storage_key: string;
    size_bytes: number;
    profile: string | null;
    page_count: number | null;
    valid: number;
    notes: string | null;
    created_at: string;
  }>(
    `SELECT id, kind, storage_key, size_bytes, profile, page_count, valid, notes, created_at
       FROM document_versions WHERE asset_id = ? ORDER BY kind DESC`,
    [id],
  );
  const jobs = all<JobRow>(`${JOB_SELECT} WHERE j.asset_id = ? ORDER BY j.created_at DESC`, [id]);
  return { asset, versions, jobs };
}

/* --------------------------------------------------------------- coverage */

export type CoverageGap = {
  subject_id: string;
  name: string;
  code: string | null;
  semester: number;
  programme_short: string;
  branch_name: string | null;
  university_slug: string;
  curriculum_id: string | null;
  hasSyllabus: number;
};

/**
 * Subjects in the canonical AKTU structure with no verified syllabus document.
 * Discovery is driven by these gaps rather than re-searching what already exists.
 */
export function listCoverageGaps(universitySlug = "aktu", limit = 100): CoverageGap[] {
  return all<CoverageGap>(
    `SELECT s.id AS subject_id, s.name, s.code, s.semester,
            p.short_name AS programme_short, b.name AS branch_name, u.slug AS university_slug,
            (SELECT cu.id FROM curricula cu
              WHERE cu.university_id=s.university_id AND cu.programme_id=s.programme_id
                AND IFNULL(cu.branch_id,'')=IFNULL(s.branch_id,'')
              ORDER BY cu.status='active' DESC LIMIT 1) AS curriculum_id,
            EXISTS (SELECT 1 FROM resources r JOIN categories c ON c.id=r.category_id
                     WHERE r.subject_id=s.id AND r.status='published' AND c.group_slug='syllabus') AS hasSyllabus
       FROM subjects s
       JOIN universities u ON u.id=s.university_id
       JOIN programmes p ON p.id=s.programme_id
       LEFT JOIN branches b ON b.id=s.branch_id
      WHERE u.slug = ? AND s.status='published'
        AND NOT EXISTS (SELECT 1 FROM resources r JOIN categories c ON c.id=r.category_id
                         WHERE r.subject_id=s.id AND r.status='published' AND c.group_slug='syllabus')
      ORDER BY s.semester, s.name LIMIT ?`,
    [universitySlug, limit],
  ).map((row) => ({ ...row, hasSyllabus: Number(row.hasSyllabus) }));
}

/* ------------------------------------------------------------------ events */

export function listRecentEvents(limit = 30) {
  return all<{
    id: string;
    job_id: string;
    stage: string;
    state: string;
    level: string;
    message: string;
    created_at: string;
  }>(
    `SELECT id, job_id, stage, state, level, message, created_at FROM ingestion_job_events
      ORDER BY created_at DESC, rowid DESC LIMIT ?`,
    [limit],
  );
}
