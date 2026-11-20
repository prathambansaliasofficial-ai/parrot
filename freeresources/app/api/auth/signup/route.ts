import { randomUUID } from "node:crypto";
import { z } from "zod";

import { createSession, hashPassword } from "@/lib/auth";
import { one, run } from "@/lib/db";
import { clientIp, fail, guardOrigin, ok, parseJson, rateLimit } from "@/lib/http";

export const runtime = "nodejs";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(100),
});

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const limited = rateLimit(`signup:${clientIp(request)}`, 5, 60_000);
  if (limited) return limited;

  const parsed = await parseJson(request, schema);
  if (parsed.error) return parsed.error;
  const { name, email, password } = parsed.data;

  const existing = one<{ id: string }>("SELECT id FROM users WHERE email = ?", [email]);
  if (existing) return fail("An account with this email already exists. Try logging in.", 409, { email: "Email already registered." });

  const id = randomUUID();
  run("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, 'student')", [
    id,
    email,
    name,
    hashPassword(password),
  ]);
  await createSession(id);

  return ok({ user: { id, email, name, role: "student" } }, 201);
}
