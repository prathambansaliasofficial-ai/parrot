import { randomUUID } from "node:crypto";

import { all, one, run, transaction } from "./db";
import { slugify, uniqueSlug } from "./admin";
import { deleteStoredFile, savePdfUpload, UploadError, type StoredFile } from "./storage";

export type ResourceSaveResult =
  | { ok: true; id: string; slug: string }
  | { ok: false; status: number; message: string; fields?: Record<string, string> };

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function pdfFiles(form: FormData, key: string): File[] {
  return form.getAll(key).filter((value): value is File => value instanceof File && value.size > 0);
}

async function storeFiles(files: File[]): Promise<StoredFile[]> {
  const stored: StoredFile[] = [];
  try {
    for (const file of files) stored.push(await savePdfUpload(file));
    return stored;
  } catch (error) {
    await Promise.all(stored.map((item) => deleteStoredFile(item.storageKey)));
    throw error;
  }
}

function insertFile(resourceId: string, file: StoredFile, isPrimary: number, label: string | null) {
  run(
    `INSERT INTO resource_files (id, resource_id, storage_key, original_name, mime_type, size_bytes, label, is_primary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [randomUUID(), resourceId, file.storageKey, file.originalName, file.mimeType, file.sizeBytes, label, isPrimary],
  );
}

export async function saveResourceFromForm(
  form: FormData,
  options: { id?: string; userId: string },
): Promise<ResourceSaveResult> {
  const fields: Record<string, string> = {};
  const title = text(form, "title");
  const subjectId = text(form, "subject_id");
  const categoryId = text(form, "category_id");
  const description = text(form, "description");
  const session = text(form, "session");
  const contributor = text(form, "contributor_name");
  const status = text(form, "status") || "draft";
  const featured = form.get("featured") === "on" ? 1 : 0;
  const isSample = form.get("is_sample") === "on" ? 1 : 0;

  if (title.length < 4) fields.title = "Give the resource a clear title (at least 4 characters).";
  if (title.length > 200) fields.title = "Keep the title under 200 characters.";
  if (description.length > 3000) fields.description = "Keep the description under 3,000 characters.";
  if (session.length > 20) fields.session = "Session looks too long.";
  if (status !== "draft" && status !== "published") fields.status = "Choose draft or published.";

  const subject = one<{
    id: string;
    university_id: string;
    programme_id: string;
    branch_id: string | null;
    semester: number;
  }>(`SELECT id, university_id, programme_id, branch_id, semester FROM subjects WHERE id = ?`, [subjectId]);
  if (!subject) fields.subject_id = "Choose a valid subject.";

  const category = one<{ id: string }>(`SELECT id FROM categories WHERE id = ?`, [categoryId]);
  if (!category) fields.category_id = "Choose a valid category.";

  const primaryFile = pdfFiles(form, "file")[0] ?? null;
  const extraFiles = pdfFiles(form, "extra_files");
  if (!options.id && !primaryFile) fields.file = "Attach the primary PDF.";
  if (extraFiles.length > 5) fields.extra_files = "Add at most 5 extra files at once.";

  if (Object.keys(fields).length > 0) {
    return { ok: false, status: 422, message: "Please check the highlighted fields.", fields };
  }

  let stored: StoredFile[] = [];
  try {
    stored = await storeFiles([...(primaryFile ? [primaryFile] : []), ...extraFiles]);
  } catch (error) {
    return {
      ok: false,
      status: 422,
      message: error instanceof UploadError ? error.message : "The file could not be stored.",
      fields: { file: error instanceof Error ? error.message : "Upload failed." },
    };
  }

  const primaryStored = primaryFile ? stored[0] : null;
  const extraStored = primaryFile ? stored.slice(1) : stored;
  const primaryOldKeys: string[] = [];

  try {
    if (options.id) {
      const existing = one<{ id: string; slug: string; status: string }>(
        `SELECT id, slug, status FROM resources WHERE id = ?`,
        [options.id],
      );
      if (!existing) {
        await Promise.all(stored.map((file) => deleteStoredFile(file.storageKey)));
        return { ok: false, status: 404, message: "Resource not found." };
      }

      transaction(() => {
        run(
          `UPDATE resources SET title=?, description=?, subject_id=?, category_id=?, university_id=?, programme_id=?,
                  branch_id=?, semester=?, session=?, status=?, featured=?, is_sample=?, contributor_name=?,
                  published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, datetime('now')) ELSE published_at END,
                  updated_at = datetime('now')
             WHERE id=?`,
          [
            title,
            description || null,
            subject!.id,
            category!.id,
            subject!.university_id,
            subject!.programme_id,
            subject!.branch_id,
            subject!.semester,
            session || null,
            status,
            featured,
            isSample,
            contributor || null,
            status,
            options.id,
          ],
        );

        if (primaryStored) {
          const previous = all<{ id: string; storage_key: string }>(
            `SELECT id, storage_key FROM resource_files WHERE resource_id = ? AND is_primary = 1`,
            [options.id],
          );
          primaryOldKeys.push(...previous.map((file) => file.storage_key));
          run(`UPDATE resource_files SET is_primary = 0 WHERE resource_id = ?`, [options.id]);
          for (const old of previous) run(`DELETE FROM resource_files WHERE id = ?`, [old.id]);
          insertFile(options.id!, primaryStored, 1, "Primary file");
        }

        for (const file of extraStored) insertFile(options.id!, file, 0, "Additional version");
      });

      await Promise.all(primaryOldKeys.map((key) => deleteStoredFile(key)));
      return { ok: true, id: options.id, slug: existing.slug };
    }

    const id = randomUUID();
    const slug = uniqueSlug("resources", title || "resource");
    if (!slugify(title)) {
      await Promise.all(stored.map((file) => deleteStoredFile(file.storageKey)));
      return { ok: false, status: 422, message: "Title must contain letters or numbers." };
    }

    transaction(() => {
      run(
        `INSERT INTO resources
           (id, slug, title, description, subject_id, category_id, university_id, programme_id, branch_id,
            semester, session, status, is_sample, featured, contributor_name, uploaded_by, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          slug,
          title,
          description || null,
          subjectId,
          categoryId,
          subject!.university_id,
          subject!.programme_id,
          subject!.branch_id,
          subject!.semester,
          session || null,
          status,
          isSample,
          featured,
          contributor || null,
          options.userId,
          status === "published" ? new Date().toISOString() : null,
        ],
      );
      insertFile(id, primaryStored!, 1, "Primary file");
      for (const file of extraStored) insertFile(id, file, 0, "Additional version");
    });

    return { ok: true, id, slug };
  } catch (error) {
    await Promise.all(stored.map((file) => deleteStoredFile(file.storageKey)));
    const message = error instanceof Error ? error.message : "";
    if (/UNIQUE constraint failed: resources\.slug/i.test(message)) {
      return { ok: false, status: 422, message: "A resource with that title already exists. Rename it slightly." };
    }
    return { ok: false, status: 500, message: "The resource could not be saved." };
  }
}

export async function deleteResource(id: string): Promise<ResourceSaveResult> {
  const resource = one<{ id: string; slug: string }>(`SELECT id, slug FROM resources WHERE id = ?`, [id]);
  if (!resource) return { ok: false, status: 404, message: "Resource not found." };
  const files = all<{ storage_key: string }>(`SELECT storage_key FROM resource_files WHERE resource_id = ?`, [id]);

  try {
    run(`DELETE FROM resources WHERE id = ?`, [id]);
  } catch {
    return { ok: false, status: 500, message: "The resource could not be deleted." };
  }

  await Promise.all(files.map((file) => deleteStoredFile(file.storage_key)));
  return { ok: true, id, slug: resource.slug };
}

export async function deleteResourceFile(
  resourceId: string,
  fileId: string,
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const file = one<{ id: string; storage_key: string; is_primary: number }>(
    `SELECT id, storage_key, is_primary FROM resource_files WHERE id = ? AND resource_id = ?`,
    [fileId, resourceId],
  );
  if (!file) return { ok: false, status: 404, message: "File not found." };

  run(`DELETE FROM resource_files WHERE id = ?`, [fileId]);
  if (file.is_primary === 1) {
    const next = one<{ id: string }>(
      `SELECT id FROM resource_files WHERE resource_id = ? ORDER BY created_at LIMIT 1`,
      [resourceId],
    );
    if (next) run(`UPDATE resource_files SET is_primary = 1 WHERE id = ?`, [next.id]);
  }
  await deleteStoredFile(file.storage_key);
  return { ok: true };
}

