import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { PDFDocument } from "pdf-lib";

import { COMPRESSION_PROFILES, type CompressionProfile } from "./types";

/**
 * PDF validation, hashing, text extraction and derivative compression.
 *
 * Validation and page counts use pdf-lib. Text extraction uses pdf.js in a
 * server-only code path. Compression shells out to Ghostscript when it is
 * installed; when it is not, the stage reports "unavailable" instead of
 * pretending a derivative was produced.
 */

export type PdfInspection = {
  valid: boolean;
  pageCount: number | null;
  encrypted: boolean;
  riskyMarkers: string[];
  reason?: string;
};

export function sha256(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

const RISKY_MARKERS = ["/JavaScript", "/JS", "/Launch", "/OpenAction", "/EmbeddedFile", "/RichMedia", "/URI"];

export async function inspectPdf(bytes: Buffer): Promise<PdfInspection> {
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    return { valid: false, pageCount: null, encrypted: false, riskyMarkers: [], reason: "Missing PDF signature." };
  }
  const latin = bytes.subarray(0, Math.min(bytes.length, 2_000_000)).toString("latin1");
  const riskyMarkers = RISKY_MARKERS.filter((marker) => latin.includes(marker));
  let encrypted = false;
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    encrypted = doc.isEncrypted;
    return { valid: true, pageCount: doc.getPageCount(), encrypted, riskyMarkers };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unreadable PDF.";
    return { valid: false, pageCount: null, encrypted, riskyMarkers, reason: message };
  }
}

type PdfjsTextItem = { str?: string };
type PdfjsPage = { getTextContent(): Promise<{ items: PdfjsTextItem[] }> };
type PdfjsDocument = { numPages: number; getPage(n: number): Promise<PdfjsPage>; destroy(): Promise<void> };
type PdfjsModule = {
  getDocument(options: Record<string, unknown>): {
    promise: Promise<PdfjsDocument>;
    destroy(): Promise<void>;
  };
};

/** Extracts text so the classification stage can read the document offline. */
export async function extractText(bytes: Buffer, maxPages = 120, maxChars = 200_000): Promise<string> {
  const modulePath = "pdfjs-dist/legacy/build/pdf.mjs";
  const pdfjs = (await import(/* webpackIgnore: true */ modulePath)) as PdfjsModule;
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  const doc = await loadingTask.promise;
  try {
    const pages = Math.min(doc.numPages, maxPages);
    const parts: string[] = [];
    let total = 0;
    for (let pageNo = 1; pageNo <= pages; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) => item.str ?? "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      if (!text) continue;
      parts.push(`[page ${pageNo}] ${text}`);
      total += text.length;
      if (total >= maxChars) break;
    }
    return parts.join("\n").slice(0, maxChars);
  } finally {
    await loadingTask.destroy().catch(() => undefined);
  }
}

/* -------------------------------------------------------------- ghostscript */

let gsChecked = false;
let gsBinary: string | null = null;

export function ghostscriptBinary(): string | null {
  if (gsChecked) return gsBinary;
  gsChecked = true;
  const candidates = ["gs", "gswin64c", "gswin32c"];
  if (process.env.GHOSTSCRIPT_BIN) candidates.unshift(process.env.GHOSTSCRIPT_BIN);
  // Project-local install used in development (see scripts/install-ghostscript.ps1).
  candidates.push(
    path.join(process.cwd(), ".tools", "gs", "bin", "gswin64c.exe"),
    "C:\\Program Files\\gs\\bin\\gswin64c.exe",
  );
  for (const candidate of candidates) {
    try {
      if (candidate.includes("\\") && !fs.existsSync(candidate)) continue;
      const result = spawnSync(candidate, ["--version"], { timeout: 10_000, encoding: "utf8" });
      if (result.status === 0) {
        gsBinary = candidate;
        break;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return gsBinary;
}

export type CompressionResult =
  | {
      status: "optimized";
      bytes: Buffer;
      sizeBytes: number;
      pageCount: number;
      savingPercent: number;
      profile: CompressionProfile;
      note: string;
    }
  | {
      status: "skipped" | "unavailable" | "failed";
      profile: CompressionProfile;
      reason: string;
    };

/**
 * Produces a separate optimised derivative. The original bytes are never
 * modified. A derivative is only accepted when it opens, preserves the page
 * count, and is genuinely smaller than the original.
 */
export async function compressPdf(
  input: Buffer,
  profile: CompressionProfile,
  originalPageCount: number | null,
): Promise<CompressionResult> {
  const binary = ghostscriptBinary();
  if (!binary) {
    return {
      status: "unavailable",
      profile,
      reason: "Ghostscript is not installed on this machine; the original was kept as the serving version.",
    };
  }

  const settings = COMPRESSION_PROFILES[profile];
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "fr-pdf-"));
  const inputPath = path.join(dir, "input.pdf");
  const outputPath = path.join(dir, "output.pdf");

  try {
    await fs.promises.writeFile(inputPath, input);
    const args = [
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.5",
      `-dPDFSETTINGS=${settings.gsPreset}`,
      "-dNOPAUSE",
      "-dQUIET",
      "-dBATCH",
      "-dDetectDuplicateImages=true",
      `-dColorImageResolution=${settings.dpi}`,
      `-dGrayImageResolution=${settings.dpi}`,
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];
    const result = spawnSync(binary, args, { timeout: 180_000, encoding: "utf8" });
    if (result.status !== 0 || !fs.existsSync(outputPath)) {
      return { status: "failed", profile, reason: (result.stderr || "Ghostscript failed.").slice(0, 500) };
    }

    const output = await fs.promises.readFile(outputPath);
    const check = await inspectPdf(output);
    if (!check.valid) {
      return { status: "failed", profile, reason: "The optimised PDF could not be opened; the original was kept." };
    }
    if (originalPageCount !== null && check.pageCount !== originalPageCount) {
      return {
        status: "failed",
        profile,
        reason: `Page count changed (${originalPageCount} → ${check.pageCount}); the original was kept.`,
      };
    }
    if (output.byteLength >= input.byteLength) {
      return { status: "skipped", profile, reason: "Optimisation did not reduce the file size; the original was kept." };
    }

    return {
      status: "optimized",
      bytes: output,
      sizeBytes: output.byteLength,
      pageCount: check.pageCount ?? 0,
      savingPercent: Math.round((1 - output.byteLength / input.byteLength) * 1000) / 10,
      profile,
      note: `${COMPRESSION_PROFILES[profile].label} · ${settings.gsPreset}`,
    };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
