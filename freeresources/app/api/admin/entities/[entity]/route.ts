import { NextResponse } from "next/server";

import { recordAudit } from "@/lib/admin";
import { saveEntity } from "@/lib/admin-write";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ entity: string }> }) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const { entity } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON request body.", 400);
  }
  if (!body || typeof body !== "object") return fail("Invalid request body.", 400);

  const result = saveEntity(entity, body as Record<string, unknown>);
  if (!result.ok) return NextResponse.json({ error: result.message, fields: result.fields }, { status: result.status });

  recordAudit(auth.user.id, "create", entity, result.id, String((body as Record<string, unknown>).name ?? (body as Record<string, unknown>).title ?? ""));
  return ok({ id: result.id, message: "Saved." }, 201);
}
