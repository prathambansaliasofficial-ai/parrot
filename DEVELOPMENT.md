# Development setup

This repository is a monorepo. `freeresources/` is the single web app Vercel
builds and serves at `/`.

| Path | What it is | Runtime |
| --- | --- | --- |
| `freeresources/` | The production web app (Next.js 16, React 19, TypeScript, Tailwind): public catalog, admin dashboard, Parrot AI widget, academic acquisition pipeline. Vercel builds this directory for `/`; Wrangler deploys it to Cloudflare. | Node 22 + Wrangler |
| `backend/` | FastAPI API served at `/api/v1/*`: resource catalog, tutoring engine, quiz/teach-back evaluation, learning progress. | Python 3.12 |
| `agent/` | Fetch.ai uAgent that routes chat messages to the backend tutoring endpoints. | Python 3.12 |
| `supabase/migrations/` | Legacy Supabase schema, kept for existing deployments. | — |

The older `frontend/` Next.js app was merged into `freeresources/`, so there is
one web app and one place for pages, components and academic data. Do not
create a second Next.js app or a second resource database.

## Required software

| Tool | Version | Where it comes from |
| --- | --- | --- |
| Node.js | 22 | `.nvmrc` |
| Python | 3.12 | `.python-version` |
| Git, npm | current | your installer |
| Wrangler | via `npx wrangler` | dev dependency of `freeresources/` |
| Ghostscript | 10.x | only for local PDF compression (`freeresources`) |

```sh
git clone https://github.com/prathambansaliasofficial-ai/parrot.git
cd parrot
git checkout main
git pull --ff-only origin main
```

Windows: use PowerShell and `py -3.12` instead of `python3`. POSIX: use
`python3.12`. The commands below show both where they differ.

## Web app (`freeresources/`)

```sh
cd freeresources
npm ci
cp .env.example .env              # Windows: copy .env.example .env
npm run dev                       # http://localhost:3000
```

`vercel.json` builds this directory for `/` and routes `/api/v1/*` to the
`backend` service; the service binding injects `BACKEND_URL`, which the Parrot
AI route uses when `PARROT_API_BASE_URL` is unset. Locally set
`PARROT_API_BASE_URL=http://localhost:8000` (or `BACKEND_URL`). Optional:
`NEXT_PUBLIC_SITE_URL`. Never put an API key or service-role secret in a
`NEXT_PUBLIC_*` variable.

Vercel's runtime filesystem is read-only, so SQLite and uploaded files fall back
to `/tmp` there (`DATABASE_PATH` and `STORAGE_DIR` override this) and that state
is lost between function instances. Cloudflare D1 + R2 is the persistent target;
see `freeresources/docs/CLOUDFLARE.md`.

Because that filesystem starts empty, a deployment has no catalog data until
Cloudflare D1 is connected. Set these Vercel environment variables (a token with
D1 read permission is enough):

| Variable | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id |
| `CLOUDFLARE_D1_DATABASE_ID` | D1 database id (`wrangler d1 list`) |
| `CLOUDFLARE_D1_API_TOKEN` | API token, D1: Read |

At startup each server instance copies the D1 rows into its local SQLite file
(`freeresources/lib/d1-hydrate.ts`, called from `instrumentation.ts`) and skips
the copy when the database already has data. Writes still land in `/tmp` and are
not persisted; D1 stays the durable source of truth.

## Backend (`backend/`)

Windows PowerShell:

```powershell
cd backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
copy .env.example .env
python -m uvicorn app.main:app --port 8000
```

macOS / Linux:

```sh
cd backend
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --port 8000
```

Health: http://localhost:8000/health · OpenAPI: http://localhost:8000/docs

Run tests: `python -m pytest` (no credentials required).

### Behaviour without credentials

The API is honest about missing configuration:

- `GET /api/v1/resources` returns an **empty list** when Supabase is not
  configured. It does not serve a sample catalog any more. The website shows an
  explicit "not indexed yet" empty state.
- Tutor replies run in labelled demo mode when `ASI_ONE_API_KEY` is absent: each
  response carries `"demo_mode": true` and a visible `[Parrot demo mode …]`
  banner. This is a transparency marker, not synthetic academic content.
- Learning progress falls back to an in-process store that resets on restart.

### Endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/v1/resources`, `GET /api/v1/resources/{id}` | Published catalog and detail with passages |
| `GET /api/v1/resources/{id}/download` | Short-lived signed URL for a stored file |
| `POST /api/v1/tutor/message` | Single entry point; modes `explain`, `quiz`, `teach_back`, `plan` |
| `POST /api/v1/tutor/quiz/answer` | Grade an answer |
| `POST /api/v1/tutor/evaluate` | Structured teach-back evaluation |
| `POST /api/v1/tutor/plan` | Revision plan |
| `GET /api/v1/tutor/progress?session_id=…` | Recorded assessments |
| `POST /api/v1/admin/resources/upload`, `/link` | Authenticated ingestion (`X-Ingestion-Key`) |

New resources start unpublished. Publish only after verifying course, category
and permission to use the material.

## Fetch.ai agent (`agent/`)

```sh
cd agent
python3.12 -m venv .venv            # Windows: py -3.12 -m venv .venv
source .venv/bin/activate           # Windows: .\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
cp .env.example .env                # Windows: copy .env.example .env
python main.py                      # or the documented module entrypoint
```

The agent needs the API running (`PARROT_API_BASE_URL`, default
`http://localhost:8000`). It maps "quiz …" to quiz generation, concept questions
to grounded explanation, prepared explanations to structured evaluation, and
"revision plan" to a plan. It never invents content when the API fails.

Agentverse seeds and ASI keys are **not** committed. Register the agent with
your own account if you need Agentverse hosting.

## FreeResources / Cloudflare (`freeresources/`)

```sh
cd freeresources
npm ci
cp .env.example .env                # Windows: copy .env.example .env
```

Local development uses SQLite through `DATABASE_PATH` (default
`db/freeresources.db`) for the website, while the acquisition Worker uses native
D1 bindings. `docs/ARCHITECTURE.md` describes the boundary; `docs/CLOUDFLARE.md`
describes deploying real resources.

```sh
npm run dev                 # Next.js dev server
npm run db:migrate          # create/upgrade the local SQLite database
npm run db:seed             # reference metadata only: universities, categories, programmes
npm run dev:admin           # log in with a local-only admin account (see below)
```

### Admin account

The first time a database is initialised, `lib/db.ts` creates one administrator
from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, so `/admin` is reachable on a fresh
checkout and on a deployment without running a seed script. `npm run db:seed`
uses the same two variables. Use a throwaway local password and set
`ADMIN_PASSWORD` in the deployment environment; production credentials belong in
environment/secrets configuration, never in a file in this repository.

Bootstrap never modifies an existing administrator, and it refuses to create one
in production unless `ADMIN_PASSWORD` is set, is not the documented development
password, and is 12+ characters. If it refuses, it logs the reason and `/admin`
stays locked — set the variables and restart rather than reusing a known
password. The deployment must also set `ADMIN_EMAIL` to a mailbox you control.

### Local D1, R2, queues, workflows

```sh
npm run d1:schema                 # regenerate db/d1/0001_baseline.sql from schema.sql
npm run d1:migrate:local          # apply db/d1 migrations to the local D1 emulator
npm run cf:dev                    # acquisition Worker on http://localhost:8787
npm run d1:verify                 # compare D1 row counts against the export
```

Wrangler runs D1, R2, Queues and Workflows in its local emulator, so no
Cloudflare account is needed for day-to-day work. The PDF container needs a
Linux environment to build:

```sh
docker compose up --build         # containers/pdf: Node + Ghostscript
```

Anything that requires real Cloudflare resources or third-party keys reports a
configuration requirement instead of silently faking a result.

### AKTU academic dataset

The real AKTU records discovered by the acquisition pipeline are described by a
metadata manifest, not by binaries in Git:

```sh
npm run data:aktu:export     # build data/aktu/manifest.json from the audit + local DB
npm run data:aktu:verify     # validate the manifest (hashes, sources, statuses)
npm run data:aktu:import     # apply the manifest to local D1 (add --remote to deploy)
```

PDFs live in R2 (`freeresources-originals*`, `freeresources-derivatives*`,
`freeresources-published*`). Never commit PDFs, SQLite files, D1 exports or
`.wrangler/` state.

## Database migrations

Two independent schemas exist while the Cloudflare migration is in progress:

- **SQLite / Supabase** — for the website and legacy deployments. Forward-only
  migrations live in `supabase/migrations/`. Historical migrations are never
  edited after they may have been applied.
- **D1** — `freeresources/db/d1/`, applied with
  `wrangler d1 migrations apply`.

Cleanup of demonstration records is a separate forward-only migration in each
tree (`0003_remove_dtu_demo_catalog.sql`, `0003_remove_demo_academic_data.sql`).
Both are idempotent and preserve rows that have real resources attached.

## Tests

```sh
cd freeresources && npm run typecheck && npm run build
cd freeresources && npm run test:api && npm run test:admin
cd backend  && python -m pytest
```

Test fixtures are isolated under test directories (`backend/tests/`,
`freeresources/tests/fixtures/`). They are never imported by production code and
production never auto-seeds demo content.

## Git collaboration

- `main` is the shared branch and must always run.
- Work on a feature branch (`feature/<topic>`), open a pull request, let CI and
  a reviewer check it, then merge.
- Never force-push `main`, never `git reset --hard` over someone's work, and
  never commit `.env`, databases, PDFs or credentials.

## Environment files

Every service ships an `.env.example` with placeholder values. Copy it to the
local filename, fill in your own credentials, and keep the copy out of Git.
