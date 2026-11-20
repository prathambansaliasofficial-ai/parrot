import { one } from "./db";

export type PublishedFile = {
  fileId: string;
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  resourceId: string;
  resourceSlug: string;
  resourceTitle: string;
  universityShort: string;
  subjectCode: string | null;
  semester: number;
};

/** Resolves a file only when its resource is published, so drafts never leak. */
export function getPublishedFile(fileId: string): PublishedFile | undefined {
  return one<PublishedFile>(
    `SELECT f.id AS fileId, f.storage_key AS storageKey, f.original_name AS originalName,
            f.mime_type AS mimeType, f.size_bytes AS sizeBytes,
            r.id AS resourceId, r.slug AS resourceSlug, r.title AS resourceTitle,
            u.short_name AS universityShort, s.code AS subjectCode, r.semester
       FROM resource_files f
       JOIN resources r ON r.id = f.resource_id
       JOIN universities u ON u.id = r.university_id
       JOIN subjects s ON s.id = r.subject_id
      WHERE f.id = ? AND r.status = 'published'`,
    [fileId],
  );
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "resource.pdf";
}

/** Parses a `bytes=start-end` header against a known file size. */
export function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}
