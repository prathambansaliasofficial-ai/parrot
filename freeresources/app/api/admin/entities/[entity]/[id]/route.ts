import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/admin";
import { deleteEntity, saveEntity } from "@/lib/admin-write";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

type Params = { params: Promise<{ entity: string; id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const { entity, id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON request body.", 400);
  }
  if (!body || typeof body !== "object") return fail("Invalid request body.", 400);

  const result = saveEntity(entity, body as Record<string, unknown>, id);
  if (!result.ok) return NextResponse.json({ error: result.message, fields: result.fields }, { status: result.status });

  recordAudit(auth.user.id, "update", entity, id);
  return ok({ id, message: "Changes saved." });
}

export async function DELETE(request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const { entity, id } = await params;
  const result = deleteEntity(entity, id);
  if (!result.ok) return fail(result.message, result.status);

  recordAudit(auth.user.id, "delete", entity, id);
  return ok({ message: "Deleted." });
}
