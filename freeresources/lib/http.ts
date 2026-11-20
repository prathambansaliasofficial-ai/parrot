import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

import { getCurrentUser, type SessionUser } from "./auth";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(message: string, status = 400, fields?: Record<string, string>) {
  return NextResponse.json({ error: message, fields }, { status, headers: { "Cache-Control": "no-store" } });
}

export function zodFields(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Rejects cross-site browser writes. Non-browser clients without Origin are allowed. */
export function guardOrigin(request: Request): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const allowed = new Set(
    [process.env.NEXT_PUBLIC_SITE_URL, process.env.APP_URL]
      .filter(Boolean)
      .map((value) => value!.replace(/\/$/, "")),
  );
  const host = request.headers.get("host");
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (!allowed.has(origin.replace(/\/$/, ""))) {
    return fail("Request blocked: origin not allowed.", 403);
  }
  return null;
}

export function clientIp(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

const buckets = new Map<string, { count: number; resetAt: number }>();

/** Small in-process rate limiter for public write endpoints. */
export function rateLimit(key: string, limit = 8, windowMs = 60_000): NextResponse | null {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return null;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return fail("Too many submissions from this address. Please try again in a minute.", 429);
  }
  return null;
}

export async function parseJson<T>(request: Request, schema: ZodType<T>): Promise<
  { data: T; error: null } | { data: null; error: NextResponse }
> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { data: null, error: fail("Expected a JSON request body.", 400) };
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { data: null, error: fail("Please check the highlighted fields.", 422, zodFields(parsed.error)) };
  }
  return { data: parsed.data, error: null };
}

export async function apiUser(): Promise<SessionUser | null> {
  return getCurrentUser();
}

export async function requireAdminApi(): Promise<{ user: SessionUser; error: null } | { user: null; error: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) return { user: null, error: fail("You must be signed in.", 401) };
  if (user.role !== "admin") return { user: null, error: fail("Administrator access required.", 403) };
  return { user, error: null };
}
