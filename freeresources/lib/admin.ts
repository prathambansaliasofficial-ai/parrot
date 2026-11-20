import { all, one, run } from "./db";

/* ------------------------------------------------------------------ types */

export type FieldOption = { value: string; label: string };

export type AdminField = {
  name: string;
  label: string;
  type?: "text" | "textarea" | "number" | "select" | "checkbox" | "url" | "email" | "date";
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  optionsFrom?: "universities" | "programmes" | "branches" | "categories" | "colleges";
  min?: number;
  max?: number;
  full?: boolean;
};

export type EntityConfig = {
  table: string;
  label: string;
  singular: string;
  description: string;
  fields: AdminField[];
  columns: { key: string; label: string }[];
  listSql: string;
  searchColumns?: string[];
  slugSource?: string;
  orderBy?: string;
};

export type AdminOptions = {
  universities: FieldOption[];
  programmes: FieldOption[];
  branches: FieldOption[];
  categories: FieldOption[];
  colleges: FieldOption[];
};

export { ADMIN_NAV, type AdminNavItem } from "./admin-nav";

export const ENTITIES: Record<string, EntityConfig> = {
  universities: {
    table: "universities",
    label: "Universities",
    singular: "university",
    description: "Institutions students can browse. Slugs appear in public URLs.",
    slugSource: "name",
    listSql: `SELECT id, name, short_name AS shortName, state, type, status, slug
                FROM universities ORDER BY featured DESC, name`,
    searchColumns: ["name", "short_name", "state", "slug"],
    columns: [
      { key: "name", label: "Name" },
      { key: "shortName", label: "Short" },
      { key: "state", label: "State" },
      { key: "type", label: "Type" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { name: "name", label: "Full name", required: true, full: true },
      { name: "short_name", label: "Short name", required: true, help: "Shown on cards and chips, e.g. AKTU." },
      { name: "slug", label: "URL slug", placeholder: "dr-ambedkar-university-delhi" },
      { name: "state", label: "State", required: true },
      { name: "city", label: "City" },
      {
        name: "type",
        label: "Institution type",
        type: "select",
        required: true,
        options: ["Central", "State", "Deemed", "Private", "Autonomous"].map((v) => ({ value: v, label: v })),
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
        ],
      },
      { name: "website", label: "Website", type: "url", placeholder: "https://" },
      { name: "logo_url", label: "Logo URL", placeholder: "https://…/logo.png" },
      { name: "featured", label: "Featured on homepage", type: "checkbox" },
      { name: "description", label: "Description", type: "textarea", full: true },
    ],
  },
  colleges: {
    table: "colleges",
    label: "Colleges",
    singular: "college",
    description: "Optional affiliated colleges under a university.",
    slugSource: "name",
    listSql: `SELECT c.id, c.name, u.short_name AS university, c.city, c.state, c.status, c.slug
                FROM colleges c JOIN universities u ON u.id = c.university_id
               ORDER BY u.short_name, c.name`,
    searchColumns: ["c.name", "u.short_name", "c.city"],
    columns: [
      { key: "name", label: "College" },
      { key: "university", label: "University" },
      { key: "city", label: "City" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { name: "university_id", label: "University", type: "select", optionsFrom: "universities", required: true },
      { name: "name", label: "College name", required: true, full: true },
      { name: "slug", label: "URL slug" },
      { name: "city", label: "City" },
      { name: "state", label: "State" },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
        ],
      },
    ],
  },
  programmes: {
    table: "programmes",
    label: "Programmes",
    singular: "programme",
    description: "Course families such as B.Tech, BCA or MBA.",
    slugSource: "name",
    listSql: `SELECT id, name, short_name AS shortName, level, slug FROM programmes ORDER BY level, name`,
    searchColumns: ["name", "short_name", "level"],
    columns: [
      { key: "name", label: "Programme" },
      { key: "shortName", label: "Short" },
      { key: "level", label: "Level" },
    ],
    fields: [
      { name: "name", label: "Programme name", required: true, full: true },
      { name: "short_name", label: "Short name", required: true, placeholder: "B.Tech" },
      { name: "slug", label: "URL slug", placeholder: "btech" },
      {
        name: "level",
        label: "Level",
        type: "select",
        required: true,
        options: ["Undergraduate", "Postgraduate", "Diploma", "Doctorate"].map((v) => ({ value: v, label: v })),
      },
      { name: "description", label: "Description", type: "textarea", full: true },
    ],
  },
  branches: {
    table: "branches",
    label: "Branches",
    singular: "branch",
    description: "Specialisations within a programme at a university. Optional for programmes without branches.",
    slugSource: "name",
    listSql: `SELECT b.id, b.name, b.code, u.short_name AS university, p.short_name AS programme, b.status, b.slug
                FROM branches b
                JOIN universities u ON u.id = b.university_id
                JOIN programmes p ON p.id = b.programme_id
               ORDER BY u.short_name, p.short_name, b.name`,
    searchColumns: ["b.name", "b.code", "u.short_name", "p.short_name"],
    columns: [
      { key: "name", label: "Branch" },
      { key: "code", label: "Code" },
      { key: "university", label: "University" },
      { key: "programme", label: "Programme" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { name: "university_id", label: "University", type: "select", optionsFrom: "universities", required: true },
      { name: "programme_id", label: "Programme", type: "select", optionsFrom: "programmes", required: true },
      { name: "name", label: "Branch name", required: true, full: true },
      { name: "slug", label: "URL slug" },
      { name: "code", label: "Branch code", placeholder: "CSE" },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
        ],
      },
    ],
  },
  subjects: {
    table: "subjects",
    label: "Subjects",
    singular: "subject",
    description: "The anchor for every resource: university, programme, optional branch, semester and code.",
    slugSource: "name",
    listSql: `SELECT s.id, s.name, s.code, u.short_name AS university, p.short_name AS programme,
                     s.semester, s.status, s.slug
                FROM subjects s
                JOIN universities u ON u.id = s.university_id
                JOIN programmes p ON p.id = s.programme_id
               ORDER BY u.short_name, p.short_name, s.semester, s.name`,
    searchColumns: ["s.name", "s.code", "u.short_name", "p.short_name"],
    columns: [
      { key: "name", label: "Subject" },
      { key: "code", label: "Code" },
      { key: "university", label: "University" },
      { key: "programme", label: "Programme" },
      { key: "semester", label: "Sem" },
      { key: "status", label: "Status" },
    ],
    fields: [
      { name: "university_id", label: "University", type: "select", optionsFrom: "universities", required: true },
      { name: "programme_id", label: "Programme", type: "select", optionsFrom: "programmes", required: true },
      {
        name: "branch_id",
        label: "Branch (optional)",
        type: "select",
        optionsFrom: "branches",
        help: "Leave empty for a subject shared across all branches.",
      },
      { name: "name", label: "Subject name", required: true, full: true },
      { name: "slug", label: "URL slug" },
      { name: "code", label: "Subject code", placeholder: "BCS301" },
      { name: "semester", label: "Semester", type: "number", min: 1, max: 12, required: true },
      { name: "credits", label: "Credits" },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: [
          { value: "published", label: "Published" },
          { value: "draft", label: "Draft" },
        ],
      },
      { name: "is_sample", label: "Sample subject (seed data)", type: "checkbox" },
      { name: "description", label: "Description", type: "textarea", full: true },
      { name: "syllabus_text", label: "Syllabus notes", type: "textarea", full: true },
    ],
  },
  categories: {
    table: "categories",
    label: "Resource categories",
    singular: "category",
    description: "Types of material. The group controls which public library tab a category appears under.",
    slugSource: "name",
    listSql: `SELECT id, name, group_slug AS groupSlug, sort_order AS sortOrder, slug
                FROM categories ORDER BY group_slug, sort_order, name`,
    searchColumns: ["name", "slug", "group_slug"],
    columns: [
      { key: "name", label: "Category" },
      { key: "groupSlug", label: "Group" },
      { key: "sortOrder", label: "Order" },
    ],
    fields: [
      { name: "name", label: "Category name", required: true },
      { name: "slug", label: "URL slug" },
      {
        name: "group_slug",
        label: "Library group",
        type: "select",
        required: true,
        options: [
          { value: "pyq", label: "PYQ library" },
          { value: "notes", label: "Notes library" },
          { value: "syllabus", label: "Syllabus library" },
          { value: "practical", label: "Practical library" },
          { value: "other", label: "Other" },
        ],
      },
      { name: "sort_order", label: "Sort order", type: "number", min: 0, max: 999 },
      { name: "description", label: "Description", type: "textarea", full: true },
    ],
  },
  "academic-years": {
    table: "academic_years",
    label: "Academic years",
    singular: "academic year",
    description: "Maps semester numbers to a year label. Ordinals must be unique.",
    listSql: `SELECT id, label, ordinal, semester_from AS semesterFrom, semester_to AS semesterTo
                FROM academic_years ORDER BY ordinal`,
    searchColumns: ["label"],
    columns: [
      { key: "label", label: "Year" },
      { key: "ordinal", label: "Ordinal" },
      { key: "semesterFrom", label: "From sem" },
      { key: "semesterTo", label: "To sem" },
    ],
    fields: [
      { name: "label", label: "Label", required: true, placeholder: "2nd Year" },
      { name: "ordinal", label: "Ordinal", type: "number", required: true, min: 1, max: 10 },
      { name: "semester_from", label: "Semester from", type: "number", required: true, min: 1, max: 12 },
      { name: "semester_to", label: "Semester to", type: "number", required: true, min: 1, max: 12 },
    ],
  },
  faqs: {
    table: "faqs",
    label: "FAQs",
    singular: "FAQ",
    description: "Published questions appear on /faq and the homepage.",
    listSql: `SELECT id, question, category, sort_order AS sortOrder, published FROM faqs ORDER BY category, sort_order`,
    searchColumns: ["question", "answer", "category"],
    columns: [
      { key: "question", label: "Question" },
      { key: "category", label: "Category" },
      { key: "sortOrder", label: "Order" },
      { key: "published", label: "Published" },
    ],
    fields: [
      { name: "question", label: "Question", required: true, full: true },
      { name: "answer", label: "Answer", type: "textarea", required: true, full: true },
      { name: "category", label: "Category", placeholder: "General" },
      { name: "sort_order", label: "Sort order", type: "number", min: 0, max: 999 },
      { name: "published", label: "Published", type: "checkbox" },
    ],
  },
  "community-links": {
    table: "community_links",
    label: "Community links",
    singular: "community link",
    description: "Only add verified groups. Empty is better than fake.",
    listSql: `SELECT c.id, c.label, c.platform, c.url, u.short_name AS university, c.active, c.sort_order AS sortOrder
                FROM community_links c LEFT JOIN universities u ON u.id = c.university_id
               ORDER BY c.sort_order, c.label`,
    searchColumns: ["c.label", "c.platform", "u.short_name"],
    columns: [
      { key: "label", label: "Label" },
      { key: "platform", label: "Platform" },
      { key: "university", label: "University" },
      { key: "active", label: "Active" },
    ],
    fields: [
      { name: "label", label: "Link label", required: true },
      { name: "platform", label: "Platform", type: "select", options: ["Telegram", "WhatsApp", "Discord", "Other"].map((v) => ({ value: v, label: v })) },
      { name: "url", label: "Invite URL", type: "url", required: true, full: true },
      { name: "university_id", label: "University (optional)", type: "select", optionsFrom: "universities" },
      { name: "sort_order", label: "Sort order", type: "number", min: 0, max: 999 },
      { name: "active", label: "Active", type: "checkbox" },
    ],
  },
  advertisements: {
    table: "advertisements",
    label: "Advertisements",
    singular: "advertisement",
    description: "Plain, labelled placements. Slot names are read by the public pages.",
    listSql: `SELECT id, slot, title, target_url AS targetUrl, active, impressions, clicks FROM advertisements ORDER BY slot`,
    searchColumns: ["slot", "title"],
    columns: [
      { key: "slot", label: "Slot" },
      { key: "title", label: "Title" },
      { key: "impressions", label: "Impr." },
      { key: "clicks", label: "Clicks" },
      { key: "active", label: "Active" },
    ],
    fields: [
      { name: "slot", label: "Slot", required: true, placeholder: "homepage-banner" },
      { name: "title", label: "Title", required: true },
      { name: "body", label: "Body", type: "textarea", full: true },
      { name: "image_url", label: "Image URL", placeholder: "https://…" },
      { name: "target_url", label: "Target URL", type: "url", placeholder: "https://" },
      { name: "active", label: "Active", type: "checkbox" },
    ],
  },
  announcements: {
    table: "announcements",
    label: "Announcements",
    singular: "announcement",
    description: "Short notices shown on the homepage.",
    listSql: `SELECT id, title, tone, active, created_at AS createdAt FROM announcements ORDER BY created_at DESC`,
    searchColumns: ["title", "body"],
    columns: [
      { key: "title", label: "Title" },
      { key: "tone", label: "Tone" },
      { key: "active", label: "Active" },
      { key: "createdAt", label: "Created" },
    ],
    fields: [
      { name: "title", label: "Title", required: true, full: true },
      { name: "body", label: "Body", type: "textarea", required: true, full: true },
      {
        name: "tone",
        label: "Tone",
        type: "select",
        options: ["info", "success", "warning"].map((v) => ({ value: v, label: v })),
      },
      { name: "active", label: "Active", type: "checkbox" },
    ],
  },
};

export function getEntityConfig(slug: string): EntityConfig | undefined {
  return ENTITIES[slug];
}

/* ---------------------------------------------------------------- options */

export function getAdminOptions(): AdminOptions {
  return {
    universities: all<{ value: string; label: string }>(
      `SELECT id AS value, name || ' (' || short_name || ')' AS label FROM universities ORDER BY name`,
    ),
    programmes: all<{ value: string; label: string }>(
      `SELECT id AS value, name || ' (' || short_name || ')' AS label FROM programmes ORDER BY name`,
    ),
    branches: all<{ value: string; label: string }>(
      `SELECT b.id AS value, b.name || ' — ' || u.short_name || ' · ' || p.short_name AS label
         FROM branches b JOIN universities u ON u.id=b.university_id JOIN programmes p ON p.id=b.programme_id
        ORDER BY u.short_name, p.short_name, b.name`,
    ),
    categories: all<{ value: string; label: string }>(
      `SELECT id AS value, name || ' (' || group_slug || ')' AS label FROM categories ORDER BY group_slug, sort_order, name`,
    ),
    colleges: all<{ value: string; label: string }>(
      `SELECT c.id AS value, c.name || ' — ' || u.short_name AS label
         FROM colleges c JOIN universities u ON u.id=c.university_id ORDER BY c.name`,
    ),
  };
}

export function resolveFields(config: EntityConfig, options: AdminOptions): AdminField[] {
  return config.fields.map((field) => {
    if (!field.optionsFrom) return field;
    return { ...field, options: options[field.optionsFrom] };
  });
}

/* ------------------------------------------------------------- list/rows */

export function listEntityRows(config: EntityConfig, query = ""): Record<string, unknown>[] {
  const q = query.trim();
  if (!q) return all(config.listSql);
  const columns = config.searchColumns ?? [];
  if (columns.length === 0) return all(config.listSql);
  const where = columns.map((column) => `${column} LIKE ?`).join(" OR ");
  const params = columns.map(() => `%${q}%`);
  const sql = config.listSql.includes(" WHERE ")
    ? `${config.listSql} AND (${where})`
    : `${config.listSql.replace(/\s+ORDER BY[\s\S]*$/i, "")} WHERE (${where}) ${
        /ORDER BY[\s\S]*$/i.exec(config.listSql)?.[0] ?? ""
      }`;
  return all(sql, params);
}

export function getEntityRow(config: EntityConfig, id: string): Record<string, unknown> | undefined {
  return one(`SELECT * FROM ${config.table} WHERE id = ?`, [id]);
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80);
}

export function uniqueSlug(table: string, base: string, excludeId?: string): string {
  let slug = slugify(base) || "item";
  let candidate = slug;
  let n = 2;
  while (
    one<{ id: string }>(`SELECT id FROM ${table} WHERE slug = ? ${excludeId ? "AND id != ?" : ""}`, [
      candidate,
      ...(excludeId ? [excludeId] : []),
    ])
  ) {
    candidate = `${slug}-${n++}`;
  }
  return candidate;
}

/* -------------------------------------------------------------- resources */

export type AdminResourceRow = {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "published";
  isSample: number;
  featured: number;
  semester: number;
  session: string | null;
  downloadCount: number;
  createdAt: string;
  subjectName: string;
  subjectCode: string | null;
  universityShort: string;
  programmeShort: string;
  categoryName: string;
  fileId: string | null;
  fileName: string | null;
  fileSize: number | null;
  fileCount: number;
};

export function listAdminResources(query = "", status = ""): AdminResourceRow[] {
  const clauses: string[] = [];
  const params: unknown[] = [];
  if (query.trim()) {
    clauses.push("(r.title LIKE ? OR s.name LIKE ? OR s.code LIKE ? OR u.short_name LIKE ?)");
    const like = `%${query.trim()}%`;
    params.push(like, like, like, like);
  }
  if (status === "draft" || status === "published") {
    clauses.push("r.status = ?");
    params.push(status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return all<AdminResourceRow>(
    `SELECT r.id, r.slug, r.title, r.status, r.is_sample AS isSample, r.featured,
            r.semester, r.session, r.download_count AS downloadCount, r.created_at AS createdAt,
            s.name AS subjectName, s.code AS subjectCode,
            u.short_name AS universityShort, p.short_name AS programmeShort,
            c.name AS categoryName,
            (SELECT f.id FROM resource_files f WHERE f.resource_id=r.id ORDER BY f.is_primary DESC, f.created_at LIMIT 1) AS fileId,
            (SELECT f.original_name FROM resource_files f WHERE f.resource_id=r.id ORDER BY f.is_primary DESC, f.created_at LIMIT 1) AS fileName,
            (SELECT f.size_bytes FROM resource_files f WHERE f.resource_id=r.id ORDER BY f.is_primary DESC, f.created_at LIMIT 1) AS fileSize,
            (SELECT COUNT(*) FROM resource_files f WHERE f.resource_id=r.id) AS fileCount
       FROM resources r
       JOIN subjects s ON s.id=r.subject_id
       JOIN universities u ON u.id=r.university_id
       JOIN programmes p ON p.id=r.programme_id
       JOIN categories c ON c.id=r.category_id
       ${where}
      ORDER BY r.created_at DESC
      LIMIT 200`,
    params,
  );
}

export type SubjectOption = {
  value: string;
  label: string;
  universityId: string;
  programmeId: string;
  branchId: string | null;
  semester: number;
  code: string | null;
};

export function getResourceFormOptions(): {
  subjects: SubjectOption[];
  categories: FieldOption[];
  sessions: string[];
} {
  return {
    subjects: all<SubjectOption>(
      `SELECT s.id AS value,
              s.name || COALESCE(' (' || s.code || ')', '') || ' — ' || u.short_name || ' · ' ||
              p.short_name || ' · Sem ' || s.semester ||
              COALESCE(' · ' || b.name, '') AS label,
              s.university_id AS universityId, s.programme_id AS programmeId,
              s.branch_id AS branchId, s.semester, s.code
         FROM subjects s
         JOIN universities u ON u.id=s.university_id
         JOIN programmes p ON p.id=s.programme_id
         LEFT JOIN branches b ON b.id=s.branch_id
        ORDER BY u.short_name, p.short_name, s.semester, s.name`,
    ),
    categories: all<FieldOption>(
      `SELECT id AS value, name || ' (' || group_slug || ')' AS label FROM categories ORDER BY group_slug, sort_order`,
    ),
    sessions: ["2026-27", "2025-26", "2024-25", "2023-24", "2022-23", "2021-22"],
  };
}

export function getAdminResource(id: string):
  | {
      resource: Record<string, unknown>;
      files: { id: string; originalName: string; sizeBytes: number; isPrimary: number; createdAt: string }[];
    }
  | undefined {
  const resource = one<Record<string, unknown>>(`SELECT * FROM resources WHERE id = ?`, [id]);
  if (!resource) return undefined;
  const files = all<{ id: string; originalName: string; sizeBytes: number; isPrimary: number; createdAt: string }>(
    `SELECT id, original_name AS originalName, size_bytes AS sizeBytes, is_primary AS isPrimary, created_at AS createdAt
       FROM resource_files WHERE resource_id = ? ORDER BY is_primary DESC, created_at`,
    [id],
  );
  return { resource, files };
}

/* ---------------------------------------------------------- contributions */

export type ContributionRow = {
  id: string;
  publicId: string;
  title: string;
  status: "pending" | "approved" | "rejected";
  subjectName: string;
  subjectCode: string | null;
  semester: number;
  session: string | null;
  contributorName: string;
  email: string;
  fileName: string;
  fileSize: number;
  createdAt: string;
  universityName: string;
  universityShort: string;
  programmeName: string;
  categoryName: string;
  resourceSlug: string | null;
};

export function listContributions(status = ""): ContributionRow[] {
  const where = status === "pending" || status === "approved" || status === "rejected" ? "WHERE c.status = ?" : "";
  return all<ContributionRow>(
    `SELECT c.id, c.public_id AS publicId, c.title, c.status, c.subject_name AS subjectName,
            c.subject_code AS subjectCode, c.semester, c.session, c.contributor_name AS contributorName,
            c.email, c.file_name AS fileName, c.file_size AS fileSize, c.created_at AS createdAt,
            u.name AS universityName, u.short_name AS universityShort,
            p.name AS programmeName, cat.name AS categoryName, r.slug AS resourceSlug
       FROM contributions c
       JOIN universities u ON u.id=c.university_id
       JOIN programmes p ON p.id=c.programme_id
       JOIN categories cat ON cat.id=c.category_id
       LEFT JOIN resources r ON r.id=c.resource_id
       ${where}
      ORDER BY CASE c.status WHEN 'pending' THEN 0 ELSE 1 END, c.created_at DESC
      LIMIT 200`,
    where ? [status] : [],
  );
}

export function getContribution(id: string) {
  return one<Record<string, unknown> & { file_path: string; status: string; resource_slug: string | null }>(
    `SELECT c.*, u.name AS university_name, u.short_name AS university_short,
            p.name AS programme_name, b.name AS branch_name, cat.name AS category_name,
            cat.id AS category_id, col.name AS college_name, r.slug AS resource_slug
       FROM contributions c
       JOIN universities u ON u.id=c.university_id
       JOIN programmes p ON p.id=c.programme_id
       LEFT JOIN branches b ON b.id=c.branch_id
       LEFT JOIN colleges col ON col.id=c.college_id
       JOIN categories cat ON cat.id=c.category_id
       LEFT JOIN resources r ON r.id=c.resource_id
      WHERE c.id = ?`,
    [id],
  );
}

/* ------------------------------------------------------------- requests/tickets */

export type AdminRequestRow = {
  id: string;
  publicId: string;
  subjectName: string;
  subjectCode: string | null;
  semester: number | null;
  email: string;
  details: string | null;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  universityShort: string;
  programmeShort: string;
};

export function getAdminRequest(id: string) {
  return one<AdminRequestRow & { universityName: string; programmeName: string; branchName: string | null; categoryName: string | null }>(
    `SELECT rq.id, rq.public_id AS publicId, rq.subject_name AS subjectName, rq.subject_code AS subjectCode,
            rq.semester, rq.email, rq.details, rq.status, rq.admin_notes AS adminNotes, rq.created_at AS createdAt,
            u.short_name AS universityShort, u.name AS universityName,
            p.short_name AS programmeShort, p.name AS programmeName,
            b.name AS branchName, c.name AS categoryName
       FROM requests rq
       JOIN universities u ON u.id=rq.university_id
       JOIN programmes p ON p.id=rq.programme_id
       LEFT JOIN branches b ON b.id=rq.branch_id
       LEFT JOIN categories c ON c.id=rq.category_id
      WHERE rq.id = ?`,
    [id],
  );
}

export function listAdminRequests(status = ""): AdminRequestRow[] {
  const where = status ? "WHERE rq.status = ?" : "";
  return all<AdminRequestRow>(
    `SELECT rq.id, rq.public_id AS publicId, rq.subject_name AS subjectName, rq.subject_code AS subjectCode,
            rq.semester, rq.email, rq.details, rq.status, rq.admin_notes AS adminNotes, rq.created_at AS createdAt,
            u.short_name AS universityShort, p.short_name AS programmeShort
       FROM requests rq
       JOIN universities u ON u.id=rq.university_id
       JOIN programmes p ON p.id=rq.programme_id
       ${where}
      ORDER BY CASE rq.status WHEN 'new' THEN 0 ELSE 1 END, rq.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
}

export type AdminTicketRow = {
  id: string;
  publicId: string;
  name: string;
  email: string;
  category: string;
  subject: string;
  message: string;
  status: string;
  adminReply: string | null;
  resourceId: string | null;
  createdAt: string;
};

export function getAdminTicket(id: string) {
  return one<AdminTicketRow & { resourceTitle: string | null; resourceSlug: string | null }>(
    `SELECT t.id, t.public_id AS publicId, t.name, t.email, t.category, t.subject, t.message,
            t.status, t.admin_reply AS adminReply, t.resource_id AS resourceId, t.created_at AS createdAt,
            r.title AS resourceTitle, r.slug AS resourceSlug
       FROM tickets t LEFT JOIN resources r ON r.id=t.resource_id
      WHERE t.id = ?`,
    [id],
  );
}

export function listAdminTickets(status = ""): AdminTicketRow[] {
  const where = status ? "WHERE t.status = ?" : "";
  return all<AdminTicketRow>(
    `SELECT t.id, t.public_id AS publicId, t.name, t.email, t.category, t.subject, t.message,
            t.status, t.admin_reply AS adminReply, t.resource_id AS resourceId, t.created_at AS createdAt
       FROM tickets t ${where}
      ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, t.created_at DESC LIMIT 200`,
    status ? [status] : [],
  );
}

/* ------------------------------------------------------------------ stats */

export function getAdminStats() {
  const count = (table: string, where = "") =>
    one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} ${where}`)?.n ?? 0;
  return {
    universities: count("universities"),
    colleges: count("colleges"),
    programmes: count("programmes"),
    subjects: count("subjects"),
    resources: count("resources"),
    published: count("resources", "WHERE status='published'"),
    drafts: count("resources", "WHERE status='draft'"),
    downloads: count("downloads"),
    users: count("users"),
    pendingContributions: count("contributions", "WHERE status='pending'"),
    pendingRequests: count("requests", "WHERE status='new'"),
    openTickets: count("tickets", "WHERE status IN ('open','in_progress')"),
    searches: count("search_queries"),
  };
}

export function getRecentDownloads(limit = 8) {
  return all<{ title: string; shortName: string; downloadCount: number; slug: string }>(
    `SELECT r.title, u.short_name AS shortName, r.download_count AS downloadCount, r.slug
       FROM resources r JOIN universities u ON u.id=r.university_id
      WHERE r.download_count > 0 ORDER BY r.download_count DESC LIMIT ?`,
    [limit],
  );
}

export function getRecentSearches(limit = 10) {
  return all<{ query: string; resultCount: number; createdAt: string }>(
    `SELECT query, result_count AS resultCount, created_at AS createdAt
       FROM search_queries ORDER BY created_at DESC LIMIT ?`,
    [limit],
  );
}

export function getTopSearches(limit = 10) {
  return all<{ query: string; hits: number; results: number }>(
    `SELECT query, COUNT(*) AS hits, MAX(result_count) AS results
       FROM search_queries GROUP BY lower(query) ORDER BY hits DESC LIMIT ?`,
    [limit],
  );
}

export function getDownloadSeries() {
  return all<{ day: string; n: number }>(
    `SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
       FROM downloads GROUP BY day ORDER BY day DESC LIMIT 14`,
  );
}

export function getAuditLog(limit = 20) {
  return all<{ action: string; entity: string; entityId: string | null; detail: string | null; createdAt: string; email: string | null }>(
    `SELECT a.action, a.entity, a.entity_id AS entityId, a.detail, a.created_at AS createdAt, u.email
       FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
      ORDER BY a.created_at DESC LIMIT ?`,
    [limit],
  );
}

export function recordAudit(userId: string | null, action: string, entity: string, entityId: string | null, detail?: string) {
  run(
    `INSERT INTO audit_log (id, user_id, action, entity, entity_id, detail)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?)`,
    [userId, action, entity, entityId, detail ?? null],
  );
}
