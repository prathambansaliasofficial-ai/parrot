import { NextResponse } from "next/server";

import { getSuggestions } from "@/lib/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";
  const items = query.trim().length >= 2 ? getSuggestions(query) : [];
  return NextResponse.json(
    { items },
    { headers: { "Cache-Control": "private, max-age=15" } },
  );
}
