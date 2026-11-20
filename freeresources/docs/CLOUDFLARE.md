# FreeResources on Cloudflare — setup, deployment and limits

Nothing in this document has been executed against a real Cloudflare account.
Everything below was verified against the **local** Cloudflare runtime
(`wrangler dev --local`, Miniflare) except where marked.

---

## 1. Prerequisites and plan requirements

| Capability | Requirement |
|---|---|
| Workers, D1, R2, Cron | Free plan covers these within limits |
| **Queues** | Workers **paid** plan |
| **Workflows** | Workers **paid** plan |
| **Containers** | Workers **paid** plan + Docker for the image build |
| Custom delivery domain (`files.freeresources.in`) | Optional; needs the domain and a DNS record |

Confirm Containers availability for the account before relying on it. If
Containers are not available, the acquisition Worker still downloads, classifies
and stores documents; the processing step reports
`No PDF_PROCESSOR service binding` and the job waits at `awaiting_approval`.
That is the supported degraded mode — not a silent fallback to a VPS.

---

## 2. Isolation from PG Hunter (non-negotiable)

- Create **new** resources only. Never reuse a PG Hunter bucket, D1 database,
  queue, KV namespace or Worker.
- Every name below starts with `freeresources-`.
- Do not touch PG Hunter DNS records. `files.freeresources.in` gets its own
  record when (and only when) you authorise it.
- Do not add `routes`/`custom_domain` entries to an existing PG Hunter Worker.

---

## 3. Create the resources (development environment)

```bash
cd freeresources

# D1
npx wrangler d1 create freeresources-dev
#   → copy database_id into wrangler.jsonc  (d1_databases[0].database_id)

# R2 (three private buckets)
npx wrangler r2 bucket create freeresources-originals-dev
npx wrangler r2 bucket create freeresources-derivatives-dev
npx wrangler r2 bucket create freeresources-published-dev

# Queues + dead letter
npx wrangler queues create freeresources-discovery-dev
npx wrangler queues create freeresources-ingestion-dev
npx wrangler queues create freeresources-dead-letter-dev
```

Repeat with the non-`-dev` names for the `production` environment in
`wrangler.jsonc`, and put that database's id in the `env.production` block.

---

## 4. Local development

```bash
# 1. Schema + data into the local D1 (no account, no billing)
npm run d1:schema          # regenerate db/d1/*.sql from the SQLite schema
npm run d1:export          # db/d1-data/data.sql + text manifest + expected counts
npm run d1:migrate:local   # apply both migrations to .wrangler/state D1
npm run d1:import:local    # import rows (extracted text excluded by design)
npm run d1:verify          # row-count parity, admins, FK check

# 2. Run the acquisition Worker (D1, R2, Queues, Workflows, Cron)
npm run cf:dev             # http://127.0.0.1:8787
curl -s http://127.0.0.1:8787/health

# 3. Run the container Worker (needs Docker; on Windows use WSL)
npx wrangler dev --config wrangler.pdf.jsonc
```

Local `wrangler dev` cannot build container images on Windows — Wrangler stops
with *"Local development with containers is currently not supported on
Windows"*. That is why the container lives in its own Worker and its config.

Cron does not fire automatically in local dev. Trigger it manually:

```bash
curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"
```

---

## 5. Migrating the existing SQLite data (verified procedure)

Run in this order. Steps 1–5 were executed here and passed.

```bash
# 1. Back up the original database first — it is the only copy.
cp db/freeresources.db db/freeresources.backup-$(date +%Y%m%d).db

# 2. Generate versioned migrations from the source schema.
npm run d1:schema

# 3. Export data in foreign-key order; extracted text is written to
#    db/d1-data/text/ instead of into rows.
npm run d1:export

# 4. Apply schema, then import data.
npm run d1:migrate:local
npm run d1:import:local

# 5. Verify: row counts per table, admin accounts, orphaned resources, FKs.
npm run d1:verify
```

Last verified result:

```
Tables compared: 31, rows compared: 670
Row-count parity: PASS
Admin accounts preserved: 2
Published resources: 20
Resources without a subject (broken relationship): 0
Foreign-key check: none
```

For the deployed database, use `--remote` (after `wrangler login`):

```bash
npx wrangler d1 execute freeresources-production --remote --file=db/d1-data/data.sql --config wrangler.jsonc
D1_DATABASE=freeresources-production node scripts/d1-verify.mjs --remote
```

After import, upload the extracted-text files to the derivatives bucket:

```bash
# one object per entry in db/d1-data/text/manifest.json (r2Key is the target key)
npx wrangler r2 object put freeresources-derivatives/$(jq -r '.[0].r2Key' db/d1-data/text/manifest.json) \
  --file db/d1-data/$(jq -r '.[0].file' db/d1-data/text/manifest.json)
```

---

## 6. Secrets

Never commit secrets. Set them on the Worker:

```bash
npx wrangler secret put ADMIN_API_TOKEN --config wrangler.jsonc
```

| Secret | Purpose | If missing |
|---|---|---|
| `ADMIN_API_TOKEN` | Bearer token for `POST /jobs`, `POST /runs`, `/approve` | mutation API returns 503 and refuses |
| `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` | AI classification + copilot (Node worker / Next app today) | classification is skipped, copilot returns a setup message |

R2 access from the Worker uses **bindings**, not keys — do not add
`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY` to a deployed Worker. Those remain
only for the local Node path.

---

## 7. Deploy (only after explicit approval)

```bash
# PDF container first if you use it (paid plan; Docker required)
npx wrangler deploy --config wrangler.pdf.jsonc

# Acquisition Worker, development env
npx wrangler deploy --config wrangler.jsonc

# Production env
npx wrangler deploy --config wrangler.jsonc --env production
```

Then verify what is actually live:

```bash
curl -s https://freeresources-acquisition.<subdomain>.workers.dev/health
```

`/health` reports `d1`, `r2_originals`, `workflow_binding`,
`container_binding` and `admin_api` individually. Treat a `200` as
infrastructure reachable, not as proof that a document processes.

Cron is declared in `wrangler.jsonc`: `0 2 * * *` (daily) and `0 3 * * 1`
(weekly). Wrangler shows the next runs under Deployments → Triggers.

---

## 8. Expected costs (estimates, not quotes)

Verify against current Cloudflare pricing before committing. Volumes assume
AKTU-scale work: ~40 documents/week, ~50 MB of PDFs per week.

| Item | Estimate |
|---|---|
| Workers paid plan | ~$5/month base |
| D1 | metadata only (text is in R2); well under the included rows/reads |
| R2 | ~200 MB stored → cents; egress to the internet is free on R2 |
| Queues | ~200 messages/week, negligible |
| Workflows | ~40 instances/week with ~7 steps each, negligible |
| Containers | the dominant cost: billed by vCPU-s/GiB-s while awake. `sleepAfter = "5m"` and `max_instances = 2` bound it. Benchmark one 100-page PDF before raising `instance_type`. |
| AI classification | one call per document; cost depends on provider and text length |

Without Containers, the recurring cost is the plan fee plus a few cents.

---

## 9. Limitations of this change

1. **Not deployed.** No resource was created; `database_id` values in
   `wrangler.jsonc` are placeholders.
2. **Container never built or run.** No Docker on this machine. Its Dockerfile,
   HTTP contract and the Worker that fronts it are unexercised.
3. **The Next.js site is not on Workers.** See `docs/ARCHITECTURE.md` §3 — the
   request path still uses synchronous SQLite.
4. **The admin portal still shows SQLite job state**, while the Cloudflare
   Worker writes D1. Both are authoritative for their own runtime; they are not
   yet the same database. The panels will show the Node worker's jobs until
   Phase C2.
5. **AI is inactive** (no key). Deterministic classification does run and is
   what produced the AKTU audit.
6. **R2 was verified locally only** (Miniflare). The SigV4 Node driver and the
   native binding have not been exercised against a real bucket.
7. **Brave Search** is not configured; discovery uses the official index page.
