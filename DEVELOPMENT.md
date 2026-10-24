# Development setup

This repository is a monorepo with separate processes for the website, API, and Fetch.ai agent.

## Layout

- `frontend/` — Next.js, React, TypeScript, and Tailwind CSS website.
<<<<<<< HEAD
- `backend/` — FastAPI application API, tutoring services and Supabase access.
- `agent/` — Python uAgent process. It is kept separate from the API so agent dependencies and runtime can be deployed independently.
- `supabase/migrations/` — database schema migrations.

The frontend calls the API. The API retrieves course/resource material and runs the tutoring engine; the uAgent routes chat-protocol messages to the same API, so website and agent share one tutoring implementation. Supabase and ASI:1 credentials are configured only in server-side environment variables.

## Demo mode (implemented, honest)

Without credentials nothing is faked:

- With no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `/api/v1/resources` serves a clearly labelled demo catalog (`demo-…` ids, two curated resources with passages, quiz banks and teach-back rubrics in `app/services/demo_data.py`).
- With no `ASI_ONE_API_KEY`, tutor replies run in deterministic demo mode and every response carries `"demo_mode": true` (plus a visible `[Parrot demo mode …]` banner in text). Configure the key to switch to real ASI:1 calls.
- Learning progress stores to Supabase when configured, otherwise to an in-process demo store that resets on restart.
=======
- `backend/` — FastAPI catalog API and Supabase file/metadata ingestion.
- `agent/` — Python uAgent process, kept separate from the API.
- `supabase/migrations/` — database schema and DTU first-year demo catalog.

## Backend setup
>>>>>>> 48299e259552bcd96d9e5997f35bae5d20ab9192

Copy the ignored local environment file and fill its blank server-only values:

```sh
cd backend
python -m venv .venv
source .venv/Scripts/activate   # on Windows; `source .venv/bin/activate` on POSIX
python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000   # fastapi dev app/main.py also works
```

The API runs at http://localhost:8000. Health: http://localhost:8000/health. OpenAPI docs: http://localhost:8000/docs.

<<<<<<< HEAD
Tutoring endpoints (all under `/api/v1`):

| Endpoint | Purpose |
| --- | --- |
| `POST /tutor/message` | One entry point for the widget and the agent: modes `explain`, `quiz`, `teach_back`, `plan` |
| `POST /tutor/quiz/answer` | Grade a quiz answer, returns the correct answer and explanation |
| `POST /tutor/evaluate` | Structured teach-back evaluation (correct/missing/misconceptions per the project contract) |
| `POST /tutor/plan` | Revision plan built from recorded progress |
| `GET /tutor/progress?session_id=…` | Recorded assessments for a study session |
| `GET /resources`, `GET /resources/{id}` | Resource catalog and detail with passages |

Run backend tests: `.venv/Scripts/python -m pytest` (demo mode by construction, no credentials needed).

Backend environment variables (copy `backend/.env.example` to `backend/.env`):

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — optional; enables the real resource catalog and durable progress (table from migration `0002`).
- `ASI_ONE_API_KEY` (plus optional `ASI_ONE_BASE_URL`, `ASI_ONE_MODEL`) — optional; enables real ASI:1 explanations and evaluations. Server-side only, never in `NEXT_PUBLIC_*`.
=======
Set `SUPABASE_URL`, a server-side `SUPABASE_SECRET_KEY` (or temporary legacy `SUPABASE_SERVICE_ROLE_KEY`), and a long random `INGESTION_API_KEY` in the local `backend/.env`. Keep these values out of the frontend, chat, and GitHub. A Supabase publishable key is not an admin/server credential.
>>>>>>> 48299e259552bcd96d9e5997f35bae5d20ab9192

## Supabase catalog and storage

Apply migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_dtu_coe_first_year.sql`

The second migration creates the ten DTU COE first-year course records visible on Fresources. It does not invent resource files or claim sample material is official. The private `course-resources` bucket stores uploaded PDFs and images; external resource links are stored as metadata in Postgres. The API does not save uploaded files to its local disk.

<<<<<<< HEAD
The agent needs the API running (`PARROT_API_BASE_URL`, default `http://localhost:8000`). It routes chat messages to `/api/v1/tutor/message` and `/api/v1/tutor/evaluate`: "quiz …" → quiz generation, explanations of a concept → source-grounded explanation, a prepared explanation containing "explain back"/"teach back" → structured evaluation, "revision plan" → plan. Backend failures are reported as such, never replaced by invented content.

## Supabase

Apply the SQL migrations in `supabase/migrations/` in order (`0001_initial_schema.sql`, then `0002_learning_progress.sql`) to the Supabase project before using real resource queries or durable learning progress. Resource rows are private by default through Row Level Security; the API uses a server-side credential. Do not expose a service-role/secret key in frontend variables.

The first migration creates colleges, branches, courses, resources, and resource chunks, plus a private `course-resources` storage bucket. The second adds `learning_progress` with service-role-only access (RLS enabled, intentionally no public policies until real student auth exists). Embedding dimensions and vector indexes should be selected once the embedding provider/model is finalized.

## Environment files

Each service has an `.env.example`. Copy it to the local filename shown above and fill in credentials locally. Do not send secrets in chat, commit them, or add them to `NEXT_PUBLIC_*` variables.

## Current implementation status

- **Working without credentials:** floating Parrot widget on every page (launcher bottom-right, quick actions: explain / quiz me / test my understanding / revision plan), demo resource catalog at `/resources`, resource detail pages with passages and "Ask Parrot", the full learning loop in demo mode, and the uAgent gateway to the same endpoints.
- **With credentials:** real ASI:1 explanations and teach-back evaluation, Supabase-backed resources and durable learning progress.
- **Not implemented yet:** user accounts, real PDF ingestion/embedding retrieval, code-execution sandbox, Notion/Google Calendar/voice integrations, and verified Agentverse registration/ASI:One hosting (requires manual account setup and `AGENTVERSE_API_KEY`; see the agent section for what exists now).
=======
## API routes

- `GET /api/v1/academics` — college, branch, and course catalog.
- `GET /api/v1/resources?course_id=...&category=...` — published resource metadata.
- `GET /api/v1/resources/{id}/download` — short-lived signed link for a published private file.
- `POST /api/v1/admin/resources/upload` — authenticated multipart PDF/image ingestion to Supabase Storage and Postgres.
- `POST /api/v1/admin/resources/link` — authenticated external-link metadata ingestion. The API stores the URL but does not fetch it.

Admin ingestion calls require an `X-Ingestion-Key` header matching the server's `INGESTION_API_KEY`. New items start unpublished; publish them only after verifying course/category and permission to use the material.

The resource categories include the seven Fresources tabs — books, assignments, notes, practicals, papers, playlists, experiments — plus syllabus, previous questions, and tests.
>>>>>>> 48299e259552bcd96d9e5997f35bae5d20ab9192
