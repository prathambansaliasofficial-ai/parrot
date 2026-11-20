import { NextResponse } from "next/server";

import { getPublishedFile, parseRange, safeFileName } from "@/lib/resource-files";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const file = getPublishedFile(fileId);
  if (!file) {
    return NextResponse.json({ error: "This file is not available." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(file.storageKey);
  } catch {
    return NextResponse.json({ error: "The stored file is missing." }, { status: 410 });
  }

  const range = parseRange(request.headers.get("range"), buffer.byteLength);
  const headers: Record<string, string> = {
    "Content-Type": file.mimeType || "application/pdf",
    "Content-Disposition": `inline; filename="${safeFileName(file.originalName)}"`,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=60",
    "X-Content-Type-Options": "nosniff",
  };

  if (range) {
    const chunk = buffer.subarray(range.start, range.end + 1);
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${range.start}-${range.end}/${buffer.byteLength}`,
        "Content-Length": String(chunk.byteLength),
      },
    });
  }

  return new NextResponse(new Uint8Array(buffer), {
    headers: { ...headers, "Content-Length": String(buffer.byteLength) },
  });
}
