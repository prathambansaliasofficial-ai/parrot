import { NextResponse } from "next/server";

import { destroySession } from "@/lib/auth";
import { guardOrigin } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const blocked = guardOrigin(request);
  if (blocked) return blocked;

  await destroySession();

  const accepts = request.headers.get("accept") ?? "";
  if (accepts.includes("text/html")) {
    // Progressive-enhancement path for the no-JS header/menu form.
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
