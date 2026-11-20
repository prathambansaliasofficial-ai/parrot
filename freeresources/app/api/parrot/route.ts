import { NextResponse } from "next/server";

import { clientIp, fail, guardOrigin, rateLimit } from "@/lib/http";

export const runtime = "nodejs";

// PARROT_API_BASE_URL wins locally; on Vercel the backend service binding
// injects BACKEND_URL, which is the same FastAPI app the tutor endpoints live in.
const BASE = (
  process.env.PARROT_API_BASE_URL ||
  process.env.BACKEND_URL ||
  "http://localhost:8000"
).replace(/\/$/, "");

const PATHS: Record<string, string> = {
  message: "/api/v1/tutor/message",
  answer: "/api/v1/tutor/quiz/answer",
  evaluate: "/api/v1/tutor/evaluate",
};

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  const limited = rateLimit(`parrot:${clientIp(request)}`, 30, 60_000);
  if (limited) return limited;

  let body: { action?: unknown; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("Expected a JSON request body.", 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const endpoint = PATHS[action];
  if (!endpoint) return fail("Unknown Parrot action.", 400);
  if (!body.payload || typeof body.payload !== "object") return fail("Missing Parrot request payload.", 400);

  const serialized = JSON.stringify(body.payload);
  if (serialized.length > 20_000) return fail("That message is too long.", 413);

  try {
    const response = await fetch(`${BASE}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: serialized,
      cache: "no-store",
      signal: AbortSignal.timeout(25_000),
    });
    const data = await response.json().catch(() => null);
    if (!data) return fail("Parrot AI returned an invalid response.", 502);
    return NextResponse.json(data, {
      status: response.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return fail(
      "Parrot AI is not reachable right now. Start the tutor API on port 8000 and try again.",
      503,
    );
  }
}
