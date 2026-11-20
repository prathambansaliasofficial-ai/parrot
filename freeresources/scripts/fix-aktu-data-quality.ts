/**
 * AKTU data-quality correction.
 *
 * Applies only corrections supported by the document's own content (see
 * docs/AKTU-AUDIT.md). Nothing is deleted: the original asset, its versions,
 * the previous slug (as a redirect alias) and the audit trail are preserved.
 *
 *   npx tsx scripts/fix-aktu-data-quality.ts --dry-run
 *   npx tsx scripts/fix-aktu-data-quality.ts
 */
import { randomUUID } from "node:crypto";

import { loadEnv } from "../lib/acquisition/env";
loadEnv();

import { all, getDb, one, run, transaction } from "../lib/db";
import { classifyDocument, DOCUMENT_TYPE_LABELS } from "../lib/acquisition/doctype";
import { extractText } from "../lib/acquisition/pdf";
import { storage } from "../lib/acquisition/storage";

const DRY = process.argv.includes("--dry-run");

type AssetRow = {
  id: string;
  sha256: string;
  original_filename: string;
  page_count: number | null;
  storage_key: string;
  source_url: string | null;
  text_content: string | null;
  document_type: string | null;
  covers_semesters: string | null;
};

function sourceBasename(url: string | null): string | null {
  if (!url) return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return name || null;
  } catch {
    return null;
  }
}

function adminUserId(): string | null {
  return one<{ id: string }>("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1")?.id ?? null;
}

function audit(entity: string, entityId: string, action: string, detail: unknown): void {
  run("INSERT INTO audit_log (id, user_id, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)", [
    randomUUID(),
    adminUserId(),
    action,
    entity,
    entityId,
    JSON.stringify(detail).slice(0, 4000),
  ]);
}

async function textFor(asset: AssetRow): Promise<string> {
  if (asset.text_content && asset.text_content.length > 200) return asset.text_content;
  try {
    const bytes = await storage().get(asset.storage_key);
    return await extractText(bytes, 14);
  } catch {
    return "";
  }
}

function uniqueSlug(base: string): string {
  const clean = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  let candidate = clean;
  let n = 1;
  while (one("SELECT id FROM resources WHERE slug = ?", [candidate])) {
    n += 1;
    candidate = `${clean}-${n}`;
  }
  return candidate;
}

async function main(): Promise<void> {
  getDb(); // applies the additive columns (document_type, covers_semesters, aliases)

  const assets = all<AssetRow>(
    `SELECT id, sha256, original_filename, page_count, storage_key, source_url, text_content,
            document_type, covers_semesters
       FROM document_assets ORDER BY created_at ASC`,
  );

  /* 1. Record evidence for every asset and restore the true source filename. */
  const evidence = new Map<string, ReturnType<typeof classifyDocument>>();
  for (const asset of assets) {
    const text = await textFor(asset);
    const result = classifyDocument(text, asset.page_count);
    evidence.set(asset.id, result);

    const realName = sourceBasename(asset.source_url);
    const filenameWrong = realName !== null && asset.original_filename !== realName;
    const typeWrong = asset.document_type !== result.documentType;
    const coverageWrong = asset.covers_semesters !== result.coversSemesters.join(",");
    if (!filenameWrong && !typeWrong && !coverageWrong) continue;

    console.log(
      `${DRY ? "[dry] " : ""}asset ${asset.id.slice(0, 8)}: type=${result.documentType}, semesters=${result.coversSemesters.join(",") || "?"}${
        filenameWrong ? `, filename="${asset.original_filename}" → "${realName}"` : ""
      }`,
    );
    if (DRY) continue;
    run(
      `UPDATE document_assets SET original_filename = ?, document_type = ?, covers_semesters = ? WHERE id = ?`,
      [realName ?? asset.original_filename, result.documentType, result.coversSemesters.join(",") || null, asset.id],
    );
  }

  /* 2. The published 100-page document: a stream course structure, not BCS301. */
  const bigAsset = assets.find((asset) => (asset.page_count ?? 0) >= 50);
  if (!bigAsset) {
    console.log("No large AKTU asset found; nothing to re-map.");
  } else {
    const result = evidence.get(bigAsset.id)!;
    const job = one<{ published_resource_id: string | null }>(
      "SELECT published_resource_id FROM ingestion_jobs WHERE asset_id = ? AND published_resource_id IS NOT NULL LIMIT 1",
      [bigAsset.id],
    );
    if (!job?.published_resource_id) {
      console.log("The large asset is not published; skipping the resource re-map.");
    } else if (result.documentType !== "course_structure" && result.documentType !== "complete_curriculum") {
      console.log(`Evidence does not support a course-structure correction (${result.documentType}); refusing to edit.`);
    } else {
      const resource = one<{
        id: string;
        slug: string;
        title: string;
        subject_id: string;
        university_id: string;
        programme_id: string;
      }>("SELECT id, slug, title, subject_id, university_id, programme_id FROM resources WHERE id = ?", [
        job.published_resource_id,
      ]);
      const subject = resource
        ? one<{ university_id: string; programme_id: string }>(
            "SELECT university_id, programme_id FROM subjects WHERE id = ?",
            [resource.subject_id],
          )
        : undefined;

      const alreadyCorrected =
        resource?.slug === "aktu-btech-cse-stream-first-year-scheme-syllabus-2026-27";
      if (alreadyCorrected) {
        console.log("The published resource already carries the corrected slug; no further edit needed.");
      } else if (resource && subject) {
        const canonicalSlug = "aktu-btech-cse-stream-first-year-common";
        let canonical = one<{ id: string }>("SELECT id FROM subjects WHERE slug = ?", [canonicalSlug]);
        if (!canonical) {
          const id = randomUUID();
          console.log(`${DRY ? "[dry] " : ""}create canonical subject "${canonicalSlug}"`);
          if (!DRY) {
            run(
              `INSERT INTO subjects (id, slug, name, code, university_id, programme_id, branch_id, semester, credits,
                 description, is_sample, status)
               VALUES (?, ?, ?, NULL, ?, ?, NULL, 1, NULL, ?, 0, 'published')`,
              [
                id,
                canonicalSlug,
                "First Year CSE Stream (Common)",
                subject.university_id,
                subject.programme_id,
                "AKTU B.Tech first-year CSE-stream subjects are common to all CSE-stream branches. Units belong to individual subjects, not to this grouping.",
              ],
            );
          }
          canonical = { id };
        }

        // A stream grouping is still part of a real curriculum. Without this
        // row, documents filed against it could never carry a syllabus version.
        const schemeLabel = "AKTU B.Tech CSE Stream 2026-27";
        let curriculum = one<{ id: string }>(
          `SELECT id FROM curricula WHERE university_id = ? AND programme_id = ?
             AND IFNULL(branch_id,'') = '' AND scheme_label = ? LIMIT 1`,
          [subject.university_id, subject.programme_id, schemeLabel],
        );
        if (!curriculum) {
          const id = randomUUID();
          console.log(`${DRY ? "[dry] " : ""}create curriculum "${schemeLabel}"`);
          if (!DRY) {
            run(
              `INSERT INTO curricula (id, university_id, programme_id, branch_id, scheme_label, scheme_year,
                 effective_from, status)
               VALUES (?, ?, ?, NULL, ?, 2026, '2026-27', 'active')`,
              [id, subject.university_id, subject.programme_id, schemeLabel],
            );
          }
          curriculum = { id };
        }
        const linked = one<{ id: string }>(
          "SELECT id FROM curriculum_subjects WHERE curriculum_id = ? AND subject_id = ? AND semester = 1",
          [curriculum.id, canonical.id],
        );
        if (!linked) {
          console.log(`${DRY ? "[dry] " : ""}link the grouping subject into the first-year curriculum`);
          if (!DRY) {
            run(
              `INSERT INTO curriculum_subjects (id, curriculum_id, subject_id, semester, sequence, is_elective)
               VALUES (?, ?, ?, 1, 0, 0)`,
              [randomUUID(), curriculum.id, canonical.id],
            );
          }
        }

        // Prefer the document's own year statement for the semester the
        // resource is filed under; fall back to the lowest covered semester.
        const semesters = result.coversSemesters.length ? result.coversSemesters : [1];
        const targetSlug = "aktu-btech-cse-stream-first-year-scheme-syllabus-2026-27";
        const title = "AKTU B.Tech CSE Stream — First Year Scheme & Syllabus (2026-27)";
        const description =
          `Official AKTU document: Evaluation Scheme & Syllabus, B.Tech. First Year, CSE Stream, w.e.f. 2026-27. ` +
          `Covers ${result.subjectCodes.length} printed course codes across semesters ${semesters.join(" and ")} and all CSE-stream branches. ` +
          `It is a course structure, not an individual subject syllabus. Source: ${bigAsset.source_url}`;

        console.log(
          `${DRY ? "[dry] " : ""}re-map resource ${resource.slug} → ${targetSlug} (subject → First Year CSE Stream, semester ${semesters[0]}, branch null)`,
        );

        if (!DRY) {
          transaction((db) => {
            db.prepare(
              `UPDATE resources SET slug = ?, title = ?, description = ?, subject_id = ?, branch_id = NULL,
                 semester = ?, session = '2026-27', updated_at = datetime('now')
               WHERE id = ?`,
            ).run(targetSlug, title, description, canonical.id, semesters[0], resource.id);

            // Preserve the old public URL as a redirect instead of breaking it.
            db.prepare(
              `INSERT INTO resource_slug_aliases (slug, resource_id, reason) VALUES (?, ?, ?)
               ON CONFLICT(slug) DO NOTHING`,
            ).run(
              resource.slug,
              resource.id,
              "Renamed because the document is a first-year CSE-stream course structure, not a BCS301 Data Structures syllabus.",
            );

            const served = db
              .prepare("SELECT id, original_name FROM resource_files WHERE resource_id = ? AND is_primary = 1")
              .all(resource.id) as { id: string; original_name: string }[];
            const realName = sourceBasename(bigAsset.source_url);
            for (const file of served) {
              if (realName) {
                db.prepare("UPDATE resource_files SET original_name = ? WHERE id = ?").run(realName, file.id);
              }
            }

            // The academic mapping was wrong: a stream document must not claim a
            // single subject. It stays in_review until an administrator maps it.
            db.prepare(
              `UPDATE syllabus_versions
                  SET subject_id = NULL, version_label = ?, status = 'in_review',
                      notes = ?
                WHERE source_asset_id = ?`,
            ).run(
              "AKTU B.Tech CSE Stream — First Year Scheme & Syllabus 2026-27",
              "Corrected by the AKTU data-quality audit: the source PDF is a first-year, stream-wide course structure (43 course codes), not the BCS301 Data Structures syllabus. Units must be entered per subject after mapping.",
              bigAsset.id,
            );

            audit("resources", resource.id, "correct_metadata", {
              reason: "document-type mismatch",
              evidence: {
                detectedType: result.documentType,
                label: DOCUMENT_TYPE_LABELS[result.documentType],
                pageCount: bigAsset.page_count,
                subjectCodes: result.subjectCodes.length,
                semesters: result.coversSemesters,
              },
              before: { slug: resource.slug, title: resource.title, subjectId: resource.subject_id },
              after: { slug: targetSlug, title, subjectId: canonical.id, semester: semesters[0] },
              preserved: ["original asset", "optimized derivative", "document versions", "old slug alias"],
            });
          });
        }
      }
    }
  }

  /* 3. Queue warnings for pending stream-level documents at approval. */
  const pending = all<{ id: string; asset_id: string }>(
    `SELECT id, asset_id FROM ingestion_jobs WHERE state = 'awaiting_approval' AND asset_id IS NOT NULL`,
  );
  for (const job of pending) {
    const result = evidence.get(job.asset_id);
    if (!result) continue;
    if (result.documentType === "subject_syllabus") continue;
    const already = one<{ id: string }>(
      "SELECT id FROM ingestion_job_events WHERE job_id = ? AND message LIKE 'Data-quality audit:%' LIMIT 1",
      [job.id],
    );
    if (already) continue;
    const message =
      `Data-quality audit: this PDF is a ${DOCUMENT_TYPE_LABELS[result.documentType].toLowerCase()} ` +
      `covering semester(s) ${result.coversSemesters.join(", ") || "unknown"} with ${result.subjectCodes.length} printed course code(s). ` +
      `Do not approve it as an individual subject syllabus; confirm the subject mapping or file it as a course structure.`;
    console.log(`${DRY ? "[dry] " : ""}warn job ${job.id.slice(0, 8)}: ${message}`);
    if (!DRY) {
      run(
        `INSERT INTO ingestion_job_events (id, job_id, stage, state, level, message, detail)
         VALUES (?, ?, 'awaiting_approval', 'awaiting_approval', 'warn', ?, ?)`,
        [randomUUID(), job.id, message, JSON.stringify({ documentType: result.documentType, semesters: result.coversSemesters }).slice(0, 2000)],
      );
    }
  }

  console.log(DRY ? "Dry run complete; no rows changed." : "Corrections applied. Re-run the audit to confirm.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
