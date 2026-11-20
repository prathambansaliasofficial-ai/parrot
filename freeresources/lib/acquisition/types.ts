/**
 * Shared vocabulary for the acquisition pipeline. Kept framework-free so the
 * worker (Node) and the admin UI (Next) agree on stage names and ordering.
 */

export const STAGES = [
  "discovering",
  "candidate_found",
  "source_evaluation",
  "awaiting_selection",
  "selected",
  "downloading",
  "validating",
  "safety_check",
  "text_extraction",
  "ai_classification",
  "duplicate_check",
  "optimization",
  "naming",
  "metadata",
  "awaiting_approval",
  "uploading",
  "indexing",
  "publishing",
  "completed",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  discovering: "Discovering",
  candidate_found: "Candidate found",
  source_evaluation: "Source evaluation",
  awaiting_selection: "Awaiting selection",
  selected: "Selected",
  downloading: "Downloading",
  validating: "File validation",
  safety_check: "Safety check",
  text_extraction: "Text extraction",
  ai_classification: "AI classification",
  duplicate_check: "Duplicate detection",
  optimization: "PDF optimisation",
  naming: "Automatic naming",
  metadata: "Metadata assignment",
  awaiting_approval: "Awaiting approval",
  uploading: "Uploading to storage",
  indexing: "Database indexing",
  publishing: "Publishing",
  completed: "Completed",
};

export const STATES = [
  "queued",
  "running",
  "paused",
  "cancelled",
  "failed",
  "retry_scheduled",
  "needs_review",
  "rejected",
  "skipped",
  "awaiting_approval",
  "completed",
] as const;

export type JobState = (typeof STATES)[number];

export const STATE_LABELS: Record<JobState, string> = {
  queued: "Queued",
  running: "Running",
  paused: "Paused",
  cancelled: "Cancelled",
  failed: "Failed",
  retry_scheduled: "Retry scheduled",
  needs_review: "Needs manual review",
  rejected: "Rejected",
  skipped: "Skipped",
  awaiting_approval: "Awaiting admin approval",
  completed: "Completed",
};

export function stageIndex(stage: Stage): number {
  return STAGES.indexOf(stage);
}

export function nextStage(stage: Stage): Stage {
  return STAGES[Math.min(stageIndex(stage) + 1, STAGES.length - 1)];
}

/** Stages that wait for a human decision and are never picked up by the worker. */
export const HOLD_STAGES: Stage[] = ["awaiting_selection", "awaiting_approval"];

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

export function isTerminal(state: string): boolean {
  return ["completed", "cancelled", "rejected", "failed"].includes(state);
}

export const COMPRESSION_PROFILES = {
  /** Default for born-digital academic PDFs (text plus a few diagrams). */
  balanced: { label: "Standard academic PDF", gsPreset: "/ebook", dpi: 150 },
  /** Scanned syllabi: keep image resolution high enough to stay readable. */
  scanned: { label: "Image-heavy scanned PDF", gsPreset: "/ebook", dpi: 220 },
  /** Preservation profile: mild downsampling only. */
  archive: { label: "High-quality preservation", gsPreset: "/printer", dpi: 300 },
  economy: { label: "Economy (smallest usable)", gsPreset: "/screen", dpi: 110 },
} as const;

export type CompressionProfile = keyof typeof COMPRESSION_PROFILES;

export function isProfile(value: string): value is CompressionProfile {
  return value in COMPRESSION_PROFILES;
}

export const RELATIONSHIP_LABELS: Record<string, string> = {
  exact: "Exact AKTU syllabus",
  modified: "AKTU syllabus with institutional changes",
  partial: "Partially aligned",
  independent: "Independent institutional syllabus",
  pending_verification: "Relationship awaiting verification",
};
