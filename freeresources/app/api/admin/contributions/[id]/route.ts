import { NextResponse } from "next/server";

import { reviewContribution } from "@/lib/admin-contributions";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const { id } = await params;
  let body: { action?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON request body.", 400);
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return fail("Choose approve or reject.", 400);
  }

  const notes = typeof body.notes === "string" ? body.notes : "";
  if (notes.length > 1000) return fail("Review notes are too long.", 422);

  const result = await reviewContribution(id, body.action, notes, auth.user.id);
  if (!result.ok) return fail(result.message, result.status);

  return ok({
    status: result.status,
    resourceId: result.resourceId,
    resourceSlug: result.resourceSlug,
    message: result.status === "approved" ? "Contribution published." : "Contribution rejected.",
  });
}
