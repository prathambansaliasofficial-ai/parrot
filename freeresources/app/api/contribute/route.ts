import { z } from "zod";

import { apiUser } from "@/lib/http";
import { one, run } from "@/lib/db";
import { clientIp, fail, guardOrigin, ok, rateLimit, zodFields } from "@/lib/http";
import { publicId } from "@/lib/format";
import { deleteStoredFile, savePdfUpload, UploadError } from "@/lib/storage";

export const runtime = "nodejs";

const schema = z.object({
  title: z.string().trim().min(4, "Give the resource a clear title.").max(160),
  university: z.string().trim().min(1, "Choose a university."),
  college: z.string().trim().optional(),
  programme: z.string().trim().min(1, "Choose a programme."),
  branch: z.string().trim().optional(),
  semester: z.coerce.number().int().min(1).max(12),
  subjectSlug: z.string().trim().optional(),
  subjectName: z.string().trim().max(120).optional(),
  subjectCode: z.string().trim().max(30).optional(),
  category: z.string().trim().min(1, "Choose a resource category."),
  session: z.string().trim().max(20).optional(),
  description: z.string().trim().max(1200).optional(),
  contributorName: z.string().trim().min(2, "Tell us who to credit.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const limited = rateLimit(`contribute:${clientIp(request)}`, 6, 60_000);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart form submission.", 400);
  }

  const raw = Object.fromEntries(
    [...form.entries()].filter(([, value]) => typeof value === "string").map(([key, value]) => [key, value]),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return fail("Please check the highlighted fields.", 422, zodFields(parsed.error));

  const input = parsed.data;
  const fields: Record<string, string> = {};

  const university = one<{ id: string; name: string }>(
    "SELECT id, name FROM universities WHERE slug = ? AND status = 'published'",
    [input.university],
  );
  if (!university) fields.university = "Choose a valid university.";

  const programme = one<{ id: string; name: string }>(
    "SELECT id, name FROM programmes WHERE slug = ?",
    [input.programme],
  );
  if (!programme) fields.programme = "Choose a valid programme.";

  const category = one<{ id: string; name: string }>("SELECT id, name FROM categories WHERE slug = ?", [
    input.category,
  ]);
  if (!category) fields.category = "Choose a valid resource category.";

  let branchId: string | null = null;
  if (input.branch) {
    const branch = one<{ id: string }>(
      "SELECT id FROM branches WHERE slug = ? AND status = 'published'",
      [input.branch],
    );
    if (!branch) fields.branch = "Choose a valid branch.";
    else branchId = branch.id;
  }

  let collegeId: string | null = null;
  if (input.college && university) {
    const college = one<{ id: string }>(
      "SELECT id FROM colleges WHERE slug = ? AND university_id = ? AND status = 'published'",
      [input.college, university.id],
    );
    if (!college) fields.college = "Choose a valid college.";
    else collegeId = college.id;
  }

  let subjectId: string | null = null;
  if (input.subjectSlug) {
    const subject = one<{ id: string }>(
      "SELECT id FROM subjects WHERE slug = ? AND status = 'published'",
      [input.subjectSlug],
    );
    if (!subject) fields.subjectSlug = "Choose a valid subject.";
    else subjectId = subject.id;
  }
  if (!subjectId && !input.subjectName) {
    fields.subjectName = "Choose a subject or enter a new subject name.";
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    fields.file = "Attach a PDF file.";
  }
  if (Object.keys(fields).length > 0) return fail("Please check the highlighted fields.", 422, fields);

  let stored;
  try {
    stored = await savePdfUpload(file instanceof File ? file : null);
  } catch (error) {
    return fail(error instanceof UploadError ? error.message : "The file could not be stored.", 422, {
      file: error instanceof Error ? error.message : "Upload failed.",
    });
  }

  const user = await apiUser();
  const reference = publicId("FRC");
  const subjectName = input.subjectSlug
    ? (one<{ name: string }>("SELECT name FROM subjects WHERE id = ?", [subjectId])?.name ?? input.subjectName ?? "")
    : (input.subjectName ?? "");

  try {
    run(
      `INSERT INTO contributions
         (id, public_id, title, university_id, college_id, programme_id, branch_id, semester,
          subject_name, subject_code, category_id, session, description, contributor_name, email,
          user_id, file_path, file_name, file_size)
       VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference,
        input.title,
        university!.id,
        collegeId,
        programme!.id,
        branchId,
        input.semester,
        subjectName,
        input.subjectCode || null,
        category!.id,
        input.session || null,
        input.description || null,
        input.contributorName,
        input.email,
        user?.id ?? null,
        stored.storageKey,
        stored.originalName,
        stored.sizeBytes,
      ],
    );
  } catch {
    await deleteStoredFile(stored.storageKey);
    return fail("The submission could not be saved. Please try again.", 500);
  }

  return ok(
    {
      reference,
      message:
        "Received. An administrator will review the file before it is published. Keep your reference number to follow up.",
    },
    201,
  );
}
