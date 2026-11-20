import { one } from "@/lib/db";
import { recordAudit } from "@/lib/admin";
import { deleteResourceFile } from "@/lib/admin-resources";
import { fail, ok, requireAdminApi } from "@/lib/http";
import { readStoredFile, UploadError } from "@/lib/storage";
import { safeFileName } from "@/lib/resource-files";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { id, fileId } = await params;
  const file = one<{ storage_key: string; original_name: string; mime_type: string }>(
    `SELECT storage_key, original_name, mime_type FROM resource_files WHERE id = ? AND resource_id = ?`,
    [fileId, id],
  );
  if (!file) return fail("File not found.", 404);

  try {
    const bytes = await readStoredFile(file.storage_key);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": file.mime_type,
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${safeFileName(file.original_name)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return fail("The stored file is missing from disk.", 404);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { id, fileId } = await params;
  const result = await deleteResourceFile(id, fileId);
  if (!result.ok) return fail(result.message, result.status);
  recordAudit(auth.user.id, "delete_file", "resources", id, fileId);
  return ok({ message: "File removed." });
}
