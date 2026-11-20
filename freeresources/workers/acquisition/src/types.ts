/** Bindings available to the acquisition Worker. */
export interface Env {
  DB: D1Database;
  R2_ORIGINALS: R2Bucket;
  R2_DERIVATIVES: R2Bucket;
  R2_PUBLISHED: R2Bucket;
  DISCOVERY_QUEUE: Queue<DiscoveryMessage>;
  INGESTION_QUEUE: Queue<IngestionMessage>;
  INGESTION_WORKFLOW: Workflow<WorkflowParams>;
  /** Service binding to the PDF container Worker. Absent when undeployed. */
  PDF_PROCESSOR?: Fetcher;
  ENVIRONMENT: string;
  ACQUISITION_UNIVERSITY_SLUG: string;
  ACQUISITION_MAX_CANDIDATES_PER_RUN: string;
  ACQUISITION_MAX_DOWNLOAD_MB: string;
  /** Server-side secret. Absent means the mutation API is disabled (503). */
  ADMIN_API_TOKEN?: string;
}

export type IngestionMessage = { type: "ingest"; jobId: string };

export type DiscoveryMessage = { type: "discover"; runId: string };

export type WorkflowParams = {
  jobId: string;
  sourceUrl: string;
  profile: "balanced" | "scanned" | "archive" | "economy";
  /** Idempotency key: stable per source document, never per delivery. */
  idempotencyKey: string;
};

export type JobRow = {
  id: string;
  candidate_id: string | null;
  asset_id: string | null;
  document_version_id: string | null;
  stage: string;
  state: string;
  attempt: number;
  max_attempts: number;
  last_error: string | null;
  payload: string | null;
  published_resource_id: string | null;
  created_at: string;
  updated_at: string;
};
