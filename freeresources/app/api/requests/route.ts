import { z } from "zod";

import { one, run } from "@/lib/db";
import { clientIp, fail, guardOrigin, ok, rateLimit, zodFields } from "@/lib/http";
import { publicId } from "@/lib/format";

export const runtime = "nodejs";

const schema = z.object({
  university: z.string().trim().min(1, "Choose a university."),
  programme: z.string().trim().min(1, "Choose a programme."),
  branch: z.string().trim().optional(),
  semester: z.coerce.number().int().min(1).max(12).optional(),
  subjectName: z.string().trim().min(2, "Enter the subject name.").max(120),
  subjectCode: z.string().trim().max(30).optional(),
  category: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  details: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const limited = rateLimit(`request:${clientIp(request)}`, 6, 60_000);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON request body.", 400);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail("Please check the highlighted fields.", 422, zodFields(parsed.error));
  const input = parsed.data;

  const fields: Record<string, string> = {};
  const university = one<{ id: string }>(
    "SELECT id FROM universities WHERE slug = ? AND status = 'published'",
    [input.university],
  );
  if (!university) fields.university = "Choose a valid university.";

  const programme = one<{ id: string }>("SELECT id FROM programmes WHERE slug = ?", [input.programme]);
  if (!programme) fields.programme = "Choose a valid programme.";

  let branchId: string | null = null;
  if (input.branch) {
    const branch = one<{ id: string }>("SELECT id FROM branches WHERE slug = ?", [input.branch]);
    if (!branch) fields.branch = "Choose a valid branch.";
    else branchId = branch.id;
  }

  let categoryId: string | null = null;
  if (input.category) {
    const category = one<{ id: string }>("SELECT id FROM categories WHERE slug = ?", [input.category]);
    if (!category) fields.category = "Choose a valid category.";
    else categoryId = category.id;
  }

  if (Object.keys(fields).length > 0) return fail("Please check the highlighted fields.", 422, fields);

  const reference = publicId("FRR");
  run(
    `INSERT INTO requests
       (id, public_id, university_id, programme_id, branch_id, semester, subject_name,
        subject_code, category_id, email, details)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      reference,
      university!.id,
      programme!.id,
      branchId,
      input.semester ?? null,
      input.subjectName,
      input.subjectCode || null,
      categoryId,
      input.email,
      input.details || null,
    ],
  );

  return ok(
    {
      reference,
      message:
        "Request received. It is now in the admin queue. We cannot promise a timeline, but requests guide what gets sourced next.",
    },
    201,
  );
}
