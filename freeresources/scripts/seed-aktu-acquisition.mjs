/**
 * Seeds the acquisition layer for AKTU: the university institution record, one
 * canonical curriculum per branch, the existing AKTU subjects attached to them,
 * and the official discovery source. Idempotent — safe to run repeatedly.
 *
 *   node scripts/seed-aktu-acquisition.mjs
 */
import { randomUUID } from "node:crypto";
import path from "node:path";
import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(process.cwd(), "db", "freeresources.db");
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");

const university = db.prepare("SELECT * FROM universities WHERE slug = 'aktu'").get();
if (!university) {
  console.error("AKTU university row is missing. Run node scripts/seed.mjs first.");
  process.exit(1);
}

const now = () => new Date().toISOString();

/* ------------------------------------------------------- AKTU institution */

let institution = db.prepare("SELECT * FROM institutions WHERE university_id = ? AND kind = 'university'").get(university.id);
if (!institution) {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO institutions (id, slug, name, kind, university_id, city, state, website, status, notes)
     VALUES (?, 'aktu', ?, 'university', ?, ?, ?, ?, 'active', ?)`,
  ).run(
    id,
    university.name,
    university.id,
    university.city ?? null,
    university.state ?? null,
    university.website ?? "https://aktu.ac.in",
    "Master syllabus authority for its affiliated colleges. Only AKTU itself is treated as the canonical source.",
  );
  institution = db.prepare("SELECT * FROM institutions WHERE id = ?").get(id);
  console.log("Created AKTU institution.");
}

const aliases = ["AKTU", "Dr. A.P.J. Abdul Kalam Technical University", "UPTU", "Abdul Kalam Technical University"];
for (const alias of aliases) {
  db.prepare("INSERT OR IGNORE INTO institution_aliases (id, institution_id, alias) VALUES (?, ?, ?)").run(
    randomUUID(),
    institution.id,
    alias,
  );
}

/* ------------------------------------------------------------- curricula */

const branches = db.prepare("SELECT * FROM branches WHERE university_id = ? AND status='published'").all(university.id);
const SCHEME_LABEL = "Unspecified scheme";
let createdCurricula = 0;

for (const branch of branches) {
  const existing = db
    .prepare(
      `SELECT id FROM curricula WHERE university_id = ? AND programme_id = ? AND IFNULL(branch_id,'') = ?
         AND scheme_label = ? COLLATE NOCASE`,
    )
    .get(university.id, branch.programme_id, branch.id, SCHEME_LABEL);
  let curriculumId = existing?.id;

  if (!curriculumId) {
    curriculumId = randomUUID();
    db.prepare(
      `INSERT INTO curricula (id, university_id, programme_id, branch_id, scheme_label, status)
       VALUES (?, ?, ?, ?, ?, 'draft')`,
    ).run(curriculumId, university.id, branch.programme_id, branch.id, SCHEME_LABEL);
    createdCurricula += 1;
  }

  const subjects = db.prepare("SELECT * FROM subjects WHERE branch_id = ? AND status='published'").all(branch.id);
  for (const subject of subjects) {
    db.prepare(
      `INSERT OR IGNORE INTO curriculum_subjects (id, curriculum_id, subject_id, semester, sequence)
       VALUES (?, ?, ?, ?, 0)`,
    ).run(randomUUID(), curriculumId, subject.id, subject.semester);
  }
}

console.log(`Curricula created: ${createdCurricula}. Branchless and cross-stream subjects stay unlinked until reviewed.`);

/* ------------------------------------------------------- discovery sources */

const sources = [
  {
    domain: "aktu.ac.in",
    label: "AKTU official website",
    kind: "official",
    credibility: 0.95,
    restrictions: "Official syllabus PDFs, course structures, regulations and circulars only.",
    // AKTU publishes no sitemap; this page indexes every academic year.
    indexUrl: "https://aktu.ac.in/syllabus.html",
  },
  {
    domain: "fms.aktu.ac.in",
    label: "AKTU file management system (syllabus PDFs)",
    kind: "official",
    credibility: 0.95,
    restrictions: "Official syllabus and evaluation-scheme PDFs published by AKTU.",
  },
  {
    domain: "erp.aktu.ac.in",
    label: "AKTU ERP academic documents",
    kind: "official",
    credibility: 0.9,
    restrictions: "Only if robots.txt permits document retrieval.",
  },
];

for (const source of sources) {
  db.prepare(
    `INSERT OR IGNORE INTO discovery_sources (id, domain, label, kind, credibility, restrictions, enabled, next_check_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, NULL)`,
  ).run(randomUUID(), source.domain, source.label, source.kind, source.credibility, source.restrictions);
  if (source.indexUrl) {
    db.prepare("UPDATE discovery_sources SET index_url = ? WHERE domain = ?").run(source.indexUrl, source.domain);
  }
}

/* --------------------------------------------------------------- settings */

const defaults = {
  discovery_enabled: "1",
  scheduler_enabled: "0",
  compression_profile: "balanced",
  auto_select_threshold: "0.75",
  max_download_mb: "40",
  discovery_interval_minutes: "1440",
  source_recheck_hours: "168",
};
for (const [key, value] of Object.entries(defaults)) {
  const exists = db.prepare("SELECT key FROM acquisition_settings WHERE key = ?").get(key);
  if (!exists) {
    db.prepare("INSERT INTO acquisition_settings (key, value, updated_at) VALUES (?, ?, ?)").run(key, value, now());
  }
}
// Never overwrite an administrator's scheduler choice on re-seed.
console.log("Discovery sources and settings ready.");
console.log(`Seeded at ${now()}`);
