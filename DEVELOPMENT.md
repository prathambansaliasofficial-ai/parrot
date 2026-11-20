# Development setup

This repository is a monorepo. It contains two generations of the FreeResources
product that are kept side by side on purpose:

| Path | What it is | Runtime |
| --- | --- | --- |
| `frontend/` | Parrot AI study companion website (Next.js 16, React 19, TypeScript, Tailwind). Tutor widget, resources pages, login. | Node 22 |
| `backend/` | FastAPI API: resource catalog, tutoring engine, quiz/teach-back evaluation, learning progress. | Python 3.12 |
| `agent/` | Fetch.ai uAgent that routes chat messages to the backend tutoring endpoints. | Python 3.12 |
| `freeresources/` | Cloudflare-native FreeResources AKTU platform: public catalog, admin dashboard, academic acquisition pipeline (D1, R2, Queues, Workflows, Containers). | Node 22 + Wrangler |
| `supabase/migrations/` | Legacy Supabase schema, kept for existing deployments. | — |

`freeresources/` is the Cloudflare direction for the academic database and
document storage. The Parrot frontend, FastAPI tutoring services and the uAgent
are not being replaced: they keep working and are deployed separately
(`vercel.json` describes that older deployment).

Do not create a second Next.js app or a second resource database. Extend
`freeresources/`.

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

## Frontend (`frontend/`)

```sh
cd frontend
npm ci
cp .env.example .env.local        # Windows: copy .env.example .env.local
npm run dev                       # http://localhost:3000
```

`.env.local` needs `BACKEND_URL` (server-side catalog requests) and optionally
`NEXT_PUBLIC_API_BASE_URL=/api`. Never put a Supabase secret or ASI key in a
`NEXT_PUBLIC_*` variable.

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

### Local admin account

`npm run db:seed` creates an admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD` in your
local `.env`. Use a throwaway local password; production credentials belong in
Cloudflare secrets, never in a file in this repository.

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
cd frontend && npm run lint && npm run build
cd backend  && python -m pytest
cd freeresources && npm run typecheck && npm run test:api && npm run test:admin
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
