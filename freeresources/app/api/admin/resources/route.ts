import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/admin";
import { saveResourceFromForm } from "@/lib/admin-resources";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart form submission.", 400);
  }

  const result = await saveResourceFromForm(form, { userId: auth.user.id });
  if (!result.ok) return NextResponse.json({ error: result.message, fields: result.fields }, { status: result.status });

  recordAudit(auth.user.id, "create", "resources", result.id, result.slug);
  return ok({ id: result.id, slug: result.slug, message: "Resource saved." }, 201);
}
