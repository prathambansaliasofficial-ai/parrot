/**
 * Builds data/aktu/manifest.json — the metadata manifest for the real AKTU
 * documents the acquisition pipeline discovered and stored.
 *
 * Source of truth, in order:
 *   1. docs/aktu-audit.json       (committed, machine-written audit report)
 *   2. db/freeresources.db        (local SQLite, when present: storage keys,
 *                                  syllabus versions, live approval state)
 *   3. Cloudflare R2              (never read here; binaries stay in R2)
 *
 * The manifest contains metadata only. PDFs, SQLite files and storage keys that
 * point at private buckets are not binaries and are safe to commit; the actual
 * objects are not.
 *
 * Fixture documents (localhost/127.0.0.1 sources) are always excluded from the
 * dataset and listed separately so the exclusion is auditable.
 *
 *   node scripts/data-aktu-export.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const auditPath = path.join(root, "docs", "aktu-audit.json");
const outDir = path.join(root, "data", "aktu");
const outPath = path.join(outDir, "manifest.json");
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.join(root, "db", "freeresources.db");

const warnings = [];

if (!fs.existsSync(auditPath)) {
  console.error(`Missing audit report: ${path.relative(root, auditPath)}`);
  process.exit(1);
}

const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
const findings = Array.isArray(audit.findings) ? audit.findings : [];

const isFixtureSource = (url) =>
  !url || /^https?:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/i.test(url);

function academicYearFrom(sourceUrl) {
  const match = /Syllabus(\d{2})(\d{2})/i.exec(sourceUrl || "");
  return match ? `20${match[1]}-${match[2]}` : null;
}

function titleFromFilename(filename) {
  return String(filename || "")
    .replace(/\.pdf$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Live rows from the local database, when it exists. */
async function readLocalDatabase() {
  if (!fs.existsSync(dbPath)) {
    warnings.push(
      `Local database not found at ${path.relative(root, dbPath)}. The manifest has no storage keys; run this on the machine that holds the acquisition database, then re-export.`,
    );
    return { assets: new Map(), versions: new Map() };
  }

  let Database;
  try {
    ({ default: Database } = await import("better-sqlite3"));
  } catch {
    warnings.push("better-sqlite3 is not installed; run `npm ci` to include storage keys.");
    return { assets: new Map(), versions: new Map() };
  }

  const db = new Database(dbPath, { readonly: true });
  const assets = new Map();
  const versions = new Map();
  try {
    for (const row of db
      .prepare(
        "SELECT sha256, storage_key, source_url, source_domain, original_filename, document_type, covers_semesters, fetched_at FROM document_assets",
      )
      .all()) {
      assets.set(row.sha256, row);
    }
    for (const row of db
      .prepare(
        "SELECT sv.id, sv.status, sv.version_label, da.sha256 FROM syllabus_versions sv JOIN document_assets da ON da.id = sv.source_asset_id",
      )
      .all()) {
      const list = versions.get(row.sha256) ?? [];
      list.push({ id: row.id, status: row.status, versionLabel: row.version_label });
      versions.set(row.sha256, list);
    }
  } catch (error) {
    warnings.push(`Could not read acquisition tables from SQLite: ${error.message}`);
  } finally {
    db.close();
  }
  return { assets, versions };
}

const { assets, versions } = await readLocalDatabase();

const documents = [];
const excluded = [];

for (const finding of findings) {
  if (isFixtureSource(finding.sourceUrl)) {
    excluded.push({
      sha256: finding.sha256,
      sourceUrl: finding.sourceUrl,
      reason: "Local test fixture server, not an AKTU source",
    });
    continue;
  }

  const live = assets.get(finding.sha256);
  const published = (finding.linkedResources || [])[0] || null;

  documents.push({
    assetId: finding.assetId,
    sha256: finding.sha256,
    sourceUrl: finding.sourceUrl,
    sourceDomain: live?.source_domain || new URL(finding.sourceUrl).hostname,
    sourceFilename: finding.sourceFilename,
    storedFilename: finding.storedFilename,
    storageKey: live?.storage_key || null,
    title: published?.title || titleFromFilename(finding.storedFilename),
    titleSource: published?.title ? "published-resource" : "source-filename",
    documentType: finding.detectedType,
    documentTypeLabel: finding.detectedTypeLabel,
    classificationConfidence: finding.confidence,
    academicYear: academicYearFrom(finding.sourceUrl),
    pageCount: finding.pageCount,
    sizeBytes: finding.sizeBytes,
    coversSemesters: finding.coversSemesters || [],
    subjectCodes: finding.subjectCodes || [],
    unitCount: finding.unitCount || 0,
    approval: {
      publishedResource: published
        ? {
            id: published.id,
            slug: published.slug,
            title: published.title,
            status: published.status,
            semester: published.semester,
            subjectName: published.subject_name,
          }
        : null,
      syllabusVersions: versions.get(finding.sha256) || finding.syllabusVersions || [],
    },
    mismatches: finding.mismatches || [],
  });
}

if (documents.some((document) => !document.storageKey)) {
  warnings.push(
    `${documents.filter((d) => !d.storageKey).length} document(s) have no storage key in the manifest. They import as metadata only; the original object must be exported from the machine or R2 bucket that holds it.`,
  );
}

const manifest = {
  manifestVersion: 1,
  generatedAt: new Date().toISOString(),
  university: {
    slug: "aktu",
    name: "Dr. A.P.J. Abdul Kalam Technical University",
    shortName: "AKTU",
    website: "https://aktu.ac.in",
    documentHost: "fms.aktu.ac.in",
  },
  source: {
    auditReport: path.relative(root, auditPath).replace(/\\/g, "/"),
    auditGeneratedAt: audit.generatedAt ?? null,
    localDatabase: assets.size > 0 ? path.relative(root, dbPath).replace(/\\/g, "/") : null,
    note: "Metadata only. Document binaries live in Cloudflare R2 and are never committed.",
  },
  counts: {
    auditAssets: findings.length,
    genuineDocuments: documents.length,
    fixturesExcluded: excluded.length,
    published: documents.filter((d) => d.approval.publishedResource?.status === "published").length,
    pendingApproval: documents.filter((d) => !d.approval.publishedResource).length,
    withStorageKey: documents.filter((d) => d.storageKey).length,
    withMismatches: documents.filter((d) => d.mismatches.length > 0).length,
  },
  warnings,
  documents,
  excluded,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Wrote ${path.relative(root, outPath)}`);
console.log(`  Genuine documents : ${manifest.counts.genuineDocuments}`);
console.log(`  Published         : ${manifest.counts.published}`);
console.log(`  Pending approval  : ${manifest.counts.pendingApproval}`);
console.log(`  Fixtures excluded : ${manifest.counts.fixturesExcluded}`);
console.log(`  With storage key  : ${manifest.counts.withStorageKey}`);
for (const warning of warnings) console.warn(`  ! ${warning}`);
