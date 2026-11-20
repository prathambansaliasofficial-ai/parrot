import { z } from "zod";

import { one, run } from "@/lib/db";
import { clientIp, fail, guardOrigin, ok, rateLimit, zodFields } from "@/lib/http";
import { publicId } from "@/lib/format";

export const runtime = "nodejs";

const CATEGORIES = [
  "broken-download",
  "incorrect-resource",
  "missing-resource",
  "copyright",
  "technical-issue",
  "general-enquiry",
  "business-enquiry",
] as const;

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  category: z.enum(CATEGORIES),
  subject: z.string().trim().min(3, "Add a short subject line.").max(140),
  message: z.string().trim().min(10, "Describe the issue in a little more detail.").max(2000),
  resourceId: z.string().trim().optional(),
});

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;
  const limited = rateLimit(`support:${clientIp(request)}`, 6, 60_000);
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

  let resourceId: string | null = null;
  if (input.resourceId) {
    const resource = one<{ id: string }>("SELECT id FROM resources WHERE id = ?", [input.resourceId]);
    if (resource) resourceId = resource.id;
  }

  const reference = publicId("FRT");
  run(
    `INSERT INTO tickets (id, public_id, name, email, category, subject, message, resource_id)
     VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)`,
    [reference, input.name, input.email, input.category, input.subject, input.message, resourceId],
  );

  return ok(
    {
      reference,
      message:
        "Ticket created. Keep this reference number. Replies go to the email you provided; copyright reports are prioritised.",
    },
    201,
  );
}
