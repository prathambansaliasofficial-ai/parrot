import { z } from "zod";

import { createSession, verifyPassword } from "@/lib/auth";
import { one } from "@/lib/db";
import { clientIp, fail, guardOrigin, ok, parseJson, rateLimit } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const limited = rateLimit(`login:${clientIp(request)}`, 10, 60_000);
  if (limited) return limited;

  const parsed = await parseJson(request, schema);
  if (parsed.error) return parsed.error;
  const { email, password } = parsed.data;

  const user = one<{ id: string; email: string; name: string; role: "student" | "admin"; password_hash: string }>(
    "SELECT id, email, name, role, password_hash FROM users WHERE email = ?",
    [email],
  );
  if (!user || !verifyPassword(password, user.password_hash)) {
    return fail("Email or password is incorrect.", 401);
  }

  await createSession(user.id);
  return ok({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
}
