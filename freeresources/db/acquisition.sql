-- FreeResources.in — AKTU academic intelligence & autonomous acquisition
-- Additive schema. Applied after db/schema.sql by lib/db.ts and scripts/migrate.mjs.
-- SQLite dialect, written to port cleanly to PostgreSQL (TEXT ids, no SQLite-only types).

PRAGMA foreign_keys = ON;

/* ------------------------------------------------------------- institutions */

CREATE TABLE IF NOT EXISTS institutions (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'affiliated_college'
                CHECK (kind IN ('university','affiliated_college','autonomous','institute','other')),
  university_id TEXT REFERENCES universities(id) ON DELETE SET NULL,
  college_id    TEXT REFERENCES colleges(id) ON DELETE SET NULL,
  city          TEXT,
  state         TEXT,
  website       TEXT,
  status        TEXT NOT NULL DEFAULT 'needs_verification'
                CHECK (status IN ('active','archived','needs_verification')),
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_institutions_university ON institutions(university_id);
CREATE INDEX IF NOT EXISTS idx_institutions_status ON institutions(status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_institutions_college ON institutions(college_id) WHERE college_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS institution_aliases (
  id             TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  alias          TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (institution_id, alias)
);
CREATE INDEX IF NOT EXISTS idx_institution_aliases_name ON institution_aliases(alias);

/* --------------------------------------------------------- canonical model */

CREATE TABLE IF NOT EXISTS curricula (
  id             TEXT PRIMARY KEY,
  university_id  TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  programme_id   TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  branch_id      TEXT REFERENCES branches(id) ON DELETE SET NULL,
  scheme_label   TEXT NOT NULL,
  scheme_year    INTEGER,
  effective_from TEXT,
  effective_to   TEXT,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','superseded')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_curricula_unique
  ON curricula(university_id, programme_id, IFNULL(branch_id,''), scheme_label COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_curricula_programme ON curricula(programme_id, branch_id);

CREATE TABLE IF NOT EXISTS curriculum_subjects (
  id               TEXT PRIMARY KEY,
  curriculum_id    TEXT NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  subject_id       TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  semester         INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 12),
  sequence         INTEGER NOT NULL DEFAULT 0,
  is_elective      INTEGER NOT NULL DEFAULT 0,
  credits_override TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (curriculum_id, subject_id, semester)
);
CREATE INDEX IF NOT EXISTS idx_curriculum_subjects_curriculum ON curriculum_subjects(curriculum_id, semester);
CREATE INDEX IF NOT EXISTS idx_curriculum_subjects_subject ON curriculum_subjects(subject_id);

/* --------------------------------------------------------------- documents */

CREATE TABLE IF NOT EXISTS document_assets (
  id                TEXT PRIMARY KEY,
  sha256            TEXT NOT NULL UNIQUE,
  original_filename TEXT NOT NULL,
  mime_type         TEXT NOT NULL DEFAULT 'application/pdf',
  size_bytes        INTEGER NOT NULL,
  page_count        INTEGER,
  storage_key       TEXT NOT NULL,
  source_url        TEXT,
  source_domain     TEXT,
  rights            TEXT,
  text_content      TEXT,
  extracted         TEXT,
  /** Evidence-derived classification, never the discovery query. */
  document_type     TEXT,
  /** Comma-separated semesters the document actually covers (e.g. '1,2'). */
  covers_semesters  TEXT,
  fetched_at        TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_document_assets_domain ON document_assets(source_domain);
CREATE INDEX IF NOT EXISTS idx_document_assets_created ON document_assets(created_at);

CREATE TABLE IF NOT EXISTS document_versions (
  id          TEXT PRIMARY KEY,
  asset_id    TEXT NOT NULL REFERENCES document_assets(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('original','optimized')),
  storage_key TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  sha256      TEXT,
  profile     TEXT,
  page_count  INTEGER,
  valid       INTEGER NOT NULL DEFAULT 0,
  notes       TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (asset_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_asset ON document_versions(asset_id);

/* ---------------------------------------------------------------- syllabus */

CREATE TABLE IF NOT EXISTS syllabus_versions (
  id                 TEXT PRIMARY KEY,
  curriculum_id      TEXT NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  subject_id         TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  version_label      TEXT NOT NULL,
  academic_year      TEXT,
  regulation         TEXT,
  status             TEXT NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','in_review','verified','superseded')),
  source_asset_id    TEXT REFERENCES document_assets(id) ON DELETE SET NULL,
  confidence         REAL,
  verified_by        TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at        TEXT,
  notes              TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_syllabus_versions_curriculum ON syllabus_versions(curriculum_id, subject_id);
CREATE INDEX IF NOT EXISTS idx_syllabus_versions_status ON syllabus_versions(status);

CREATE TABLE IF NOT EXISTS syllabus_units (
  id                 TEXT PRIMARY KEY,
  syllabus_version_id TEXT NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
  subject_id         TEXT REFERENCES subjects(id) ON DELETE SET NULL,
  unit_no            INTEGER NOT NULL,
  title              TEXT,
  topics             TEXT,
  page_ref           TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_syllabus_units_version ON syllabus_units(syllabus_version_id, unit_no);

CREATE TABLE IF NOT EXISTS institution_curricula (
  id                  TEXT PRIMARY KEY,
  institution_id      TEXT NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  curriculum_id       TEXT NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
  relation            TEXT NOT NULL DEFAULT 'pending_verification'
                      CHECK (relation IN ('exact','modified','partial','independent','pending_verification')),
  verification_status TEXT NOT NULL DEFAULT 'unverified'
                      CHECK (verification_status IN ('unverified','verified','rejected')),
  evidence_url        TEXT,
  evidence_note       TEXT,
  academic_year       TEXT,
  verified_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  verified_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_institution_curricula_unique
  ON institution_curricula(institution_id, curriculum_id, IFNULL(academic_year,''));
CREATE INDEX IF NOT EXISTS idx_institution_curricula_curriculum ON institution_curricula(curriculum_id);

/* --------------------------------------------------------------- discovery */

CREATE TABLE IF NOT EXISTS discovery_sources (
  id               TEXT PRIMARY KEY,
  domain           TEXT NOT NULL UNIQUE,
  label            TEXT NOT NULL,
  kind             TEXT NOT NULL DEFAULT 'official'
                   CHECK (kind IN ('official','college','repository','search','manual')),
  institution_id   TEXT REFERENCES institutions(id) ON DELETE SET NULL,
  credibility      REAL NOT NULL DEFAULT 0.5 CHECK (credibility >= 0 AND credibility <= 1),
  access_status    TEXT NOT NULL DEFAULT 'unknown'
                   CHECK (access_status IN ('allowed','restricted','blocked','unknown')),
  robots_status    TEXT,
  last_checked_at  TEXT,
  next_check_at    TEXT,
  success_count    INTEGER NOT NULL DEFAULT 0,
  failure_count    INTEGER NOT NULL DEFAULT 0,
  restrictions     TEXT,
  /** Declared syllabus/curriculum index page the crawler starts from. */
  index_url        TEXT,
  enabled          INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discovery_sources_enabled ON discovery_sources(enabled, next_check_at);

CREATE TABLE IF NOT EXISTS discovery_runs (
  id          TEXT PRIMARY KEY,
  mode        TEXT NOT NULL DEFAULT 'gap' CHECK (mode IN ('gap','manual','scheduled','source')),
  scope       TEXT,
  status      TEXT NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','running','paused','cancelled','completed','failed')),
  stats       TEXT,
  triggered_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  error       TEXT,
  started_at  TEXT,
  finished_at TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_discovery_runs_status ON discovery_runs(status, created_at);

CREATE TABLE IF NOT EXISTS discovered_candidates (
  id         TEXT PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES discovery_runs(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  domain     TEXT NOT NULL,
  title      TEXT,
  snippet    TEXT,
  source_id  TEXT REFERENCES discovery_sources(id) ON DELETE SET NULL,
  score      REAL NOT NULL DEFAULT 0,
  reason     TEXT,
  status     TEXT NOT NULL DEFAULT 'candidate'
             CHECK (status IN ('candidate','selected','rejected','duplicate','failed')),
  job_id     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (run_id, url)
);
CREATE INDEX IF NOT EXISTS idx_candidates_run ON discovered_candidates(run_id, status);
CREATE INDEX IF NOT EXISTS idx_candidates_url ON discovered_candidates(url);

/* ------------------------------------------------------------------- jobs */

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id                   TEXT PRIMARY KEY,
  candidate_id         TEXT REFERENCES discovered_candidates(id) ON DELETE SET NULL,
  asset_id             TEXT REFERENCES document_assets(id) ON DELETE SET NULL,
  document_version_id  TEXT REFERENCES document_versions(id) ON DELETE SET NULL,
  stage                TEXT NOT NULL DEFAULT 'selected',
  state                TEXT NOT NULL DEFAULT 'queued'
                       CHECK (state IN ('queued','running','paused','cancelled','failed','retry_scheduled','needs_review','rejected','skipped','awaiting_approval','completed')),
  progress             INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  attempt              INTEGER NOT NULL DEFAULT 0,
  max_attempts         INTEGER NOT NULL DEFAULT 3,
  lease_owner          TEXT,
  lease_expires_at     TEXT,
  next_run_at          TEXT,
  last_error           TEXT,
  payload              TEXT,
  published_resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
  approved_by          TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_runnable ON ingestion_jobs(state, next_run_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_stage ON ingestion_jobs(stage, state);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_candidate ON ingestion_jobs(candidate_id);

CREATE TABLE IF NOT EXISTS ingestion_job_events (
  id         TEXT PRIMARY KEY,
  job_id     TEXT NOT NULL REFERENCES ingestion_jobs(id) ON DELETE CASCADE,
  stage      TEXT NOT NULL,
  state      TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warn','error')),
  message    TEXT NOT NULL,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_job_events_job ON ingestion_job_events(job_id, created_at);

/* ------------------------------------------------------- slug redirects */

/** Stable redirects when a published document is renamed for accuracy. */
CREATE TABLE IF NOT EXISTS resource_slug_aliases (
  slug        TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  reason      TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ---------------------------------------------------------------- settings */

CREATE TABLE IF NOT EXISTS acquisition_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* ----------------------------------------------------------------- copilot */

CREATE TABLE IF NOT EXISTS copilot_conversations (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL DEFAULT 'New conversation',
  context_page TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_copilot_conversations_user ON copilot_conversations(user_id, updated_at);

CREATE TABLE IF NOT EXISTS copilot_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES copilot_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content         TEXT NOT NULL,
  tool_calls      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_copilot_messages_conversation ON copilot_messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS copilot_actions (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES copilot_conversations(id) ON DELETE SET NULL,
  tool            TEXT NOT NULL,
  input           TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'proposed'
                  CHECK (status IN ('proposed','executed','failed','rejected','expired')),
  result          TEXT,
  proposed_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  executed_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  executed_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_copilot_actions_status ON copilot_actions(status, created_at);
