import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const STORAGE_DIR = process.env.STORAGE_DIR
  ? path.resolve(process.env.STORAGE_DIR)
  : // Vercel serves from a read-only filesystem; /tmp is the only writable path.
    process.env.VERCEL
    ? path.join("/tmp", "freeresources-storage")
    : path.join(process.cwd(), "storage", "uploads");

const MAX_BYTES = Number(process.env.MAX_UPLOAD_MB || 20) * 1024 * 1024;

export type StoredFile = {
  storageKey: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
};

export class UploadError extends Error {}

function safeName(name: string): string {
  return name.replace(/[^\w.\- ]+/g, "_").slice(-120);
}

/**
 * Validates and stores an uploaded PDF. Only the generated key is persisted;
 * the original filename is stored as metadata.
 */
export async function savePdfUpload(file: File | null): Promise<StoredFile> {
  if (!file || typeof file === "string" || file.size === 0) {
    throw new UploadError("Attach a PDF file.");
  }
  if (file.size > MAX_BYTES) {
    throw new UploadError(`File is too large. Maximum size is ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`);
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const isPdfMagic = bytes.subarray(0, 5).toString("latin1") === "%PDF-";
  const extension = path.extname(file.name).toLowerCase();
  if (!isPdfMagic || (extension !== ".pdf" && file.type !== "application/pdf")) {
    throw new UploadError("Only PDF files are accepted. Export your document as PDF and try again.");
  }

  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const storageKey = `${randomUUID()}.pdf`;
  await fs.writeFile(path.join(STORAGE_DIR, storageKey), bytes);

  return {
    storageKey,
    originalName: safeName(file.name) || "resource.pdf",
    mimeType: "application/pdf",
    sizeBytes: bytes.byteLength,
  };
}

/**
 * Stores already-validated PDF bytes in the public file store. Used when an
 * acquired document is approved and becomes part of the served library.
 */
export async function storePdfBuffer(bytes: Buffer, originalName: string): Promise<StoredFile> {
  if (bytes.byteLength === 0) throw new UploadError("The file is empty.");
  if (bytes.byteLength > MAX_BYTES) {
    throw new UploadError(`File is too large. Maximum size is ${Math.round(MAX_BYTES / (1024 * 1024))} MB.`);
  }
  if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new UploadError("Only PDF files can be stored in the library.");
  }

  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const storageKey = `${randomUUID()}.pdf`;
  await fs.writeFile(path.join(STORAGE_DIR, storageKey), bytes);

  return {
    storageKey,
    originalName: safeName(originalName) || "resource.pdf",
    mimeType: "application/pdf",
    sizeBytes: bytes.byteLength,
  };
}

export function resolveStoredFile(storageKey: string): string {
  const target = path.resolve(STORAGE_DIR, storageKey);
  if (!target.startsWith(path.resolve(STORAGE_DIR) + path.sep)) {
    throw new UploadError("Invalid file reference.");
  }
  return target;
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return fs.readFile(resolveStoredFile(storageKey));
}

export async function duplicateStoredFile(
  storageKey: string,
  originalName: string,
  mimeType = "application/pdf",
): Promise<StoredFile> {
  const source = resolveStoredFile(storageKey);
  const nextKey = `${randomUUID()}.pdf`;
  const target = resolveStoredFile(nextKey);
  await fs.copyFile(source, target);
  const stat = await fs.stat(target);
  return {
    storageKey: nextKey,
    originalName: safeName(originalName) || "resource.pdf",
    mimeType,
    sizeBytes: stat.size,
  };
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  try {
    await fs.unlink(resolveStoredFile(storageKey));
  } catch {
    // Already gone — nothing to do.
  }
}

export function maxUploadMb(): number {
  return Math.round(MAX_BYTES / (1024 * 1024));
}
