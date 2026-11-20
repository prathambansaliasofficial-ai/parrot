/**
 * Evidence-only document classification.
 *
 * The discovery query is a hint, never proof. This module looks at what the PDF
 * actually contains (scheme tables, subject-code density, unit headings, year
 * and semester headings) and decides what kind of academic document it is.
 *
 * Deliberately deterministic and dependency-free: it runs identically in the
 * Node worker, the Cloudflare worker and the audit scripts, and it can never
 * invent a subject that is not printed in the document.
 */

export const DOCUMENT_TYPES = [
  "complete_curriculum",
  "course_structure",
  "branch_syllabus",
  "semester_curriculum",
  "subject_syllabus",
  "academic_regulations",
  "notification",
  "unknown",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  complete_curriculum: "Complete curriculum (all years)",
  course_structure: "Course structure / scheme of teaching",
  branch_syllabus: "Branch-wise syllabus",
  semester_curriculum: "Semester-wise curriculum",
  subject_syllabus: "Subject-specific syllabus",
  academic_regulations: "Academic regulations / ordinance",
  notification: "Notification or circular",
  unknown: "Unclassified — needs administrator review",
};

export type DocumentEvidence = {
  documentType: DocumentType;
  coversSemesters: number[];
  subjectCodes: string[];
  unitCount: number;
  pageCount: number | null;
  /** 0–1: how strongly the content supports the classification. */
  confidence: number;
  evidence: string[];
};

/** AKTU subject codes: BCS301, AAS101E, KCS-301, ACS201 … */
const SUBJECT_CODE_RE = /\b([A-Z]{2,4})[-\s]?(\d{3})([A-Z])?\b/g;

const YEAR_SEMESTERS: { pattern: RegExp; semesters: number[] }[] = [
  { pattern: /\bfirst\s+year\b|\b1st\s+year\b/i, semesters: [1, 2] },
  { pattern: /\bsecond\s+year\b|\b2nd\s+year\b/i, semesters: [3, 4] },
  { pattern: /\bthird\s+year\b|\b3rd\s+year\b/i, semesters: [5, 6] },
  { pattern: /\bfourth\s+year\b|\b4th\s+year\b/i, semesters: [7, 8] },
];

const ROMAN: Record<string, number> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
  VII: 7,
  VIII: 8,
};

function normalise(text: string): string {
  return text.replace(/\s+/g, " ").replace(/[\u2010-\u2015]/g, "-");
}

function detectSemesters(text: string): number[] {
  const found = new Set<number>();
  let yearStated = false;
  for (const { pattern, semesters } of YEAR_SEMESTERS) {
    if (pattern.test(text)) {
      yearStated = true;
      semesters.forEach((semester) => found.add(semester));
    }
  }
  // A document that declares its year covers that year's two semesters. The
  // rest of the text mentions other semesters in passing (AICTE notes, lateral
  // entry rules), so those must not widen the claimed coverage.
  if (yearStated) return [...found].sort((a, b) => a - b);

  const explicit = /SEMESTER\s*-?\s*(VIII|VII|VI|IV|III|II|I|[1-8])\b/gi;
  for (const match of text.matchAll(explicit)) {
    const raw = match[1].toUpperCase();
    const value = /^\d$/.test(raw) ? Number(raw) : ROMAN[raw];
    if (value && value >= 1 && value <= 8) found.add(value);
  }
  return [...found].sort((a, b) => a - b);
}

export function subjectCodesIn(text: string): string[] {
  const codes = new Set<string>();
  for (const match of text.matchAll(SUBJECT_CODE_RE)) {
    const value = `${match[1]}${match[2]}${match[3] ?? ""}`;
    // Skip obvious non-codes (page numbers, years, marks columns).
    if (/^(PAGE|YEAR|TOTAL|TOTA|SEM|MAX)$/i.test(match[1])) continue;
    codes.add(value);
  }
  return [...codes].sort();
}

export function countUnitHeadings(text: string): number {
  const headings = new Set<number>();
  const regex = /\bUNIT\s*-?\s*(VIII|VII|VI|IV|III|II|I|[1-8])\b/gi;
  for (const match of text.matchAll(regex)) {
    const raw = match[1].toUpperCase();
    const value = /^\d$/.test(raw) ? Number(raw) : ROMAN[raw];
    if (value) headings.add(value);
  }
  return headings.size;
}

/**
 * Classifies a document from its extracted text. `pageCount` is the full
 * document page count even when only the first pages were sampled.
 */
export function classifyDocument(text: string, pageCount: number | null): DocumentEvidence {
  const body = normalise(text ?? "");
  const codes = subjectCodesIn(body);
  const unitCount = countUnitHeadings(body);
  const coversSemesters = detectSemesters(body);
  const evidence: string[] = [];

  const schemeTable =
    /\b(scheme of teaching|evaluation scheme|course structure|teaching and examination scheme)\b/i.test(body);
  const regulationOnly =
    /\b(academic regulations?|ordinance|examination ordinance)\b/i.test(body) &&
    !schemeTable &&
    codes.length < 4;
  const streamMention = /\bstream\b/i.test(body);
  const multiBranch =
    /\b(computer science|information technology|electronics|mechanical|electrical|civil)\b/gi.test(body);
  const pages = pageCount ?? null;

  if (schemeTable) evidence.push("Contains a scheme-of-teaching / course-structure table.");
  if (codes.length) evidence.push(`${codes.length} distinct subject code(s) printed in the document.`);
  if (unitCount) evidence.push(`${unitCount} unit heading(s) detected.`);
  if (coversSemesters.length) evidence.push(`Semester coverage detected: ${coversSemesters.join(", ")}.`);
  if (streamMention) evidence.push("Explicitly refers to a programme stream.");

  const decide = (type: DocumentType, confidence: number): DocumentEvidence => ({
    documentType: type,
    coversSemesters,
    subjectCodes: codes,
    unitCount,
    pageCount: pages,
    confidence,
    evidence,
  });

  if (!body.trim() && pages === null) return decide("unknown", 0);
  if ((pages !== null && pages <= 2) && codes.length === 0 && !schemeTable) {
    evidence.push("Two pages or fewer with no subject codes: a circular, not a curriculum.");
    return decide("notification", 0.7);
  }
  if (regulationOnly) return decide("academic_regulations", 0.75);

  // A stream-wide scheme table with many subject codes is a course structure,
  // regardless of which subject the acquisition query mentioned.
  if (schemeTable && codes.length >= 8) {
    const yearSpan = coversSemesters.length >= 5 ? "complete_curriculum" : "course_structure";
    const confidence = codes.length >= 15 ? 0.95 : 0.85;
    if (multiBranch) evidence.push("Lists multiple branches/subjects in one scheme.");
    return decide(yearSpan, confidence);
  }

  if (schemeTable && codes.length >= 3) {
    return decide(coversSemesters.length <= 2 ? "semester_curriculum" : "branch_syllabus", 0.75);
  }

  // A single subject code with unit headings is a subject-specific syllabus.
  if (codes.length === 1 && unitCount >= 3) return decide("subject_syllabus", 0.9);
  if (codes.length === 0 && unitCount >= 3) {
    evidence.push("Unit headings but no printed subject code; the subject must be confirmed by a human.");
    return decide("subject_syllabus", 0.5);
  }
  if (codes.length >= 2 && unitCount >= 3) return decide("branch_syllabus", 0.7);

  evidence.push("Not enough printed structure to classify automatically.");
  return decide("unknown", 0.2);
}

/** Human-readable one-line summary, used in admin lists and audit output. */
export function describeEvidence(result: DocumentEvidence): string {
  const parts = [
    DOCUMENT_TYPE_LABELS[result.documentType],
    result.coversSemesters.length ? `semesters ${result.coversSemesters.join(", ")}` : "semester unknown",
    `${result.subjectCodes.length} subject code(s)`,
  ];
  return `${parts.join(" · ")} (confidence ${Math.round(result.confidence * 100)}%)`;
}
