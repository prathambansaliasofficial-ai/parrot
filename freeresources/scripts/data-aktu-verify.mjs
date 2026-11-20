/**
 * Validates data/aktu/manifest.json before it is imported anywhere.
 *
 * It does not need Cloudflare credentials and it never writes to a database.
 * Exit code 0 means the manifest is internally consistent and contains no
 * fixture data; exit code 1 means at least one blocking problem was found.
 *
 *   node scripts/data-aktu-verify.mjs
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const manifestPath = path.join(root, "data", "aktu", "manifest.json");

const errors = [];
const notices = [];

if (!fs.existsSync(manifestPath)) {
  console.error("Missing data/aktu/manifest.json. Run `npm run data:aktu:export` first.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const documents = manifest.documents ?? [];

const isFixtureSource = (url) =>
  !url || /^https?:\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/i.test(url);

const seenHashes = new Set();
const seenIds = new Set();

for (const [index, document] of documents.entries()) {
  const label = document.assetId ?? `#${index}`;

  if (!document.assetId) errors.push(`${label}: missing assetId`);
  if (seenIds.has(document.assetId)) errors.push(`${label}: duplicate assetId`);
  seenIds.add(document.assetId);

  if (!/^[a-f0-9]{64}$/i.test(document.sha256 ?? "")) {
    errors.push(`${label}: sha256 is not a 64-character hex digest`);
  }
  if (seenHashes.has(document.sha256)) errors.push(`${label}: duplicate sha256 ${document.sha256}`);
  seenHashes.add(document.sha256);

  if (isFixtureSource(document.sourceUrl)) {
    errors.push(`${label}: fixture/localhost source URL must never be in the dataset`);
  } else if (!/^https:\/\/fms\.aktu\.ac\.in\//i.test(document.sourceUrl ?? "")) {
    notices.push(`${label}: source is not on fms.aktu.ac.in (${document.sourceUrl})`);
  }

  if (!document.title) errors.push(`${label}: missing title`);
  if (!document.documentType) errors.push(`${label}: missing documentType`);
  if (typeof document.pageCount !== "number" || document.pageCount <= 0) {
    errors.push(`${label}: pageCount must be a positive number`);
  }
  if (document.storageKey === null) {
    notices.push(`${label}: metadata only (no storage key); binary lives in R2`);
  }

  // A course-structure document must never be published as a single-subject
  // syllabus. This is the regression that was corrected for the 100-page
  // CSE Stream document.
  const published = document.approval?.publishedResource;
  if (published && document.documentType === "course_structure") {
    const looksSubjectSpecific = /subject|unit\s*\d|syllabus$/i.test(published.subjectName ?? "");
    if (looksSubjectSpecific) {
      errors.push(`${label}: course_structure document published as subject syllabus "${published.subjectName}"`);
    }
  }
}

for (const excluded of manifest.excluded ?? []) {
  if (!isFixtureSource(excluded.sourceUrl)) {
    errors.push(`excluded entry ${excluded.sha256}: exclusion reason does not match a fixture source`);
  }
}

const counted = {
  genuineDocuments: documents.length,
  published: documents.filter((d) => d.approval?.publishedResource?.status === "published").length,
  pendingApproval: documents.filter((d) => !d.approval?.publishedResource).length,
};
for (const [key, value] of Object.entries(counted)) {
  if (manifest.counts?.[key] !== value) {
    errors.push(`counts.${key} is ${manifest.counts?.[key]} but the manifest contains ${value}`);
  }
}

console.log(`AKTU manifest: ${path.relative(root, manifestPath)}`);
console.log(`  Genuine documents : ${counted.genuineDocuments}`);
console.log(`  Published         : ${counted.published}`);
console.log(`  Pending approval  : ${counted.pendingApproval}`);
console.log(`  Fixtures excluded : ${(manifest.excluded ?? []).length}`);
for (const notice of notices) console.log(`  - ${notice}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} blocking problem(s):`);
  for (const error of errors) console.error(`  x ${error}`);
  process.exit(1);
}

console.log("\nManifest is valid.");
