/**
 * Deterministic document naming.
 *
 * Display filenames are academic metadata, never storage identifiers: objects are
 * addressed by content hash in the storage layer.
 */

export type NamingInput = {
  university?: string | null;
  programme?: string | null;
  branch?: string | null;
  semester?: number | null;
  subject?: string | null;
  kind?: string | null;
  year?: string | null;
  extension?: string;
};

function token(value: string | null | undefined, fallback: string): string {
  const clean = (value ?? "")
    .toUpperCase()
    .normalize("NFKD")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || fallback;
}

function shortCode(value: string | null | undefined, fallback: string, exclude: string[] = []): string {
  const clean = token(value, fallback);
  // Slugs carry context that is already in the filename: "aktu-btech-cse" must
  // become CSE, not ABC, while "computer-science-engineering" becomes CSE too.
  const skip = new Set(exclude.map((entry) => token(entry, "")).filter(Boolean));
  const words = clean.split("-").filter((word) => word && !skip.has(word));
  const kept = words.length ? words : clean.split("-");
  if (kept.length === 1) return kept[0].length <= 6 ? kept[0] : kept[0].slice(0, 5);
  return kept.map((word) => word[0]).join("").slice(0, 5);
}

export function buildDocumentName(input: NamingInput): string {
  const parts = [
    token(input.university, "UNIVERSITY"),
    shortCode(input.programme, "PROGRAMME", [input.university ?? ""]),
    shortCode(input.branch, "COMMON", [input.university ?? "", input.programme ?? ""]),
    input.semester ? `SEM${input.semester}` : null,
    token(input.subject, "SUBJECT"),
    token(input.kind, "DOCUMENT"),
    input.year ? token(input.year, "") : null,
  ].filter(Boolean) as string[];

  const extension = (input.extension ?? "pdf").replace(/^\./, "").toLowerCase();
  return `${parts.join("_")}.${extension}`;
}

/** Keeps an admin-edited filename safe while preserving the extension. */
export function sanitizeFilename(name: string): string {
  const trimmed = name.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").slice(0, 160);
  if (!trimmed) return "document.pdf";
  return /\.pdf$/i.test(trimmed) ? trimmed : `${trimmed}.pdf`;
}
