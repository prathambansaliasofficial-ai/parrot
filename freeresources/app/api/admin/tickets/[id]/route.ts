import { one, run } from "@/lib/db";
import { recordAudit } from "@/lib/admin";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

const STATUSES = ["open", "in_progress", "resolved", "closed"];

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
  const reply = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!STATUSES.includes(status)) return fail("Choose a valid ticket status.", 422);
  if (reply.length > 2000) return fail("Reply is too long.", 422);

  const existing = one<{ id: string }>(`SELECT id FROM tickets WHERE id = ?`, [id]);
  if (!existing) return fail("Ticket not found.", 404);

  run(`UPDATE tickets SET status = ?, admin_reply = ?, updated_at = datetime('now') WHERE id = ?`, [
    status,
    reply || null,
    id,
  ]);
  recordAudit(auth.user.id, "update", "tickets", id, status);
  return ok({ message: "Ticket updated." });
}
