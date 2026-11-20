import { all, one, run } from "./db";
import { academicYearLabel } from "./format";

/* ------------------------------------------------------------------ types */

export type ResourceListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  semester: number;
  session: string | null;
  isSample: boolean;
  featured: boolean;
  viewCount: number;
  downloadCount: number;
  publishedAt: string | null;
  createdAt: string;
  contributorName: string | null;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  subjectSlug: string;
  universityId: string;
  universityName: string;
  universityShort: string;
  universitySlug: string;
  programmeId: string;
  programmeName: string;
  programmeShort: string;
  programmeSlug: string;
  branchId: string | null;
  branchName: string | null;
  branchSlug: string | null;
  collegeId: string | null;
  collegeName: string | null;
  collegeSlug: string | null;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  categoryGroup: string;
  fileId: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
};

export type ResourceFilters = {
  q?: string;
  university?: string;
  college?: string;
  programme?: string;
  branch?: string;
  semester?: string;
  subject?: string;
  category?: string;
  group?: string;
  session?: string;
  format?: string;
  status?: "published" | "draft" | "all";
  featured?: boolean;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type UniversityCard = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  state: string;
  city: string | null;
  type: string;
  description: string | null;
  website: string | null;
  logoUrl: string | null;
  featured: number;
  subjectCount: number;
  resourceCount: number;
  programmeCount: number;
};

/* ------------------------------------------------------------- sql helpers */

const RESOURCE_SELECT = `
  SELECT r.id, r.slug, r.title, r.description, r.semester, r.session, r.status,
         r.is_sample AS isSample, r.featured, r.view_count AS viewCount,
         r.download_count AS downloadCount, r.published_at AS publishedAt,
         r.created_at AS createdAt, r.updated_at AS updatedAt,
         r.contributor_name AS contributorName,
         s.id AS subjectId, s.name AS subjectName, s.code AS subjectCode, s.slug AS subjectSlug,
         u.id AS universityId, u.name AS universityName, u.short_name AS universityShort,
         u.slug AS universitySlug,
         p.id AS programmeId, p.name AS programmeName, p.short_name AS programmeShort,
         p.slug AS programmeSlug,
         b.id AS branchId, b.name AS branchName, b.slug AS branchSlug,
         col.id AS collegeId, col.name AS collegeName, col.slug AS collegeSlug,
         c.id AS categoryId, c.name AS categoryName, c.slug AS categorySlug,
         c.group_slug AS categoryGroup,
         f.id AS fileId, f.original_name AS fileName, f.mime_type AS fileType,
         f.size_bytes AS fileSize
    FROM resources r
    JOIN subjects s ON s.id = r.subject_id
    JOIN universities u ON u.id = r.university_id
    JOIN programmes p ON p.id = r.programme_id
    LEFT JOIN branches b ON b.id = r.branch_id
    LEFT JOIN colleges col ON col.id = r.college_id
    JOIN categories c ON c.id = r.category_id
    LEFT JOIN resource_files f ON f.resource_id = r.id AND f.is_primary = 1`;

function mapResource(row: Record<string, unknown>): ResourceListItem {
  return {
    ...(row as unknown as ResourceListItem),
    isSample: Boolean(row.isSample),
    featured: Boolean(row.featured),
    viewCount: Number(row.viewCount ?? 0),
    downloadCount: Number(row.downloadCount ?? 0),
    semester: Number(row.semester ?? 0),
    fileSize: row.fileSize === null || row.fileSize === undefined ? null : Number(row.fileSize),
  };
}

function likeTerm(term: string): string {
  return `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

function buildWhere(filters: ResourceFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const status = filters.status ?? "published";

  if (status !== "all") {
    clauses.push("r.status = ?");
    params.push(status);
  }
  if (filters.featured) clauses.push("r.featured = 1");
  if (filters.university) {
    clauses.push("u.slug = ?");
    params.push(filters.university);
  }
  if (filters.college) {
    clauses.push("col.slug = ?");
    params.push(filters.college);
  }
  if (filters.programme) {
    clauses.push("p.slug = ?");
    params.push(filters.programme);
  }
  if (filters.branch) {
    clauses.push("b.slug = ?");
    params.push(filters.branch);
  }
  if (filters.semester) {
    clauses.push("r.semester = ?");
    params.push(Number(filters.semester));
  }
  if (filters.subject) {
    clauses.push("s.slug = ?");
    params.push(filters.subject);
  }
  if (filters.category) {
    clauses.push("c.slug = ?");
    params.push(filters.category);
  }
  if (filters.group && filters.group !== "all") {
    clauses.push("c.group_slug = ?");
    params.push(filters.group);
  }
  if (filters.session) {
    clauses.push("r.session = ?");
    params.push(filters.session);
  }
  if (filters.format === "pdf") {
    clauses.push("(f.original_name LIKE '%.pdf' OR f.mime_type = 'application/pdf')");
  }

  const terms = (filters.q ?? "")
    .replace(/[^\p{L}\p{N}\s.\-]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 8);

  for (const term of terms) {
    const like = likeTerm(term);
    clauses.push(`(
      r.title LIKE ? OR IFNULL(r.description,'') LIKE ? OR s.name LIKE ? OR IFNULL(s.code,'') LIKE ?
      OR u.name LIKE ? OR u.short_name LIKE ? OR IFNULL(u.aliases,'') LIKE ?
      OR p.name LIKE ? OR p.short_name LIKE ? OR IFNULL(b.name,'') LIKE ?
      OR c.name LIKE ? OR IFNULL(r.session,'') LIKE ?
    )`);
    params.push(like, like, like, like, like, like, like, like, like, like, like, like);
  }

  return { clause: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function orderBy(sort?: string): string {
  switch (sort) {
    case "downloads":
      return "ORDER BY r.download_count DESC, COALESCE(r.published_at, r.created_at) DESC";
    case "title":
      return "ORDER BY r.title COLLATE NOCASE ASC";
    case "views":
      return "ORDER BY r.view_count DESC, COALESCE(r.published_at, r.created_at) DESC";
    default:
      return "ORDER BY COALESCE(r.published_at, r.created_at) DESC";
  }
}

/* --------------------------------------------------------------- resources */

export function listResources(filters: ResourceFilters): {
  items: ResourceListItem[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
} {
  const pageSize = Math.min(Math.max(filters.pageSize ?? 12, 1), 48);
  const page = Math.max(filters.page ?? 1, 1);
  const { clause, params } = buildWhere(filters);

  const totalRow = one<{ count: number }>(
    `SELECT COUNT(*) AS count FROM resources r
       JOIN subjects s ON s.id = r.subject_id
       JOIN universities u ON u.id = r.university_id
       JOIN programmes p ON p.id = r.programme_id
       LEFT JOIN branches b ON b.id = r.branch_id
       LEFT JOIN colleges col ON col.id = r.college_id
       JOIN categories c ON c.id = r.category_id
       LEFT JOIN resource_files f ON f.resource_id = r.id AND f.is_primary = 1
       ${clause}`,
    params,
  );
  const total = Number(totalRow?.count ?? 0);

  const rows = all(
    `${RESOURCE_SELECT} ${clause} ${orderBy(filters.sort)} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize],
  );

  return {
    items: rows.map(mapResource),
    total,
    page,
    pageSize,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function resourceFacets(filters: ResourceFilters) {
  const { clause, params } = buildWhere(filters);
  const from = `FROM resources r
      JOIN subjects s ON s.id = r.subject_id
      JOIN universities u ON u.id = r.university_id
      JOIN programmes p ON p.id = r.programme_id
      LEFT JOIN branches b ON b.id = r.branch_id
      LEFT JOIN colleges col ON col.id = r.college_id
      JOIN categories c ON c.id = r.category_id
      LEFT JOIN resource_files f ON f.resource_id = r.id AND f.is_primary = 1
      ${clause}`;

  return {
    byGroup: all<{ slug: string; count: number }>(
      `SELECT c.group_slug AS slug, COUNT(*) AS count ${from} GROUP BY c.group_slug`,
      params,
    ).map((r) => ({ ...r, count: Number(r.count) })),
    byCategory: all<{ slug: string; name: string; group: string; count: number }>(
      `SELECT c.slug, c.name, c.group_slug AS "group", COUNT(*) AS count ${from} GROUP BY c.id ORDER BY c.sort_order`,
      params,
    ).map((r) => ({ ...r, count: Number(r.count) })),
    byUniversity: all<{ slug: string; name: string; count: number }>(
      `SELECT u.slug, u.short_name AS name, COUNT(*) AS count ${from} GROUP BY u.id ORDER BY count DESC`,
      params,
    ).map((r) => ({ ...r, count: Number(r.count) })),
    bySemester: all<{ semester: number; count: number }>(
      `SELECT r.semester, COUNT(*) AS count ${from} GROUP BY r.semester ORDER BY r.semester`,
      params,
    ).map((r) => ({ ...r, count: Number(r.count) })),
    total: Number(one<{ count: number }>(`SELECT COUNT(*) AS count ${from}`, params)?.count ?? 0),
  };
}

/**
 * Resolves a previously published slug to its current one, so correcting a
 * misleading resource title never breaks an existing link.
 */
export function getResourceSlugAlias(slug: string): string | null {
  const row = one<{ slug: string }>(
    `SELECT r.slug FROM resource_slug_aliases a JOIN resources r ON r.id = a.resource_id
      WHERE a.slug = ? AND r.status = 'published'`,
    [slug],
  );
  return row?.slug ?? null;
}

export function getResourceBySlug(slug: string) {
  const row = one<Record<string, unknown>>(`${RESOURCE_SELECT} WHERE r.slug = ? AND r.status = 'published'`, [slug]);
  if (!row) return null;

  const files = all<{
    id: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    label: string | null;
    isPrimary: number;
  }>(
    `SELECT id, storage_key AS storageKey, original_name AS originalName, mime_type AS mimeType,
            size_bytes AS sizeBytes, label, is_primary AS isPrimary
       FROM resource_files WHERE resource_id = ? ORDER BY is_primary DESC, created_at ASC`,
    [row.id],
  );

  const related = all(
    `${RESOURCE_SELECT}
      WHERE r.status = 'published' AND s.id = ? AND r.id <> ?
      ORDER BY COALESCE(r.published_at, r.created_at) DESC LIMIT 4`,
    [row.subjectId, row.id],
  ).map(mapResource);

  return {
    resource: mapResource(row),
    files,
    related,
    academicYear: academicYearLabel(Number(row.semester)),
  };
}

export function recordResourceView(resourceId: string) {
  run(`UPDATE resources SET view_count = view_count + 1 WHERE id = ?`, [resourceId]);
}

export function getResourceFiles(resourceId: string) {
  return all<{ id: string; storageKey: string; originalName: string; mimeType: string; sizeBytes: number }>(
    `SELECT id, storage_key AS storageKey, original_name AS originalName, mime_type AS mimeType,
            size_bytes AS sizeBytes
       FROM resource_files WHERE resource_id = ? ORDER BY is_primary DESC`,
    [resourceId],
  );
}

/* -------------------------------------------------------------- universities */

export function listUniversities(filters: { q?: string; state?: string; type?: string } = {}) {
  const clauses = ["u.status = 'published'"];
  const params: unknown[] = [];
  if (filters.state) {
    clauses.push("u.state = ?");
    params.push(filters.state);
  }
  if (filters.type) {
    clauses.push("u.type = ?");
    params.push(filters.type);
  }
  if (filters.q) {
    clauses.push("(u.name LIKE ? OR u.short_name LIKE ? OR u.city LIKE ? OR IFNULL(u.aliases,'') LIKE ?)");
    const like = likeTerm(filters.q);
    params.push(like, like, like, like);
  }

  return all<UniversityCard>(
    `SELECT u.id, u.slug, u.name, u.short_name AS shortName, u.state, u.city, u.type,
            u.description, u.website, u.logo_url AS logoUrl, u.featured,
            (SELECT COUNT(*) FROM subjects s WHERE s.university_id = u.id AND s.status = 'published') AS subjectCount,
            (SELECT COUNT(*) FROM resources r WHERE r.university_id = u.id AND r.status = 'published') AS resourceCount,
            (SELECT COUNT(*) FROM (
               SELECT programme_id FROM branches WHERE university_id = u.id AND status = 'published'
               UNION
               SELECT programme_id FROM subjects WHERE university_id = u.id AND status = 'published'
             )) AS programmeCount
       FROM universities u
      WHERE ${clauses.join(" AND ")}
      ORDER BY u.featured DESC, u.name ASC`,
    params,
  ).map((u) => ({
    ...u,
    subjectCount: Number(u.subjectCount),
    resourceCount: Number(u.resourceCount),
    programmeCount: Number(u.programmeCount),
    featured: Number(u.featured),
  }));
}

export function getUniversityStates(): { state: string; count: number }[] {
  return all<{ state: string; count: number }>(
    `SELECT state, COUNT(*) AS count FROM universities WHERE status='published' GROUP BY state ORDER BY state`,
  );
}

export function getUniversity(slug: string) {
  const uni = one<{
    id: string;
    slug: string;
    name: string;
    shortName: string;
    state: string;
    city: string | null;
    type: string;
    description: string | null;
    website: string | null;
    logoUrl: string | null;
  }>(
    `SELECT id, slug, name, short_name AS shortName, state, city, type, description, website,
            logo_url AS logoUrl
       FROM universities WHERE slug = ? AND status = 'published'`,
    [slug],
  );
  if (!uni) return null;

  const programmes = all<{
    id: string;
    slug: string;
    name: string;
    shortName: string;
    level: string;
    branchCount: number;
    subjectCount: number;
    resourceCount: number;
  }>(
    `SELECT p.id, p.slug, p.name, p.short_name AS shortName, p.level,
            (SELECT COUNT(*) FROM branches b WHERE b.university_id = ? AND b.programme_id = p.id AND b.status='published') AS branchCount,
            (SELECT COUNT(*) FROM subjects s WHERE s.university_id = ? AND s.programme_id = p.id AND s.status='published') AS subjectCount,
            (SELECT COUNT(*) FROM resources r WHERE r.university_id = ? AND r.programme_id = p.id AND r.status='published') AS resourceCount
       FROM programmes p
      WHERE EXISTS (SELECT 1 FROM branches b WHERE b.university_id = ? AND b.programme_id = p.id AND b.status='published')
         OR EXISTS (SELECT 1 FROM subjects s WHERE s.university_id = ? AND s.programme_id = p.id AND s.status='published')
      ORDER BY p.name`,
    [uni.id, uni.id, uni.id, uni.id, uni.id],
  ).map((p) => ({
    ...p,
    branchCount: Number(p.branchCount),
    subjectCount: Number(p.subjectCount),
    resourceCount: Number(p.resourceCount),
  }));

  const branches = all<{
    id: string;
    slug: string;
    name: string;
    code: string | null;
    programmeName: string;
    programmeSlug: string;
    subjectCount: number;
    resourceCount: number;
  }>(
    `SELECT b.id, b.slug, b.name, b.code, p.name AS programmeName, p.slug AS programmeSlug,
            (SELECT COUNT(*) FROM subjects s WHERE s.branch_id = b.id AND s.status='published') AS subjectCount,
            (SELECT COUNT(*) FROM resources r WHERE r.branch_id = b.id AND r.status='published') AS resourceCount
       FROM branches b JOIN programmes p ON p.id = b.programme_id
      WHERE b.university_id = ? AND b.status = 'published'
      ORDER BY p.name, b.name`,
    [uni.id],
  ).map((b) => ({ ...b, subjectCount: Number(b.subjectCount), resourceCount: Number(b.resourceCount) }));

  const subjects = all<{
    id: string;
    slug: string;
    name: string;
    code: string | null;
    semester: number;
    programmeSlug: string;
    programmeShort: string;
    branchSlug: string | null;
    branchName: string | null;
    resourceCount: number;
    isSample: number;
  }>(
    `SELECT s.id, s.slug, s.name, s.code, s.semester, p.slug AS programmeSlug,
            p.short_name AS programmeShort, b.slug AS branchSlug, b.name AS branchName,
            (SELECT COUNT(*) FROM resources r WHERE r.subject_id = s.id AND r.status='published') AS resourceCount,
            s.is_sample AS isSample
       FROM subjects s JOIN programmes p ON p.id = s.programme_id
       LEFT JOIN branches b ON b.id = s.branch_id
      WHERE s.university_id = ? AND s.status = 'published'
      ORDER BY s.semester, s.name`,
    [uni.id],
  ).map((s) => ({ ...s, resourceCount: Number(s.resourceCount), isSample: Boolean(s.isSample) }));

  const coverage = all<{ group: string; count: number }>(
    `SELECT c.group_slug AS "group", COUNT(*) AS count
       FROM resources r JOIN categories c ON c.id = r.category_id
      WHERE r.university_id = ? AND r.status='published' GROUP BY c.group_slug`,
    [uni.id],
  ).map((c) => ({ ...c, count: Number(c.count) }));

  const colleges = all<{ id: string; slug: string; name: string; city: string | null; state: string | null }>(
    `SELECT id, slug, name, city, state FROM colleges
      WHERE university_id = ? AND status='published' ORDER BY name`,
    [uni.id],
  );

  const latest = listResources({ university: slug, pageSize: 6 }).items;
  const stats = one<{ subjects: number; resources: number; downloads: number; colleges: number }>(
    `SELECT
       (SELECT COUNT(*) FROM subjects WHERE university_id = ? AND status='published') AS subjects,
       (SELECT COUNT(*) FROM resources WHERE university_id = ? AND status='published') AS resources,
       (SELECT COALESCE(SUM(download_count),0) FROM resources WHERE university_id = ? AND status='published') AS downloads,
       (SELECT COUNT(*) FROM colleges WHERE university_id = ? AND status='published') AS colleges`,
    [uni.id, uni.id, uni.id, uni.id],
  );

  return {
    university: uni,
    programmes,
    branches,
    subjects,
    colleges,
    coverage,
    latest,
    stats: {
      subjects: Number(stats?.subjects ?? 0),
      resources: Number(stats?.resources ?? 0),
      downloads: Number(stats?.downloads ?? 0),
      colleges: Number(stats?.colleges ?? 0),
    },
  };
}

/* ---------------------------------------------------------------- programmes */

export function listProgrammes() {
  return all<{
    id: string;
    slug: string;
    name: string;
    shortName: string;
    level: string;
    description: string | null;
    universityCount: number;
    subjectCount: number;
    resourceCount: number;
  }>(
    `SELECT p.id, p.slug, p.name, p.short_name AS shortName, p.level, p.description,
            (SELECT COUNT(DISTINCT b.university_id) FROM branches b WHERE b.programme_id = p.id AND b.status='published') AS universityCount,
            (SELECT COUNT(*) FROM subjects s WHERE s.programme_id = p.id AND s.status='published') AS subjectCount,
            (SELECT COUNT(*) FROM resources r WHERE r.programme_id = p.id AND r.status='published') AS resourceCount
       FROM programmes p ORDER BY p.name`,
  ).map((p) => ({
    ...p,
    universityCount: Number(p.universityCount),
    subjectCount: Number(p.subjectCount),
    resourceCount: Number(p.resourceCount),
  }));
}

export function getProgramme(slug: string) {
  const programme = one<{
    id: string;
    slug: string;
    name: string;
    shortName: string;
    level: string;
    description: string | null;
  }>(
    `SELECT id, slug, name, short_name AS shortName, level, description FROM programmes WHERE slug = ?`,
    [slug],
  );
  if (!programme) return null;

  const universities = all<{
    id: string;
    slug: string;
    name: string;
    shortName: string;
    state: string;
    branchCount: number;
    subjectCount: number;
    resourceCount: number;
  }>(
    `SELECT u.id, u.slug, u.name, u.short_name AS shortName, u.state,
            (SELECT COUNT(*) FROM branches b WHERE b.university_id = u.id AND b.programme_id = ? AND b.status='published') AS branchCount,
            (SELECT COUNT(*) FROM subjects s WHERE s.university_id = u.id AND s.programme_id = ? AND s.status='published') AS subjectCount,
            (SELECT COUNT(*) FROM resources r WHERE r.university_id = u.id AND r.programme_id = ? AND r.status='published') AS resourceCount
       FROM universities u
      WHERE u.status='published' AND (
        EXISTS (SELECT 1 FROM branches b WHERE b.university_id = u.id AND b.programme_id = ?)
        OR EXISTS (SELECT 1 FROM subjects s WHERE s.university_id = u.id AND s.programme_id = ?)
      )
      ORDER BY u.featured DESC, u.name`,
    [programme.id, programme.id, programme.id, programme.id, programme.id],
  ).map((u) => ({
    ...u,
    branchCount: Number(u.branchCount),
    subjectCount: Number(u.subjectCount),
    resourceCount: Number(u.resourceCount),
  }));

  const branches = all<{ id: string; slug: string; name: string; code: string | null; universityShort: string }>(
    `SELECT b.id, b.slug, b.name, b.code, u.short_name AS universityShort
       FROM branches b JOIN universities u ON u.id = b.university_id
      WHERE b.programme_id = ? AND b.status='published' ORDER BY u.short_name, b.name`,
    [programme.id],
  );

  const subjects = all<{
    id: string;
    slug: string;
    name: string;
    code: string | null;
    semester: number;
    universityShort: string;
    resourceCount: number;
  }>(
    `SELECT s.id, s.slug, s.name, s.code, s.semester, u.short_name AS universityShort,
            (SELECT COUNT(*) FROM resources r WHERE r.subject_id = s.id AND r.status='published') AS resourceCount
       FROM subjects s JOIN universities u ON u.id = s.university_id
      WHERE s.programme_id = ? AND s.status='published'
      ORDER BY s.semester, s.name LIMIT 30`,
    [programme.id],
  ).map((s) => ({ ...s, resourceCount: Number(s.resourceCount) }));

  const latest = listResources({ programme: slug, pageSize: 6 }).items;

  return { programme, universities, branches, subjects, latest };
}

/* ------------------------------------------------------------------ subjects */

export function listSubjects(filters: { q?: string; university?: string; programme?: string; branch?: string; semester?: string } = {}) {
  const clauses = ["s.status = 'published'"];
  const params: unknown[] = [];
  if (filters.university) {
    clauses.push("u.slug = ?");
    params.push(filters.university);
  }
  if (filters.programme) {
    clauses.push("p.slug = ?");
    params.push(filters.programme);
  }
  if (filters.branch) {
    clauses.push("b.slug = ?");
    params.push(filters.branch);
  }
  if (filters.semester) {
    clauses.push("s.semester = ?");
    params.push(Number(filters.semester));
  }
  if (filters.q) {
    const like = likeTerm(filters.q);
    clauses.push("(s.name LIKE ? OR IFNULL(s.code,'') LIKE ? OR u.short_name LIKE ?)");
    params.push(like, like, like);
  }

  return all<{
    id: string;
    slug: string;
    name: string;
    code: string | null;
    semester: number;
    isSample: number;
    universityShort: string;
    universitySlug: string;
    programmeShort: string;
    branchName: string | null;
    resourceCount: number;
  }>(
    `SELECT s.id, s.slug, s.name, s.code, s.semester, s.is_sample AS isSample,
            u.short_name AS universityShort, u.slug AS universitySlug,
            p.short_name AS programmeShort, b.name AS branchName,
            (SELECT COUNT(*) FROM resources r WHERE r.subject_id = s.id AND r.status='published') AS resourceCount
       FROM subjects s
       JOIN universities u ON u.id = s.university_id
       JOIN programmes p ON p.id = s.programme_id
       LEFT JOIN branches b ON b.id = s.branch_id
      WHERE ${clauses.join(" AND ")}
      ORDER BY s.semester, s.name LIMIT 200`,
    params,
  ).map((s) => ({ ...s, resourceCount: Number(s.resourceCount), isSample: Boolean(s.isSample) }));
}

export function getSubject(slug: string) {
  const subject = one<{
    id: string;
    slug: string;
    name: string;
    code: string | null;
    semester: number;
    credits: string | null;
    description: string | null;
    syllabusText: string | null;
    isSample: number;
    universityId: string;
    universityName: string;
    universityShort: string;
    universitySlug: string;
    programmeName: string;
    programmeShort: string;
    programmeSlug: string;
    branchId: string | null;
    branchName: string | null;
    branchSlug: string | null;
  }>(
    `SELECT s.id, s.slug, s.name, s.code, s.semester, s.credits, s.description,
            s.syllabus_text AS syllabusText, s.is_sample AS isSample,
            u.id AS universityId, u.name AS universityName, u.short_name AS universityShort,
            u.slug AS universitySlug, p.name AS programmeName, p.short_name AS programmeShort,
            p.slug AS programmeSlug, b.id AS branchId, b.name AS branchName, b.slug AS branchSlug
       FROM subjects s
       JOIN universities u ON u.id = s.university_id
       JOIN programmes p ON p.id = s.programme_id
       LEFT JOIN branches b ON b.id = s.branch_id
      WHERE s.slug = ? AND s.status = 'published'`,
    [slug],
  );
  if (!subject) return null;

  const resources = listResources({ subject: slug, pageSize: 48 }).items;
  const categories = all<{ id: string; slug: string; name: string; group: string; count: number }>(
    `SELECT c.id, c.slug, c.name, c.group_slug AS "group", COUNT(r.id) AS count
       FROM categories c
       LEFT JOIN resources r ON r.category_id = c.id AND r.subject_id = ? AND r.status='published'
      GROUP BY c.id ORDER BY c.sort_order`,
    [subject.id],
  ).map((c) => ({ ...c, count: Number(c.count) }));

  const groups = all<{ slug: string; label: string; sortOrder: number }>(
    `SELECT group_slug AS slug, MIN(sort_order) AS sortOrder,
            CASE group_slug WHEN 'pyq' THEN 'Previous Year Papers' WHEN 'notes' THEN 'Notes'
                 WHEN 'syllabus' THEN 'Syllabus' WHEN 'practical' THEN 'Practical Files'
                 ELSE 'Other Resources' END AS label
       FROM categories GROUP BY group_slug ORDER BY sortOrder`,
  );

  return {
    subject: { ...subject, isSample: Boolean(subject.isSample) },
    resources,
    categories,
    groups,
    academicYear: academicYearLabel(subject.semester),
  };
}

/* ------------------------------------------------------------------- filter options */

export function getFilterOptions() {
  return {
    universities: all<{ id: string; slug: string; name: string; shortName: string }>(
      `SELECT id, slug, name, short_name AS shortName FROM universities WHERE status='published' ORDER BY name`,
    ),
    programmes: all<{ id: string; slug: string; name: string; shortName: string }>(
      `SELECT id, slug, name, short_name AS shortName FROM programmes ORDER BY name`,
    ),
    branches: all<{
      id: string;
      slug: string;
      name: string;
      code: string | null;
      universityId: string;
      programmeId: string;
    }>(
      `SELECT b.id, b.slug, b.name, b.code, b.university_id AS universityId, b.programme_id AS programmeId
         FROM branches b JOIN universities u ON u.id=b.university_id
        WHERE b.status='published' AND u.status='published' ORDER BY b.name`,
    ),
    categories: all<{ id: string; slug: string; name: string; group: string }>(
      `SELECT id, slug, name, group_slug AS "group" FROM categories ORDER BY sort_order`,
    ),
    colleges: all<{ id: string; slug: string; name: string; universitySlug: string }>(
      `SELECT c.id, c.slug, c.name, u.slug AS universitySlug
         FROM colleges c JOIN universities u ON u.id=c.university_id
        WHERE c.status='published' AND u.status='published' ORDER BY c.name`,
    ),
    subjects: all<{
      id: string;
      slug: string;
      name: string;
      code: string | null;
      semester: number;
      universitySlug: string;
      universityShort: string;
      programmeSlug: string;
      branchSlug: string | null;
    }>(
      `SELECT s.id, s.slug, s.name, s.code, s.semester, u.slug AS universitySlug,
              u.short_name AS universityShort, p.slug AS programmeSlug, b.slug AS branchSlug
         FROM subjects s JOIN universities u ON u.id=s.university_id
         JOIN programmes p ON p.id=s.programme_id
         LEFT JOIN branches b ON b.id=s.branch_id
        WHERE s.status='published' ORDER BY s.name LIMIT 500`,
    ),
    sessions: all<{ session: string }>(
      `SELECT DISTINCT session FROM resources WHERE session IS NOT NULL AND status='published' ORDER BY session DESC`,
    ).map((r) => r.session),
  };
}

/* ----------------------------------------------------------------- homepage */

export function getHomeData() {
  const stats = one<{ universities: number; resources: number; subjects: number; downloads: number }>(
    `SELECT
       (SELECT COUNT(*) FROM universities WHERE status='published') AS universities,
       (SELECT COUNT(*) FROM resources WHERE status='published') AS resources,
       (SELECT COUNT(*) FROM subjects WHERE status='published') AS subjects,
       (SELECT COALESCE(SUM(download_count),0) FROM resources WHERE status='published') AS downloads`,
  );

  const featured = listUniversities().slice(0, 8);
  const latest = listResources({ pageSize: 8, sort: "recent" }).items;
  const trending = listResources({ pageSize: 5, sort: "downloads" }).items.filter((r) => r.downloadCount > 0);
  const popularPyqs = listResources({ group: "pyq", pageSize: 4, sort: "downloads" }).items;
  const popularNotes = listResources({ group: "notes", pageSize: 4, sort: "downloads" }).items;
  const recentSyllabus = listResources({ group: "syllabus", pageSize: 4, sort: "recent" }).items;
  const categories = all<{ slug: string; name: string; group: string; count: number }>(
    `SELECT c.slug, c.name, c.group_slug AS "group", COUNT(r.id) AS count
       FROM categories c LEFT JOIN resources r ON r.category_id=c.id AND r.status='published'
      GROUP BY c.id ORDER BY c.sort_order`,
  ).map((c) => ({ ...c, count: Number(c.count) }));
  const programmes = listProgrammes();
  const faqs = all<{ id: string; question: string; answer: string }>(
    `SELECT id, question, answer FROM faqs WHERE published=1 ORDER BY sort_order LIMIT 6`,
  );
  const announcements = all<{ id: string; title: string; body: string; tone: string }>(
    `SELECT id, title, body, tone FROM announcements WHERE active=1 ORDER BY created_at DESC LIMIT 2`,
  );

  return {
    stats: {
      universities: Number(stats?.universities ?? 0),
      resources: Number(stats?.resources ?? 0),
      subjects: Number(stats?.subjects ?? 0),
      downloads: Number(stats?.downloads ?? 0),
    },
    featured,
    latest,
    trending,
    popularPyqs,
    popularNotes,
    recentSyllabus,
    categories,
    programmes,
    faqs,
    announcements,
  };
}

/* ------------------------------------------------------------------ search */

const BRANCH_CODES = ["cse", "it", "ece", "eee", "me", "ce", "ee", "aiml", "ds", "ai", "civil", "chemical"];

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

export function parseSearchQuery(raw: string): {
  text: string;
  tokens: string[];
  semester?: number;
  group?: string;
} {
  let text = ` ${raw.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ")} `;
  let semester: number | undefined;
  let group: string | undefined;

  const semMatch = text.match(/\b(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:sem|semester)\b/);
  if (semMatch) {
    semester = Number(semMatch[1]);
    text = text.replace(semMatch[0], " ");
  }

  const groupWords: [RegExp, string][] = [
    [/\b(pyqs?|previous\s+year|question\s+papers?|papers?)\b/, "pyq"],
    [/\b(notes?|handwritten|toppers?)\b/, "notes"],
    [/\bsyllabus\b/, "syllabus"],
    [/\b(practicals?|lab\s+manuals?|lab\s+files?)\b/, "practical"],
  ];
  for (const [re, value] of groupWords) {
    if (re.test(text)) {
      group = value;
      text = text.replace(re, " ");
    }
  }

  const tokens = text.split(/\s+/).filter((t) => t.length > 1);
  return { text: tokens.join(" "), tokens, semester, group };
}

export async function searchSite(rawQuery: string, options: { page?: number } = {}) {
  const raw = rawQuery.trim().slice(0, 120);
  const parsed = parseSearchQuery(raw);
  let tokens = [...parsed.tokens];

  const universities = all<{ id: string; slug: string; name: string; shortName: string; aliases: string | null }>(
    `SELECT id, slug, name, short_name AS shortName, aliases FROM universities WHERE status='published'`,
  );

  let university: { slug: string; name: string } | undefined;
  const uniIndex = universities.findIndex((u) => {
    const candidates = [u.shortName.toLowerCase(), u.slug.toLowerCase(), u.name.toLowerCase(), ...(u.aliases ?? "").toLowerCase().split(",").map((a) => a.trim())];
    return tokens.some((t) => candidates.includes(t));
  });
  if (uniIndex >= 0) {
    const matched = universities[uniIndex];
    university = { slug: matched.slug, name: matched.name };
    const candidates = [matched.shortName.toLowerCase(), matched.slug.toLowerCase(), ...(matched.aliases ?? "").toLowerCase().split(",").map((a) => a.trim())];
    tokens = tokens.filter((t) => !candidates.includes(t));
  }

  let branch: { slug: string; name: string } | undefined;
  if (university) {
    const uniRow = universities.find((u) => u.slug === university!.slug);
    const branchRows = all<{ slug: string; name: string; code: string | null }>(
      `SELECT slug, name, code FROM branches WHERE university_id = ? AND status='published'`,
      [uniRow!.id],
    );
    for (const token of tokens) {
      const found = branchRows.find(
        (b) => (b.code ?? "").toLowerCase() === token || b.name.toLowerCase().includes(token),
      );
      if (found) {
        branch = { slug: found.slug, name: found.name };
        tokens = tokens.filter((t) => t !== token);
        break;
      }
    }
  } else if (tokens.some((t) => BRANCH_CODES.includes(t))) {
    // "CSE" without a university: leave it in the text so it narrows results.
  }

  let categoryMatch: { slug: string } | undefined;
  const categoryRows = all<{ slug: string; name: string; group: string }>(
    `SELECT slug, name, group_slug AS "group" FROM categories`,
  );
  for (const token of tokens) {
    const found = categoryRows.find((c) => c.name.toLowerCase() === token || c.slug === token);
    if (found) {
      categoryMatch = { slug: found.slug };
      tokens = tokens.filter((t) => t !== token);
      break;
    }
  }

  const filters: ResourceFilters = {
    q: tokens.join(" "),
    university: university?.slug,
    branch: branch?.slug,
    semester: parsed.semester ? String(parsed.semester) : undefined,
    group: parsed.group,
    category: categoryMatch?.slug,
    page: options.page ?? 1,
    pageSize: 12,
    sort: "recent",
  };

  let results = listResources(filters);

  // Typo tolerance: retry with the closest known subject name when nothing matched.
  let fuzzyTerm: string | undefined;
  if (results.total === 0 && tokens.length > 0 && !parsed.semester) {
    const joined = tokens.join(" ");
    const subjectNames = all<{ name: string }>(`SELECT name FROM subjects WHERE status='published'`);
    let best: { name: string; distance: number } | undefined;
    for (const candidate of subjectNames) {
      const distance = levenshtein(joined.toLowerCase(), candidate.name.toLowerCase());
      if (!best || distance < best.distance) best = { name: candidate.name, distance };
    }
    if (best && best.distance <= Math.max(2, Math.floor(joined.length / 4))) {
      fuzzyTerm = best.name;
      results = listResources({ ...filters, q: best.name });
    }
  }

  const textQuery = tokens.join(" ");

  const subjectResults = textQuery
    ? all<{
        id: string;
        slug: string;
        name: string;
        code: string | null;
        semester: number;
        universityShort: string;
        resourceCount: number;
      }>(
        `SELECT s.id, s.slug, s.name, s.code, s.semester, u.short_name AS universityShort,
                (SELECT COUNT(*) FROM resources r WHERE r.subject_id=s.id AND r.status='published') AS resourceCount
           FROM subjects s JOIN universities u ON u.id=s.university_id
          WHERE s.status='published' AND ${university ? "u.slug = ? AND " : ""}
                (s.name LIKE ? OR IFNULL(s.code,'') LIKE ?)
          ORDER BY CASE WHEN IFNULL(s.code,'') = ? THEN 0 ELSE 1 END, s.name LIMIT 8`,
        [
          ...(university ? [university.slug] : []),
          likeTerm(fuzzyTerm ?? textQuery),
          likeTerm(fuzzyTerm ?? textQuery),
          textQuery.toUpperCase(),
        ],
      ).map((s) => ({ ...s, resourceCount: Number(s.resourceCount) }))
    : [];

  const universityResults = textQuery
    ? all<{ slug: string; name: string; shortName: string; state: string }>(
        `SELECT slug, name, short_name AS shortName, state FROM universities
          WHERE status='published' AND (name LIKE ? OR short_name LIKE ? OR IFNULL(aliases,'') LIKE ?)
          LIMIT 6`,
        [likeTerm(textQuery), likeTerm(textQuery), likeTerm(textQuery)],
      )
    : [];

  const programmeResults = textQuery
    ? all<{ slug: string; name: string; shortName: string }>(
        `SELECT slug, name, short_name AS shortName FROM programmes
          WHERE name LIKE ? OR short_name LIKE ? LIMIT 6`,
        [likeTerm(textQuery), likeTerm(textQuery)],
      )
    : [];

  return {
    raw,
    parsed: { ...parsed, university, branch, group: parsed.group, semester: parsed.semester },
    resources: results,
    subjects: subjectResults,
    universities: universityResults,
    programmes: programmeResults,
    fuzzyTerm,
  };
}

export function recordSearch(query: string, resultCount: number) {
  const clean = query.trim().slice(0, 120);
  if (!clean) return;
  run(`INSERT INTO search_queries (id, query, result_count) VALUES (lower(hex(randomblob(16))), ?, ?)`, [
    clean,
    resultCount,
  ]);
}

export function getTrendingSearches(limit = 6): { query: string; count: number }[] {
  return all<{ query: string; count: number }>(
    `SELECT query, COUNT(*) AS count FROM search_queries
      WHERE created_at >= datetime('now','-30 days')
      GROUP BY lower(query) ORDER BY count DESC LIMIT ?`,
    [limit],
  ).map((r) => ({ query: r.query, count: Number(r.count) }));
}

export function getSuggestions(raw: string) {
  const q = raw.trim().slice(0, 60);
  if (q.length < 2) return [];
  const like = likeTerm(q);
  const items: { type: string; label: string; sublabel: string; href: string }[] = [];

  for (const u of all<{ slug: string; name: string; shortName: string; state: string }>(
    `SELECT slug, name, short_name AS shortName, state FROM universities
      WHERE status='published' AND (name LIKE ? OR short_name LIKE ? OR IFNULL(aliases,'') LIKE ?)
      LIMIT 3`,
    [like, like, like],
  )) {
    items.push({ type: "University", label: u.shortName, sublabel: `${u.name} · ${u.state}`, href: `/universities/${u.slug}` });
  }

  for (const s of all<{ slug: string; name: string; code: string | null; universityShort: string }>(
    `SELECT s.slug, s.name, s.code, u.short_name AS universityShort
       FROM subjects s JOIN universities u ON u.id=s.university_id
      WHERE s.status='published' AND (s.name LIKE ? OR IFNULL(s.code,'') LIKE ?)
      ORDER BY CASE WHEN IFNULL(s.code,'') = ? THEN 0 ELSE 1 END LIMIT 4`,
    [like, like, q.toUpperCase()],
  )) {
    items.push({
      type: "Subject",
      label: s.name,
      sublabel: `${s.universityShort}${s.code ? ` · ${s.code}` : ""}`,
      href: `/subjects/${s.slug}`,
    });
  }

  for (const r of all<{ slug: string; title: string; universityShort: string }>(
    `SELECT r.slug, r.title, u.short_name AS universityShort
       FROM resources r JOIN universities u ON u.id=r.university_id
      WHERE r.status='published' AND r.title LIKE ? LIMIT 3`,
    [like],
  )) {
    items.push({ type: "Resource", label: r.title, sublabel: `${r.universityShort} · resource`, href: `/resource/${r.slug}` });
  }

  return items.slice(0, 8);
}

/* -------------------------------------------------------------------- misc */

export function getFaqs() {
  return all<{ id: string; question: string; answer: string; category: string }>(
    `SELECT id, question, answer, category FROM faqs WHERE published=1 ORDER BY sort_order, question`,
  );
}

export function getCommunityLinks() {
  return all<{
    id: string;
    label: string;
    platform: string;
    url: string;
    universityShort: string | null;
  }>(
    `SELECT c.id, c.label, c.platform, c.url, u.short_name AS universityShort
       FROM community_links c LEFT JOIN universities u ON u.id=c.university_id
      WHERE c.active=1 ORDER BY c.sort_order, c.label`,
  );
}

export function getAnnouncements() {
  return all<{ id: string; title: string; body: string; tone: string }>(
    `SELECT id, title, body, tone FROM announcements WHERE active=1 ORDER BY created_at DESC LIMIT 4`,
  );
}

export function getActiveAds(slot: string) {
  return all<{ id: string; title: string; body: string | null; imageUrl: string | null; targetUrl: string | null }>(
    `SELECT id, title, body, image_url AS imageUrl, target_url AS targetUrl
       FROM advertisements WHERE slot = ? AND active = 1 LIMIT 1`,
    [slot],
  )[0] ?? null;
}

export function getSiteSetting(key: string, fallback: string): string {
  const row = one<{ value: string }>(`SELECT value FROM site_settings WHERE key = ?`, [key]);
  return row?.value ?? fallback;
}
