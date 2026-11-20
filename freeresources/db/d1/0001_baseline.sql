-- D1 migration 0001: baseline site schema (universities, programmes, branches,
-- subjects, resources, users, contributions, requests, tickets, audit log).
-- Generated from db/schema.sql by scripts/build-d1-schema.mjs — edit the SQLite
-- schema and regenerate rather than hand-editing this file.

-- FreeResources.in — relational schema
-- SQLite dialect for local/self-hosted use. See db/README.md for the PostgreSQL notes.
-- Every table uses TEXT ids (UUIDs) so the same schema ports cleanly to Postgres.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS universities (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  short_name  TEXT NOT NULL,
  aliases     TEXT,
  state       TEXT NOT NULL,
  city        TEXT,
  type        TEXT NOT NULL DEFAULT 'State' CHECK (type IN ('Central','State','Deemed','Private','Autonomous')),
  description TEXT,
  website     TEXT,
  logo_url    TEXT,
  featured    INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_universities_state ON universities(state);

CREATE TABLE IF NOT EXISTS colleges (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  city          TEXT,
  state         TEXT,
  status        TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_colleges_university ON colleges(university_id);

CREATE TABLE IF NOT EXISTS programmes (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  short_name TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT 'Undergraduate' CHECK (level IN ('Undergraduate','Postgraduate','Diploma','Doctorate')),
  description TEXT
);

CREATE TABLE IF NOT EXISTS branches (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  code          TEXT,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  programme_id  TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_branches_programme ON branches(programme_id);
CREATE INDEX IF NOT EXISTS idx_branches_university ON branches(university_id);

CREATE TABLE IF NOT EXISTS academic_years (
  id             TEXT PRIMARY KEY,
  label          TEXT NOT NULL,
  ordinal        INTEGER NOT NULL UNIQUE,
  semester_from  INTEGER NOT NULL,
  semester_to    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  code          TEXT,
  university_id TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  programme_id  TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  branch_id     TEXT REFERENCES branches(id) ON DELETE SET NULL,
  semester      INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 12),
  credits       TEXT,
  description   TEXT,
  syllabus_text TEXT,
  is_sample     INTEGER NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published','draft')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subjects_uni_prog ON subjects(university_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_subjects_branch_sem ON subjects(branch_id, semester);
CREATE INDEX IF NOT EXISTS idx_subjects_code ON subjects(code);

CREATE TABLE IF NOT EXISTS categories (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  group_slug  TEXT NOT NULL CHECK (group_slug IN ('pyq','notes','syllabus','practical','other')),
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS resources (
  id              TEXT PRIMARY KEY,
  slug            TEXT NOT NULL UNIQUE,
  title           TEXT NOT NULL,
  description     TEXT,
  subject_id      TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  category_id     TEXT NOT NULL REFERENCES categories(id),
  university_id   TEXT NOT NULL REFERENCES universities(id) ON DELETE CASCADE,
  college_id      TEXT REFERENCES colleges(id) ON DELETE SET NULL,
  programme_id    TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE,
  branch_id       TEXT REFERENCES branches(id) ON DELETE SET NULL,
  semester        INTEGER NOT NULL,
  session         TEXT,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published')),
  is_sample       INTEGER NOT NULL DEFAULT 0,
  featured        INTEGER NOT NULL DEFAULT 0,
  contributor_name TEXT,
  uploaded_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
  view_count      INTEGER NOT NULL DEFAULT 0,
  download_count  INTEGER NOT NULL DEFAULT 0,
  published_at    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resources_subject ON resources(subject_id, status);
CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category_id, status);
CREATE INDEX IF NOT EXISTS idx_resources_published ON resources(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_resources_uni_sem ON resources(university_id, semester, status);

CREATE TABLE IF NOT EXISTS resource_files (
  id            TEXT PRIMARY KEY,
  resource_id   TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  storage_key   TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  size_bytes    INTEGER NOT NULL,
  label         TEXT,
  is_primary    INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_resource_files_resource ON resource_files(resource_id);

CREATE TABLE IF NOT EXISTS downloads (
  id          TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
  file_id     TEXT REFERENCES resource_files(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_downloads_resource ON downloads(resource_id, created_at);

CREATE TABLE IF NOT EXISTS contributions (
  id               TEXT PRIMARY KEY,
  public_id        TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  university_id    TEXT NOT NULL REFERENCES universities(id),
  college_id       TEXT REFERENCES colleges(id) ON DELETE SET NULL,
  programme_id     TEXT NOT NULL REFERENCES programmes(id),
  branch_id        TEXT REFERENCES branches(id) ON DELETE SET NULL,
  semester         INTEGER NOT NULL,
  subject_name     TEXT NOT NULL,
  subject_code     TEXT,
  category_id      TEXT NOT NULL REFERENCES categories(id),
  session          TEXT,
  description      TEXT,
  contributor_name TEXT NOT NULL,
  email            TEXT NOT NULL,
  user_id          TEXT REFERENCES users(id) ON DELETE SET NULL,
  file_path        TEXT NOT NULL,
  file_name        TEXT NOT NULL,
  file_size        INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_notes     TEXT,
  resource_id      TEXT REFERENCES resources(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at      TEXT
);
CREATE INDEX IF NOT EXISTS idx_contributions_status ON contributions(status, created_at);

CREATE TABLE IF NOT EXISTS requests (
  id            TEXT PRIMARY KEY,
  public_id     TEXT NOT NULL UNIQUE,
  university_id TEXT NOT NULL REFERENCES universities(id),
  programme_id  TEXT NOT NULL REFERENCES programmes(id),
  branch_id     TEXT REFERENCES branches(id) ON DELETE SET NULL,
  semester      INTEGER,
  subject_name  TEXT NOT NULL,
  subject_code  TEXT,
  category_id   TEXT REFERENCES categories(id),
  email         TEXT NOT NULL,
  details       TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','fulfilled','closed')),
  admin_notes   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, created_at);

CREATE TABLE IF NOT EXISTS tickets (
  id          TEXT PRIMARY KEY,
  public_id   TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  category    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  resource_id TEXT REFERENCES resources(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
  admin_reply TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, created_at);

CREATE TABLE IF NOT EXISTS community_links (
  id            TEXT PRIMARY KEY,
  university_id TEXT REFERENCES universities(id) ON DELETE CASCADE,
  label         TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'Telegram',
  url           TEXT NOT NULL,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS advertisements (
  id          TEXT PRIMARY KEY,
  slot        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  image_url   TEXT,
  target_url  TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS faqs (
  id         TEXT PRIMARY KEY,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  category   TEXT DEFAULT 'General',
  sort_order INTEGER NOT NULL DEFAULT 0,
  published  INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS announcements (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  tone       TEXT NOT NULL DEFAULT 'info' CHECK (tone IN ('info','success','warning')),
  active     INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS site_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS search_queries (
  id           TEXT PRIMARY KEY,
  query        TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_search_queries_created ON search_queries(created_at);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  action     TEXT NOT NULL,
  entity     TEXT NOT NULL,
  entity_id  TEXT,
  detail     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
