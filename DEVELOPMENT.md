# Development setup

This repository is a monorepo with separate processes for the website, API, and Fetch.ai agent.

## Layout

- `frontend/` — Next.js, React, TypeScript, and Tailwind CSS website.
- `backend/` — FastAPI application API and Supabase access.
- `agent/` — Python uAgent process. It is kept separate from the API so agent dependencies and runtime can be deployed independently.
- `supabase/migrations/` — database schema migrations.

The frontend calls the API. The API reads course/resource metadata from Supabase. The uAgent is the Fetch.ai agent runtime; ASI:1 and Agentverse credentials are configured only in server-side environment variables.

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
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
fastapi dev app/main.py
```

The API runs at http://localhost:8000. Health: http://localhost:8000/health. OpenAPI docs: http://localhost:8000/docs.

The health route works before Supabase is configured. The resource list route returns a clear service-unavailable response until its server-side Supabase settings are present.

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

## Supabase

Apply the SQL migration in `supabase/migrations/` to the Supabase project before using the resources endpoint. Resource rows are private by default through Row Level Security; the API uses a server-side credential. Do not expose a service-role/secret key in frontend variables.

The migration creates colleges, branches, courses, resources, and resource chunks. It includes the reference-site categories and a private `course-resources` storage bucket. Embedding dimensions and vector indexes should be selected once the embedding provider/model is finalized.

## Environment files

Each service has an `.env.example`. Copy it to the local filename shown above and fill in credentials locally. Do not send secrets in chat, commit them, or add them to `NEXT_PUBLIC_*` variables.

## Current scaffold status

The website currently contains a starter landing page, the API contains health and resource-list routes, and the agent contains a chat-protocol echo scaffold. Authentication, resource ingestion, grounded study behavior, and external integrations are follow-up implementation work.
