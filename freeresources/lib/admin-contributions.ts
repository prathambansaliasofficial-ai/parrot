import { one, run, transaction } from "./db";
import { recordAudit, slugify, uniqueSlug } from "./admin";
import { deleteStoredFile, duplicateStoredFile } from "./storage";

type ContributionRecord = {
  id: string;
  title: string;
  university_id: string;
  college_id: string | null;
  programme_id: string;
  branch_id: string | null;
  semester: number;
  subject_name: string;
  subject_code: string | null;
  category_id: string;
  session: string | null;
  description: string | null;
  contributor_name: string;
  file_path: string;
  file_name: string;
  file_size: number;
  status: string;
  resource_id: string | null;
};

export type ReviewResult =
  | { ok: true; status: "approved" | "rejected"; resourceSlug?: string; resourceId?: string }
  | { ok: false; status: number; message: string };

export async function reviewContribution(
  id: string,
  action: "approve" | "reject",
  notes: string,
  adminId: string,
): Promise<ReviewResult> {
  const contribution = one<ContributionRecord>(`SELECT * FROM contributions WHERE id = ?`, [id]);
  if (!contribution) return { ok: false, status: 404, message: "Contribution not found." };
  if (contribution.status !== "pending") {
    return { ok: false, status: 409, message: `This contribution is already ${contribution.status}.` };
  }

  if (action === "reject") {
    if (notes.trim().length < 3) {
      return { ok: false, status: 422, message: "Add a short note explaining the rejection." };
    }
    run(
      `UPDATE contributions SET status='rejected', review_notes=?, reviewed_at=datetime('now') WHERE id=?`,
      [notes.trim(), id],
    );
    recordAudit(adminId, "reject", "contributions", id, notes.trim());
    return { ok: true, status: "rejected" };
  }

  let copied;
  try {
    copied = await duplicateStoredFile(contribution.file_path, contribution.file_name);
  } catch {
    return {
      ok: false,
      status: 422,
      message: "The submitted file is missing from storage, so it cannot be published. Ask the contributor to re-upload.",
    };
  }

  try {
    const result = transaction(() => {
      // Reuse a matching subject when one exists; otherwise create it.
      let subject = contribution.subject_code
        ? one<{ id: string }>(
            `SELECT id FROM subjects WHERE university_id=? AND programme_id=? AND COALESCE(branch_id,'')=COALESCE(?,'')
               AND lower(code)=lower(?) AND semester=? LIMIT 1`,
            [
              contribution.university_id,
              contribution.programme_id,
              contribution.branch_id,
              contribution.subject_code,
              contribution.semester,
            ],
          )
        : undefined;

      subject ??= one<{ id: string }>(
        `SELECT id FROM subjects WHERE university_id=? AND programme_id=? AND COALESCE(branch_id,'')=COALESCE(?,'')
           AND lower(name)=lower(?) AND semester=? LIMIT 1`,
        [
          contribution.university_id,
          contribution.programme_id,
          contribution.branch_id,
          contribution.subject_name,
          contribution.semester,
        ],
      );

      let subjectId = subject?.id;
      if (!subjectId) {
        subjectId = crypto.randomUUID();
        run(
          `INSERT INTO subjects
             (id, slug, name, code, university_id, programme_id, branch_id, semester, status, is_sample)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', 0)`,
          [
            subjectId,
            uniqueSlug("subjects", contribution.subject_name),
            contribution.subject_name,
            contribution.subject_code,
            contribution.university_id,
            contribution.programme_id,
            contribution.branch_id,
            contribution.semester,
          ],
        );
      }

      const resourceId = crypto.randomUUID();
      const slug = uniqueSlug("resources", contribution.title);
      run(
        `INSERT INTO resources
           (id, slug, title, description, subject_id, category_id, university_id, college_id, programme_id, branch_id,
            semester, session, status, is_sample, contributor_name, uploaded_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 0, ?, ?, datetime('now'))`,
        [
          resourceId,
          slug,
          contribution.title,
          contribution.description,
          subjectId,
          contribution.category_id,
          contribution.university_id,
          contribution.college_id,
          contribution.programme_id,
          contribution.branch_id,
          contribution.semester,
          contribution.session,
          contribution.contributor_name,
          adminId,
        ],
      );

      run(
        `INSERT INTO resource_files
           (id, resource_id, storage_key, original_name, mime_type, size_bytes, label, is_primary)
         VALUES (?, ?, ?, ?, 'application/pdf', ?, 'Contributed file', 1)`,
        [crypto.randomUUID(), resourceId, copied.storageKey, copied.originalName, copied.sizeBytes],
      );

      run(
        `UPDATE contributions
            SET status='approved', review_notes=?, reviewed_at=datetime('now'), resource_id=?
          WHERE id=?`,
        [notes.trim() || null, resourceId, id],
      );

      return { resourceId, slug };
    });

    recordAudit(adminId, "approve", "contributions", id, result.slug);
    return { ok: true, status: "approved", resourceId: result.resourceId, resourceSlug: result.slug };
  } catch {
    await deleteStoredFile(copied.storageKey);
    return { ok: false, status: 500, message: "The contribution could not be published." };
  }
}

export function getContributionFile(id: string) {
  return one<{ file_path: string; file_name: string; file_size: number }>(
    `SELECT file_path, file_name, file_size FROM contributions WHERE id = ?`,
    [id],
  );
}

export function contributionReviewSummary() {
  return {
    pending: one<{ n: number }>(`SELECT COUNT(*) AS n FROM contributions WHERE status='pending'`)?.n ?? 0,
    approved: one<{ n: number }>(`SELECT COUNT(*) AS n FROM contributions WHERE status='approved'`)?.n ?? 0,
    rejected: one<{ n: number }>(`SELECT COUNT(*) AS n FROM contributions WHERE status='rejected'`)?.n ?? 0,
  };
}

/** Exposed for tests/UI so an unusable title is caught before insertion. */
export function contributionSlugBase(title: string): string {
  return slugify(title) || "contribution";
}
