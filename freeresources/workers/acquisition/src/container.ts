/**
 * PDF processing client.
 *
 * Ghostscript runs in a Cloudflare Container, which lives in its own Worker
 * (`workers/pdf-container`). The acquisition Worker reaches it through a
 * service binding, so this Worker starts and runs (D1, R2, Queues, Workflows)
 * even where Containers are unavailable — it then reports the capability as
 * missing instead of failing to boot.
 */
import type { Env } from "./types";

export type ContainerResult =
  | {
      ok: true;
      pageCount: number;
      text: string;
      textChars: number;
      compressed: Uint8Array | null;
      compressedPageCount: number | null;
      savingPercent: number | null;
      ghostscript: string | null;
      profile: string;
      notes: string[];
    }
  | { ok: false; reason: string };

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function containerAvailable(env: Env): boolean {
  return Boolean(env.PDF_PROCESSOR);
}

export async function processPdfInContainer(
  env: Env,
  bytes: Uint8Array,
  profile: string,
): Promise<ContainerResult> {
  if (!env.PDF_PROCESSOR) {
    return {
      ok: false,
      reason:
        "No PDF_PROCESSOR service binding. Deploy workers/pdf-container and bind it (requires a Workers paid plan with Containers).",
    };
  }
  try {
    const response = await env.PDF_PROCESSOR.fetch("https://pdf-container/process", {
      method: "POST",
      headers: { "content-type": "application/pdf", "x-compression-profile": profile },
      body: bytes,
    });
    if (!response.ok) {
      return { ok: false, reason: `Container returned HTTP ${response.status}: ${(await response.text()).slice(0, 300)}` };
    }
    const payload = (await response.json()) as {
      pageCount: number;
      text: string;
      compressedBase64: string | null;
      compressedPageCount: number | null;
      savingPercent: number | null;
      ghostscript: string | null;
      notes?: string[];
    };
    return {
      ok: true,
      pageCount: payload.pageCount,
      text: payload.text ?? "",
      textChars: (payload.text ?? "").length,
      compressed: payload.compressedBase64 ? decodeBase64(payload.compressedBase64) : null,
      compressedPageCount: payload.compressedPageCount,
      savingPercent: payload.savingPercent,
      ghostscript: payload.ghostscript,
      profile,
      notes: payload.notes ?? [],
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : "Container request failed." };
  }
}
