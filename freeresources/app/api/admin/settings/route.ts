import { run } from "@/lib/db";
import { recordAudit } from "@/lib/admin";
import { fail, guardOrigin, ok, requireAdminApi } from "@/lib/http";

export const runtime = "nodejs";

const ALLOWED: Record<string, number> = {
  home_headline: 120,
  home_subhead: 320,
};

export async function PATCH(request: Request) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON request body.", 400);
  }
  if (!body || typeof body !== "object") return fail("Invalid request body.", 400);

  const updates: [string, string][] = [];
  for (const [key, max] of Object.entries(ALLOWED)) {
    const raw = (body as Record<string, unknown>)[key];
    if (typeof raw !== "string") return fail(`Missing value for ${key}.`, 422);
    const value = raw.trim();
    if (!value) return fail("Homepage copy cannot be empty.", 422);
    if (value.length > max) return fail(`${key.replace(/_/g, " ")} is too long (max ${max}).`, 422);
    updates.push([key, value]);
  }

  for (const [key, value] of updates) {
    run(
      `INSERT INTO site_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }

  recordAudit(auth.user.id, "update", "site_settings", null, updates.map(([key]) => key).join(","));
  return ok({ message: "Settings saved." });
}
