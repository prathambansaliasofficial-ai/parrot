import { one, run } from "@/lib/db";
import { recordAudit } from "@/lib/admin";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

const STATUSES = ["new", "in_progress", "fulfilled", "closed"];

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const { id } = await params;
  let body: { status?: unknown; notes?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON request body.", 400);
  }

  const status = typeof body.status === "string" ? body.status : "";
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!STATUSES.includes(status)) return fail("Choose a valid request status.", 422);
  if (notes.length > 2000) return fail("Notes are too long.", 422);

  const existing = one<{ id: string }>(`SELECT id FROM requests WHERE id = ?`, [id]);
  if (!existing) return fail("Request not found.", 404);

  run(`UPDATE requests SET status = ?, admin_notes = ? WHERE id = ?`, [status, notes || null, id]);
  recordAudit(auth.user.id, "update", "requests", id, status);
  return ok({ message: "Request updated." });
}
