# Development setup

This repository is a monorepo with separate processes for the website, API, and Fetch.ai agent.

## Layout

- `frontend/` — Next.js, React, TypeScript, and Tailwind CSS website.
- `backend/` — FastAPI catalog API and Supabase file/metadata ingestion.
- `agent/` — Python uAgent process, kept separate from the API.
- `supabase/migrations/` — database schema and DTU first-year demo catalog.

## Backend setup

Copy the ignored local environment file and fill its blank server-only values:

```sh
cd backend
cp .env.example .env
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
fastapi dev app/main.py
```

The API runs at http://localhost:8000. Health: http://localhost:8000/health. OpenAPI docs: http://localhost:8000/docs.

Set `SUPABASE_URL`, a server-side `SUPABASE_SECRET_KEY` (or temporary legacy `SUPABASE_SERVICE_ROLE_KEY`), and a long random `INGESTION_API_KEY` in the local `backend/.env`. Keep these values out of the frontend, chat, and GitHub. A Supabase publishable key is not an admin/server credential.

## Supabase catalog and storage

Apply migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_dtu_coe_first_year.sql`

The second migration creates the ten DTU COE first-year course records visible on Fresources. It does not invent resource files or claim sample material is official. The private `course-resources` bucket stores uploaded PDFs and images; external resource links are stored as metadata in Postgres. The API does not save uploaded files to its local disk.

## API routes

- `GET /api/v1/academics` — college, branch, and course catalog.
- `GET /api/v1/resources?course_id=...&category=...` — published resource metadata.
- `GET /api/v1/resources/{id}/download` — short-lived signed link for a published private file.
- `POST /api/v1/admin/resources/upload` — authenticated multipart PDF/image ingestion to Supabase Storage and Postgres.
- `POST /api/v1/admin/resources/link` — authenticated external-link metadata ingestion. The API stores the URL but does not fetch it.

Admin ingestion calls require an `X-Ingestion-Key` header matching the server's `INGESTION_API_KEY`. New items start unpublished; publish them only after verifying course/category and permission to use the material.

The resource categories include the seven Fresources tabs — books, assignments, notes, practicals, papers, playlists, experiments — plus syllabus, previous questions, and tests.
