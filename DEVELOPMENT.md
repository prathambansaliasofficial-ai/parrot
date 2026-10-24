# Development setup

This repository is a monorepo with separate processes for the website, API, and Fetch.ai agent.

## Layout

- `frontend/` — Next.js, React, TypeScript, and Tailwind CSS website.
- `backend/` — FastAPI application API, tutoring services and Supabase access.
- `agent/` — Python uAgent process. It is kept separate from the API so agent dependencies and runtime can be deployed independently.
- `supabase/migrations/` — database schema migrations.

The frontend calls the API. The API retrieves course/resource material and runs the tutoring engine; the uAgent routes chat-protocol messages to the same API, so website and agent share one tutoring implementation. Supabase and ASI:1 credentials are configured only in server-side environment variables.

## Demo mode (implemented, honest)

Without credentials nothing is faked:

- With no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `/api/v1/resources` serves a clearly labelled demo catalog (`demo-…` ids, two curated resources with passages, quiz banks and teach-back rubrics in `app/services/demo_data.py`).
- With no `ASI_ONE_API_KEY`, tutor replies run in deterministic demo mode and every response carries `"demo_mode": true` (plus a visible `[Parrot demo mode …]` banner in text). Configure the key to switch to real ASI:1 calls.
- Learning progress stores to Supabase when configured, otherwise to an in-process demo store that resets on restart.

## Requirements

- Node.js 22 or newer (Next.js currently requires Node.js 20.9 or newer).
- Python 3.12.
- A Supabase project for resource queries. Credentials can be added later.

## Frontend

```sh
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000.

## API

```sh
cd backend
python -m venv .venv
source .venv/Scripts/activate   # on Windows; `source .venv/bin/activate` on POSIX
python -m pip install -r requirements.txt
.venv/Scripts/python -m uvicorn app.main:app --port 8000   # fastapi dev app/main.py also works
```

The API runs at http://localhost:8000. Health: http://localhost:8000/health. OpenAPI docs: http://localhost:8000/docs.

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

## Fetch.ai agent

Use a separate virtual environment from the API:

```sh
cd agent
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Set a private `UAGENT_SEED` locally before running the agent. Never use the example text as a seed or commit the generated value. Agentverse and ASI:1 keys can be added when they are issued.

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
