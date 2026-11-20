import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/admin";
import { deleteResource, saveResourceFromForm } from "@/lib/admin-resources";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const { id } = await params;
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Expected a multipart form submission.", 400);
  }

  const result = await saveResourceFromForm(form, { id, userId: auth.user.id });
  if (!result.ok) return NextResponse.json({ error: result.message, fields: result.fields }, { status: result.status });

  recordAudit(auth.user.id, "update", "resources", id, result.slug);
  return ok({ id, slug: result.slug, message: "Resource updated." });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const { id } = await params;
  const result = await deleteResource(id);
  if (!result.ok) return fail(result.message, result.status);

  recordAudit(auth.user.id, "delete", "resources", id, result.slug);
  return ok({ message: "Resource deleted." });
}
