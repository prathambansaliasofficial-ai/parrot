# AKTU academic intelligence & autonomous acquisition

The acquisition system discovers AKTU syllabi, processes the documents through a
durable pipeline, and lets an administrator approve, publish and audit everything
from the existing admin portal.

## What is real today

| Capability | Status |
|---|---|
| Canonical curriculum model (university → programme → stream → scheme → subject → units) | Implemented in SQLite |
| Institution → curriculum mappings with evidence + verification | Implemented |
| Durable job queue (lease, heartbeat, retry/backoff, pause/cancel) | Implemented, separate worker |
| Discovery via official-domain sitemaps + robots.txt | Implemented |
| Discovery via Brave Web Search | Implemented, needs `BRAVE_SEARCH_API_KEY` |
| SSRF-hardened fetch, size/time caps, robots checks | Implemented |
| PDF validation, page count, SHA-256, text extraction | Implemented (pdf-lib + pdf.js) |
| Duplicate prevention by content hash | Implemented and tested |
| PDF optimisation (separate derivative, validated) | Implemented, **requires Ghostscript** |
| Automatic naming | Implemented; stream-level documents are named for their scope |
| Evidence-only document classification (course structure vs. subject syllabus) | Implemented and run over the real AKTU assets |
| AKTU data-quality audit + audited correction | Implemented and applied (`docs/AKTU-AUDIT.md`) |
| Cloudflare D1 schema + data migration | Implemented, verified against local D1 |
| Cloudflare Worker (Queues + Workflow + Cron + R2 bindings) | Implemented, verified with a live AKTU PDF |
| Cloudflare Container (Ghostscript) | Implemented, never built or run (no Docker here) |
| AI classification | Implemented, needs `AI_API_KEY`; skipped honestly without it |
| Publishing into the public library | Implemented and tested |
| Admin dashboard, hunter, pipeline, documents, sources, institutions, curricula | Implemented |
| Floating admin copilot with typed tools + confirmation | Implemented, needs `AI_API_KEY` |
| Daily/weekly scheduler | Implemented in the worker, off by default |

Storage defaults to local disk on the Node host. The Cloudflare Worker stores
originals and derivatives in R2 through native bindings — exercised locally
against Miniflare, not against a real bucket. The Node SigV4 R2 driver still has
no credentials and remains unverified.

## Academic data quality

The document type is now derived from the PDF's own text, never from the
discovery query. Running `npm run audit:aktu` writes `docs/AKTU-AUDIT.md` and
`docs/aktu-audit.json`.

What the audit found and what was corrected:

- The published 100-page document is **AKTU B.Tech First Year CSE Stream —
  Evaluation Scheme & Syllabus 2026-27** (43 printed course codes, all
  CSE-stream branches). It had been filed under the single subject
  *Data Structures (BCS301), Semester 3* at `/resource/data-structures-syllabus-5`.
- It is now `/resource/aktu-btech-cse-stream-first-year-scheme-syllabus-2026-27`,
  mapped to a new canonical row *First Year CSE Stream (Common)* under a
  *B.Tech CSE Stream 2026-27* curriculum. The old URL redirects through
  `resource_slug_aliases`; nothing was deleted.
- Its syllabus version is `in_review` with `subject_id = NULL` — a stream
  document must not claim a single subject, and units are entered per subject by
  a human.
- All five documents awaiting approval are per-year/per-branch **course
  structures**, not subject syllabi. Each now carries a `document_type`, real
  semester coverage, its true source filename, and a warning event telling the
  reviewer not to approve it as one subject.
- Every asset's `original_filename` had been overwritten with
  `"Data Structures.pdf"` (the discovery subject). The pipeline now records the
  publisher's filename from the source URL.

Approval also warns when the PDF's detected semester coverage contradicts the
subject the job was filed against.

## Running it

```bash
npm install
npm run db:migrate          # baseline + acquisition schema
npm run db:seed:aktu        # AKTU institution, curricula, sources, settings
npm run dev -- -p 3100      # admin at /admin/acquisition

npm run worker              # durable queue + scheduler (separate process)
npm run worker -- --once    # drain the queue and exit
```

The worker must keep running for discovery and processing. Nothing is processed
inside a request handler, and closing the browser does not stop it.

## Environment

See `.env.example`. Only these are needed for full function:

- `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` — any OpenAI-compatible provider
- `BRAVE_SEARCH_API_KEY` — optional search provider
- `R2_ACCOUNT_ID`, `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
  `R2_PUBLIC_BASE_URL`, `ACQUISITION_STORAGE_DRIVER=r2` — optional object storage
- `ACQUISITION_ALLOW_LOCAL_FETCH=1` — tests only, never in production

## Cloudflare R2

1. Create a private bucket dedicated to FreeResources.
2. Create an R2 API token with object read/write on that bucket.
3. Set the `R2_*` variables and `ACQUISITION_STORAGE_DRIVER=r2`, then restart the
   worker and the app.
4. If documents should be publicly downloadable, configure a custom delivery
   domain and set `R2_PUBLIC_BASE_URL`; otherwise admins use signed URLs from
   `/api/admin/acquisition/files/<versionId>`.
5. No key is ever sent to the browser.

## Search providers

`lib/acquisition/discovery.ts` exposes a `SearchProvider` interface. Two are
registered: `official_sitemap` (no key) and `brave` (API key). To add another,
implement `discover(query, context)` and push it into `searchProviders()`.

Search engine result pages are never scraped. Only documented APIs and sitemaps
are read, robots.txt is honoured per host, and non-standard ports and private
addresses are refused.

## Data model

New tables (additive, existing tables untouched): `institutions`,
`institution_aliases`, `curricula`, `curriculum_subjects`, `syllabus_versions`,
`syllabus_units`, `institution_curricula`, `discovery_sources`, `discovery_runs`,
`discovered_candidates`, `ingestion_jobs`, `ingestion_job_events`,
`document_assets`, `document_versions`, `acquisition_settings`,
`copilot_conversations`, `copilot_messages`, `copilot_actions`.

A syllabus belongs once to a **curriculum**. Institutions reference it through
`institution_curricula` with a relationship (`exact`, `modified`, `partial`,
`independent`, `pending_verification`), evidence URL and verification status.
Nothing duplicates or mutates the master syllabus when a college is re-mapped.

The schema is SQLite but written for Postgres portability (TEXT ids, no SQLite
types, expression unique indexes replaced by plain ones during migration).

## Pipeline

`selected → downloading → validating → safety_check → text_extraction →
ai_classification → duplicate_check → optimization → naming → metadata →
awaiting_approval → uploading → indexing → publishing → completed`

Each transition writes an `ingestion_job_events` row. Jobs hold a lease with an
expiry; a restarted worker re-leases unfinished work. Retries back off
exponentially up to `max_attempts`. Permanent failures (robots disallowed,
private address, not a PDF, too large) are not retried.

Originals are stored by content hash and never overwritten. Optimised
derivatives are separate objects, only accepted when they open, keep the same
page count and are smaller.

## Copilot

Tools are declared in `lib/acquisition/copilot.ts`. Read-only tools execute
immediately. Mutating tools create a `copilot_actions` row with status
`proposed`; the UI shows the exact input and requires an explicit confirmation
before `executeConfirmedAction()` runs it. Every execution is written to the
audit log. The model never receives SQL access, shells, or credentials.

Web pages and PDF text are treated as untrusted content: they are data for
classification only, never instructions.

## Tests

```bash
npm run test:acquisition   # 27 end-to-end checks: real HTTP, real worker, real PDF
npm run test:admin         # 66 admin/authorization checks
npx tsc --noEmit
```

`test:acquisition` starts a local PDF server, queues it through the admin API,
runs the worker, checks validation/extraction/units, approves, verifies
publication, then proves the same bytes are not stored twice and that
retry/cancel keep completed work.

## Deployment topology

The design needs a **single machine with a persistent disk** and a **long-lived
worker**. That rules out serverless/edge hosts (Vercel, Netlify, Workers):
SQLite needs a real filesystem with WAL, the worker cannot run inside a request
handler, and acquired PDFs must survive deploys.

`Dockerfile` + `docker-compose.yml` encode the smallest setup that satisfies it:

```bash
docker compose up -d --build
```

- `web` — Next.js on port 3100.
- `worker` — `npm run worker`, supervised by `restart: unless-stopped`.
- Both mount `/data` (SQLite at `/data/db/freeresources.db`, documents at
  `/data/acquisition`) plus `/app/storage` for published copies.
- Ghostscript is installed **in the image**, so compression runs in production.

Without Docker, run both processes under a supervisor (systemd unit for
`npm run start` and another for `npm run worker`), pointing `DATABASE_PATH` and
`ACQUISITION_STORAGE_DIR` at durable paths and setting `GHOSTSCRIPT_BIN`.

Safety properties that make this topology safe:

- Jobs are **leased** in SQLite with heartbeat/lease expiry, so a crash or
  restart re-leases unfinished work instead of losing it.
- Scheduler state lives in `acquisition_settings`, not in memory, so a restart
  does not re-run a daily batch.
- The queue is safe with **more than one worker**: leases prevent double
  processing. SQLite is single-writer, which is fine at this volume.
- Back up by copying `freeresources.db` (after `PRAGMA wal_checkpoint`) and the
  documents directory. Nothing else is stateful.

## Verification scripts

```bash
npm run storage:check            # put/get/exists/signed-url/delete against R2 (or reports why not)
npm run pdf:check -- <pdf-url>   # real compression numbers for a document
```

`storage:check` deliberately uploads nothing and reports **"R2 is NOT active"**
when credentials are absent rather than pretending to pass.

## Known limitations

- **R2 is not verified against a real bucket.** The Node SigV4 driver has no
  credentials (`storage:check` reports local driver only). The Worker's native
  binding path was exercised against local Miniflare R2, not Cloudflare.
- **The Cloudflare Worker is not deployed**, and the Next.js site is not served
  from Workers yet: the request path still uses synchronous `better-sqlite3`,
  which cannot run in workerd. See `docs/ARCHITECTURE.md` §3 for the exact
  blockers and the migration plan.
- **The admin portal reads SQLite while the Worker writes D1.** Both are real,
  but they are not the same database yet, so Cloudflare-run jobs will not appear
  in the existing panels until the repository layer is converted.
- **The Ghostscript container has never been built or run** — no Docker on this
  machine, and Wrangler cannot build container images on Windows. Its Dockerfile
  and HTTP contract are therefore unexercised.
- **Workflows have no arbitrary pause API.** Pause is cooperative (observed at
  the next checkpoint); cancel terminates the instance.
- **AI provider is not configured** (no `AI_API_KEY`), so classification is
  skipped and the copilot returns a 501 setup message. Structured output is
  validated with Zod when a key is present.
- **Brave Search is not configured**, so discovery uses the official-site index
  crawler plus sitemap crawling. Those two find real AKTU documents without a key.
- Without AI classification, names and titles come from deterministic evidence
  (document type, detected semesters, source filename). Units still require a
  human for multi-subject documents.
- Two assets in the audit report are `localhost` fixtures created by the
  end-to-end test; they publish a 3-page syllabus under the first-year grouping
  subject. They are test data, not AKTU records.
- Unit parsing is best-effort and is skipped for large multi-subject documents;
  enter units when reviewing a syllabus version (`.tools`-free manual entry).
- Authorization is enforced in the app layer. Row-level security requires
  Postgres; it cannot exist on SQLite.
- PDF safety checks are structural (encrypted files, JavaScript/launch/embedded
  markup) — not antivirus scanning. `/URI` hyperlinks are treated as benign,
  because official AKTU syllabi are published as hyperlinked PDFs.
