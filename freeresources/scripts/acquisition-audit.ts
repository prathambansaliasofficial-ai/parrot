/**
 * AKTU academic data-quality audit.
 *
 * Reads every stored asset from the *actual* PDF, classifies it from content,
 * compares that evidence with the published resource/subject/semester records,
 * and writes a report. It never edits anything.
 *
 *   npx tsx scripts/acquisition-audit.ts
 *   npx tsx scripts/acquisition-audit.ts --json   # machine-readable only
 */
import fs from "node:fs";
import path from "node:path";

import { loadEnv } from "../lib/acquisition/env";
loadEnv();

import { all } from "../lib/db";
import { classifyDocument, DOCUMENT_TYPE_LABELS } from "../lib/acquisition/doctype";
import { extractText } from "../lib/acquisition/pdf";
import { storage } from "../lib/acquisition/storage";

type AssetRow = {
  id: string;
  sha256: string;
  original_filename: string;
  size_bytes: number;
  page_count: number | null;
  storage_key: string;
  source_url: string | null;
  source_domain: string | null;
  document_type: string | null;
  covers_semesters: string | null;
  text_content: string | null;
};

type ResourceRow = {
  id: string;
  slug: string;
  title: string;
  semester: number;
  status: string;
  subject_name: string | null;
  subject_code: string | null;
  branch_slug: string | null;
};

const SAMPLE_PAGES = 14;

function sourceBasename(url: string | null): string | null {
  if (!url) return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return name || null;
  } catch {
    return null;
  }
}

async function textFor(asset: AssetRow): Promise<{ text: string; from: string }> {
  if (asset.text_content && asset.text_content.length > 200) {
    return { text: asset.text_content.slice(0, 200_000), from: "stored" };
  }
  try {
    const bytes = await storage().get(asset.storage_key);
    return { text: await extractText(bytes, SAMPLE_PAGES), from: "pdf" };
  } catch (error) {
    return { text: "", from: `unreadable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

async function main(): Promise<void> {
  const jsonOnly = process.argv.includes("--json");
  const assets = all<AssetRow>(
    `SELECT id, sha256, original_filename, size_bytes, page_count, storage_key, source_url,
            source_domain, document_type, covers_semesters, text_content
       FROM document_assets ORDER BY created_at ASC`,
  );

  const findings: Record<string, unknown>[] = [];
  const lines: string[] = [];

  for (const asset of assets) {
    const { text, from } = await textFor(asset);
    const result = classifyDocument(text, asset.page_count);
    const linked = all<ResourceRow>(
      `SELECT r.id, r.slug, r.title, r.semester, r.status,
              s.name AS subject_name, s.code AS subject_code, b.slug AS branch_slug
         FROM resources r
         LEFT JOIN subjects s ON s.id = r.subject_id
         LEFT JOIN branches b ON b.id = r.branch_id
        WHERE r.id IN (SELECT published_resource_id FROM ingestion_jobs WHERE asset_id = ?)`,
      [asset.id],
    );
    const versions = all<{ id: string; status: string; subject_name: string | null; version_label: string }>(
      `SELECT sv.id, sv.status, s.name AS subject_name, sv.version_label
         FROM syllabus_versions sv LEFT JOIN subjects s ON s.id = sv.subject_id
        WHERE sv.source_asset_id = ?`,
      [asset.id],
    );

    const mismatches: string[] = [];
    const realName = sourceBasename(asset.source_url);
    if (realName && asset.original_filename !== realName) {
      mismatches.push(`asset filename "${asset.original_filename}" does not match source "${realName}"`);
    }
    for (const resource of linked) {
      const type = result.documentType;
      const isMultiSubject = type === "course_structure" || type === "complete_curriculum" || type === "branch_syllabus";
      // A course structure may legitimately be filed under a grouping row such
      // as "First Year CSE Stream (Common)": that row carries no subject code.
      // Only a real coded subject contradicts a multi-subject document.
      if (isMultiSubject && resource.subject_name && resource.subject_code) {
        mismatches.push(
          `published as a single subject ("${resource.subject_name}"${resource.subject_code ? ` ${resource.subject_code}` : ""}) but the document covers ${result.subjectCodes.length} subjects`,
        );
      }
      if (result.coversSemesters.length > 0 && !result.coversSemesters.includes(resource.semester)) {
        mismatches.push(
          `published under semester ${resource.semester} but the document covers semester(s) ${result.coversSemesters.join(", ")}`,
        );
      }
    }
    for (const version of versions) {
      if (version.subject_name && (result.documentType === "course_structure" || result.documentType === "complete_curriculum")) {
        mismatches.push(`syllabus version is attached to subject "${version.subject_name}" for a stream-level document`);
      }
    }

    const record = {
      assetId: asset.id,
      sha256: asset.sha256,
      storedFilename: asset.original_filename,
      sourceFilename: realName,
      sourceUrl: asset.source_url,
      sizeBytes: asset.size_bytes,
      pageCount: asset.page_count,
      textSource: from,
      detectedType: result.documentType,
      detectedTypeLabel: DOCUMENT_TYPE_LABELS[result.documentType],
      confidence: result.confidence,
      coversSemesters: result.coversSemesters,
      subjectCodeCount: result.subjectCodes.length,
      subjectCodes: result.subjectCodes.slice(0, 40),
      unitCount: result.unitCount,
      evidence: result.evidence,
      storedDocumentType: asset.document_type,
      linkedResources: linked,
      syllabusVersions: versions,
      mismatches,
    };
    findings.push(record);

    lines.push(
      [
        `### ${realName ?? asset.original_filename}`,
        "",
        `- Asset: \`${asset.id}\``,
        `- SHA-256: \`${asset.sha256}\``,
        `- Pages: ${asset.page_count ?? "unknown"} · ${(asset.size_bytes / 1024).toFixed(1)} KB`,
        `- Source: ${asset.source_url ?? "not recorded"}`,
        `- Detected: **${DOCUMENT_TYPE_LABELS[result.documentType]}** (${Math.round(result.confidence * 100)}% confidence)`,
        `- Semesters covered: ${result.coversSemesters.join(", ") || "unknown"}`,
        `- Subject codes: ${result.subjectCodes.length}${result.subjectCodes.length ? ` (${result.subjectCodes.slice(0, 12).join(", ")}${result.subjectCodes.length > 12 ? ", …" : ""})` : ""}`,
        `- Unit headings: ${result.unitCount}`,
        `- Evidence: ${result.evidence.join(" ") || "none"}`,
        linked.length
          ? `- Published as: ${linked.map((r) => `"${r.title}" (\`/resource/${r.slug}\`, semester ${r.semester}, subject ${r.subject_name ?? "—"})`).join("; ")}`
          : "- Published as: not published",
        mismatches.length ? `- **Mismatches:** ${mismatches.map((m) => `\n  - ${m}`).join("")}` : "- Mismatches: none",
        "",
      ].join("\n"),
    );
  }

  const withMismatch = findings.filter((f) => (f.mismatches as string[]).length > 0);
  const report = {
    generatedAt: new Date().toISOString(),
    assetCount: findings.length,
    mismatchCount: withMismatch.length,
    findings,
  };

  const docsDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(path.join(docsDir, "aktu-audit.json"), JSON.stringify(report, null, 2));

  const markdown = [
    "# AKTU academic data-quality audit",
    "",
    `Generated ${report.generatedAt} from ${findings.length} stored asset(s). Classification is derived from the PDF text only — never from the discovery query or filename.`,
    "",
    `**${withMismatch.length} of ${findings.length} asset(s) have a metadata mismatch.**`,
    "",
    lines.join("\n"),
  ].join("\n");
  fs.writeFileSync(path.join(docsDir, "AKTU-AUDIT.md"), markdown);

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(`Audited ${findings.length} asset(s); ${withMismatch.length} with mismatches.`);
  for (const finding of findings) {
    const mismatches = finding.mismatches as string[];
    console.log(
      `- ${finding.sourceFilename ?? finding.storedFilename} · ${finding.detectedTypeLabel} · sem ${(finding.coversSemesters as number[]).join(",") || "?"} · ${mismatches.length} mismatch(es)`,
    );
    for (const mismatch of mismatches) console.log(`    ! ${mismatch}`);
  }
  console.log("Wrote docs/AKTU-AUDIT.md and docs/aktu-audit.json.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
