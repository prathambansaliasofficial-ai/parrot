# FreeResources — Cloudflare architecture & decision record

Status legend: **implemented** · **verified locally** · **needs credentials** ·
**needs a paid Cloudflare feature** · **not deployed**.

---

## 1. What exists today (verified)

| Area | State | Evidence |
|---|---|---|
| Next.js 16.4.3 site + admin portal | implemented, runs on Node | dev server on :3100, 66/66 admin checks |
| Acquisition pipeline (11 stages, leases, retries) | implemented, verified | 27/27 acquisition checks, separate worker |
| AKTU document classification from PDF text | implemented, verified | `docs/AKTU-AUDIT.md` over 9 assets: 6 genuine AKTU + 3 localhost fixtures (fixtures excluded from the dataset) |
| AKTU metadata correction + audit trail | implemented, applied | `scripts/fix-aktu-data-quality.ts`, slug alias, `audit_log` |
| D1 schema (41 tables) | implemented, verified locally | 2 migrations applied to local D1, 47 statements |
| SQLite → D1 data migration | implemented, verified locally | 670 rows / 31 non-empty tables, 0 count mismatches, 0 FK violations |
| Next.js app reading D1 directly | **not started** | the site still reads SQLite through `lib/db.ts` (27 modules); the acquisition Worker is the only D1 writer. See §"Single source of truth" below |
| Demo/sample data in the product | removed (forward-only migrations) | `db/d1/0003_remove_demo_academic_data.sql`, `supabase/migrations/0003_remove_dtu_demo_catalog.sql`, `docs/DEMO-DATA-REMOVAL.md` |
| AKTU metadata manifest + import | implemented, verified locally | `data/aktu/manifest.json` (6 documents, 1 published, 5 pending), `npm run data:aktu:verify` |
| Acquisition Worker (Queues + Workflow + Cron + D1 + R2) | implemented, verified locally | real AKTU PDF downloaded → R2 (464,396 B) → D1 `awaiting_approval` |
| Idempotency | implemented, verified locally | duplicate submit returned `created:false` |
| Cloudflare Container (Ghostscript) | implemented, **not built or run** | no Docker on this machine; Windows local dev unsupported |
| AI classification / copilot | implemented, **blocked** | no `AI_API_KEY` |
| Next.js app served from Workers | **not possible yet** | see §3 |

---

## 2. Target topology

```
                    ┌──────────────────────────────────────────┐
  students ────────►│ Worker: freeresources-web                │
                    │ (Next.js via @opennextjs/cloudflare)     │
                    │  site, admin portal, REST, copilot       │
                    └───────────────┬──────────────────────────┘
                                    │ bindings
              ┌─────────────────────┼───────────────────────────┐
              ▼                     ▼                           ▼
      ┌───────────────┐   ┌──────────────────┐        ┌──────────────────┐
      │ D1            │   │ R2               │        │ Queues           │
      │ metadata,     │   │ originals        │        │ discovery        │
      │ jobs, audit,  │   │ derivatives      │        │ ingestion        │
      │ curricula     │   │ published        │        │ dead-letter      │
      └───────┬───────┘   │ backups          │        └────────┬─────────┘
              │           └────────┬─────────┘                 │
              │                    │                           ▼
              │                    │              ┌──────────────────────────┐
              └────────────────────┼─────────────►│ Worker: acquisitions     │
                                   │              │ fetch/queue/scheduled    │
                                   │              │ Workflow: IngestionWorkflow│
                                   │              └───────────┬──────────────┘
                                   │                          │ service binding
                                   │              ┌───────────▼──────────────┐
                                   └──────────────│ Worker: pdf-container    │
                                                  │ Container: gs + qpdf +   │
                                                  │ pdf.js (stateless)       │
                                                  └──────────────────────────┘
```

Why three Workers rather than one:

- The **site** must never block on a 10-minute PDF job.
- The **acquisition** Worker holds queue consumers, cron and workflow state; it
  boots without the Containers module so development and emergencies still work.
- The **container** Worker is the only one that needs the paid Containers
  capability and Docker. Isolating it keeps the rest deployable on its own.

---

## 3. ADR-001 — Next.js on Cloudflare: OpenNext, not Vinext

**Decision: `@opennextjs/cloudflare` (OpenNext), applied only after the data
layer is asynchronous. Not deployed in this change.**

Evidence gathered this session:

- OpenNext's own documentation states that *all minor and patch versions of
  Next.js 16* are supported, along with the latest minor of 15. Our pinned
  version is 16.4.3, which is in range.
- Cloudflare's framework guide marks OpenNext as *"Recommended path: use this
  guide to maintain an existing OpenNext application"* and recommends vinext
  only for **new** applications. vinext is still described as beta, is a Vite
  re-implementation of the Next API, and supports PPR only partially.
- OpenNext runs the real `next build` output under the Workers **Node.js**
  runtime (`nodejs_compat`). That matters here because the app uses
  `node:crypto`, `node:fs` and `node:path` in route handlers.
- Node.js middleware (the Next 16 `proxy.ts` on the Node runtime) has
  experimental support in OpenNext ≥ 1.20.3. This app has no `middleware.ts` or
  `proxy.ts`, so the gap does not apply.

Vinext was rejected for this project because it re-implements the framework
rather than adapting our build, and because our highest-risk areas (native
modules, filesystem access, a long-running worker) are exactly where a beta
re-implementation is least predictable. Revisit when vinext exits beta and
`npx vinext check` reports a clean result on this app.

### Why the site is not deployed to Workers in this change

These are verified from the code, not assumed:

| Blocker | Where | Consequence under Workers |
|---|---|---|
| `better-sqlite3` (native addon) | `lib/db.ts` | Native `.node` addons cannot load in workerd. |
| Synchronous data access | `lib/db.ts` `one/all/run/transaction`, used by `lib/queries.ts` (1,120 lines), `lib/admin.ts` (797), `lib/acquisition/store.ts` (596) | D1 is asynchronous. Every call site must become `await`. ~2,500 lines. |
| Filesystem storage | `lib/storage.ts`, `lib/acquisition/storage.ts` local driver | No persistent local disk in Workers. Must become R2. |
| `child_process` + Ghostscript | `lib/acquisition/pdf.ts` | Native binary; moved to the Container (done). |
| Long-lived worker loop | `scripts/worker.ts` | Replaced by Queues + Workflows + Cron (done). |
| `pdfjs-dist` in-request | `lib/acquisition/pdf.ts` `extractText` | Heavy WASM/worker bundle; now done in the Container. |

The Cloudflare-native servicing path is therefore **built and verified**, while
the HTTP request path still reads SQLite. That split is deliberate and is the
next phase, not an oversight.

### Phase C2 — what remains for a full Workers deployment

1. Introduce `lib/db/driver.ts` exposing an async `Db` port
   (`query<T>`, `first<T>`, `run`, `batch`).
2. Implement `SqliteDb` (wraps today's synchronous API in async methods — keeps
   local development and all tests working) and `D1Db` (uses the `DB` binding).
3. Convert call sites in order: `lib/queries.ts` → `lib/admin.ts` →
   `lib/admin-*.ts` → `lib/acquisition/store.ts`. Server components and route
   handlers are already `async`, so most changes are adding `await`.
4. Move `lib/storage.ts` uploads to the `R2_PUBLISHED` binding and serve
   downloads through a Worker route with `Cache-Control: public, max-age=31536000,
   immutable` and a hash-addressed key (never a bucket listing).
5. Replace the acquisition panels' SQLite queries with reads of the same D1
   tables the Worker writes, so admin status reflects the real processing state.
6. Build with OpenNext, run `wrangler dev` with the D1/R2 bindings, then repeat
   the 27 acquisition checks against the Worker.

Estimated effort: 2–3 focused days for steps 1–3, then 1 day each for 4–6.

---

## 4. Data model on D1

D1 is SQLite, so the existing schema transferred with **two** transformations:
`PRAGMA` lines removed (D1 manages foreign keys), and a real-world limit
respected.

**Extracted PDF text is not stored in D1.** `document_assets.text_content`
reached 153,813 characters for one AKTU PDF, which made a single `INSERT`
exceed the local D1 statement limit (`SQLITE_TOOBIG`). Extracted text now lives
in R2 (`text/<sha[0:2]>/<sha>.txt`) and `scripts/d1-export.mjs` writes the
bodies to `db/d1-data/text/` with a manifest of the target R2 keys. The row
keeps metadata only, which is also what keeps D1 queries fast and rows small.

Other deliberate choices:

- `document_assets.sha256` stays `UNIQUE` — content-addressed dedupe is enforced
  by the database, not by application logic.
- `document_versions` keeps `UNIQUE(asset_id, kind)`, so an original and one
  optimised derivative coexist and a re-run updates rather than duplicates.
- The workflow's job id is a SHA-256 of `sourceUrl + subjectId`. Insert uses
  `INSERT OR IGNORE`, so at-least-once queue delivery cannot create a second
  resource. Verified: the second POST returned `created:false`.
- Workflow instance ids are `job-<jobId>`; `create()` failing because the
  instance exists is treated as success (duplicate delivery), never as an error.

---

## 5. Workflow semantics (honest)

| Control | Mechanism | Truth |
|---|---|---|
| Approve | `instance.sendEvent({type:"approval"})` + `step.waitForEvent` | Real durable wait, up to 7 days. |
| Reject | Event with `{approved:false}`; step records and ends unpublished. | Supported. |
| Pause / resume | Persisted control request observed at the next checkpoint | **Cooperative only.** Cloudflare Workflows expose no arbitrary pause API. A pause requested after the last checkpoint takes effect only if another checkpoint follows. |
| Cancel | Workflows `instance.terminate()` | Real termination. |
| Restart | New instance with a new id; completed steps of the old instance are gone with it | Restart re-runs, it does not resume. |
| Inspect | `GET /jobs/:id` reads D1 job + event rows | Real backend data, no fabricated progress. |

Each stage writes an `ingestion_job_events` row, so a stage that failed is
visible as failed rather than inferred from a percentage.

---

## 6. Security model

- Mutation API on the acquisition Worker requires
  `Authorization: Bearer $ADMIN_API_TOKEN`, compared in constant time. If the
  secret is unset the API returns **503 and refuses all mutations** rather than
  running open.
- Only `https://` sources are accepted by `POST /jobs`.
- Originals are never in the published bucket. Published object keys are
  `published/<sha>.pdf`; the published bucket is intended behind a custom domain
  with no listing permission.
- Originals stay private and are served to admins through the existing
  authenticated route (verified: unauthenticated request → 401).
- External pages and PDF text are treated as data. Neither the deterministic
  classifier nor the copilot may execute instructions found inside them.
- PG Hunter is untouched: every resource name is prefixed `freeresources-`, and
  no command in this change addresses an existing bucket, database, queue or
  Worker by name.

---

## 7. Deliberate non-goals in this change

- No deployment, no DNS change, no billable resource creation.
- No rewrite of the 2,500 lines of synchronous SQLite access (see §3).
- No invented AKTU curriculum. Only what the documents print is recorded.

---

## 8. Single source of truth — remaining work (C2)

Current state, stated plainly so nobody assumes it is finished:

| Reader | Store today | Target |
| --- | --- | --- |
| Acquisition Worker (`workers/acquisition`) | D1 | D1 (already correct) |
| Admin portal (`app/admin/**`) | SQLite via `lib/db.ts` | D1 |
| Public catalog (`lib/queries.ts`, `app/resources` etc.) | SQLite via `lib/db.ts` | D1 |
| Auth, sessions, audit log | SQLite | D1 |
| Downloads / previews (`app/api/download`, `app/api/preview`) | SQLite + local storage | D1 + R2 |

`lib/db.ts` exposes a **synchronous** `better-sqlite3` API used by 27 modules.
D1 is asynchronous, so this is a repository-layer change, not a binding swap:
every call site must become `await`. The safe sequence is:

1. Introduce `lib/repo/*` with async functions (`getResourceBySlug`, `listResources`,
   `createSession`, …) and move one module group at a time behind them.
2. Keep SQLite behind the same repository interface for local development
   (`DATABASE_DRIVER=sqlite`) and select D1 in the Worker (`DATABASE_DRIVER=d1`).
3. Port read paths first (catalog, admin lists), then write paths (auth, audit,
   contributions), running `npm run test:api` and `npm run test:admin` after each.
4. Only then delete the SQLite branch and the `d1:export` bridge.

Until step 4, `npm run d1:export` remains the only way data reaches D1 from
local development, and it must be run deliberately. Do not deploy a build in
which the website and the acquisition Worker both write different databases.
