import { one } from "@/lib/db";
import { fail, requireAdminApi } from "@/lib/http";
import { storage } from "@/lib/acquisition/storage";

export const runtime = "nodejs";

/**
 * Streams one stored document version to an authenticated administrator.
 * Nothing is served from the private acquisition store without this check.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ versionId: string }> },
) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { versionId } = await params;
  const version = one<{ storage_key: string; kind: string; asset_id: string }>(
    "SELECT storage_key, kind, asset_id FROM document_versions WHERE id = ?",
    [versionId],
  );
  if (!version) return fail("Document version not found.", 404);

  const asset = one<{ original_filename: string }>(
    "SELECT original_filename FROM document_assets WHERE id = ?",
    [version.asset_id],
  );

  let bytes: Buffer;
  try {
    bytes = await storage().get(version.storage_key);
  } catch {
    return fail("The stored object is missing.", 410);
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const filename = `${version.kind === "optimized" ? "optimized-" : ""}${asset?.original_filename ?? "document.pdf"}`;

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename.replace(/[^\w.\-]/g, "_")}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
