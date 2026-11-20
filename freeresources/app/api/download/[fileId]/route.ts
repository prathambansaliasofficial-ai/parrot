import { NextResponse } from "next/server";

import { run } from "@/lib/db";
import { getPublishedFile, safeFileName } from "@/lib/resource-files";
import { readStoredFile } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const file = getPublishedFile(fileId);
  if (!file) {
    return NextResponse.json({ error: "This file is not available." }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await readStoredFile(file.storageKey);
  } catch {
    return NextResponse.json(
      { error: "The stored file is missing. Please report this resource so an admin can fix it." },
      { status: 410 },
    );
  }

  run("INSERT INTO downloads (id, resource_id, file_id) VALUES (lower(hex(randomblob(16))), ?, ?)", [
    file.resourceId,
    file.fileId,
  ]);
  run("UPDATE resources SET download_count = download_count + 1 WHERE id = ?", [file.resourceId]);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": file.mimeType || "application/pdf",
      "Content-Length": String(buffer.byteLength),
      "Content-Disposition": `attachment; filename="${safeFileName(file.originalName)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
