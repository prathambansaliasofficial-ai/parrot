import { getContributionFile } from "@/lib/admin-contributions";
import { fail, requireAdminApi } from "@/lib/http";
import { readStoredFile } from "@/lib/storage";
import { safeFileName } from "@/lib/resource-files";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi();
  if (auth.error) return auth.error;

  const { id } = await params;
  const file = getContributionFile(id);
  if (!file) return fail("Contribution not found.", 404);

  try {
    const bytes = await readStoredFile(file.file_path);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(bytes.byteLength),
        "Content-Disposition": `inline; filename="${safeFileName(file.file_name)}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return fail("The submitted file is missing from storage.", 404);
  }
}
