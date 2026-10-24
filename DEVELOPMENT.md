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

Set `SUPABASE_URL`, a server-side `SUPABASE_SECRET_KEY` (or temporary legacy `SUPABASE_SERVICE_ROLE_KEY`), and a long random `INGESTION_API_KEY` in the local `backend/.env`. Keep these values out of the frontend, chat, and GitHub. A Supabase publishable key is not an admin/server credential. Optional answer generation uses `ASI_ONE_API_KEY`, `ASI_ONE_BASE_URL`, and `ASI_ONE_MODEL`; without them, keyword retrieval still works and `/ask` reports that generation is unavailable.

## Supabase catalog and storage

Apply migrations in order in the Supabase SQL Editor:

1. `supabase/migrations/0001_initial_schema.sql`
2. `supabase/migrations/0002_dtu_coe_first_year.sql`
3. `supabase/migrations/0003_document_ingestion_and_search.sql`

The second migration creates the ten DTU COE first-year course records visible on Fresources. It does not invent resource files or claim sample material is official. The private `course-resources` bucket stores uploaded PDFs and images; external resource links are stored as metadata in Postgres. The API does not save uploaded files to its local disk.

## API routes

- `GET /api/v1/academics` — college, branch, and course catalog.
- `GET /api/v1/resources?course_id=...&category=...` — published resource metadata.
- `GET /api/v1/resources/{id}/download` — short-lived signed link for a published private file.
- `POST /api/v1/admin/resources/upload` — authenticated multipart PDF/image ingestion to Supabase Storage and Postgres.
- `POST /api/v1/admin/resources/link` — authenticated external-link metadata ingestion. The API stores the URL but does not fetch it.

Admin ingestion calls require an `X-Ingestion-Key` header matching the server's `INGESTION_API_KEY`. New items start unpublished; publish them only after verifying course/category and permission to use the material.

The resource categories include the seven Fresources tabs — books, assignments, notes, practicals, papers, playlists, experiments — plus syllabus, previous questions, and tests.

## Document ingestion and retrieval

### Gap analysis from the existing backend

Before this milestone, uploads only stored the original file and resource metadata; there was no extraction status, text/chunk pipeline, topic endpoint, full-text search index, or resource-grounded question endpoint. The original upload route allowed PDF/JPEG/PNG and link records were metadata-only. This milestone keeps those contracts, adds DOCX/TXT ingestion and image `not_supported` state, and uses the existing `resource_chunks` table rather than putting whole documents into vector records.

Install test dependencies with `python -m pip install -r requirements-dev.txt`; run the suite from `backend/` with `pytest`. Run the API from `backend/` so it reads `backend/.env`.

- Upload accepts PDF, JPEG, PNG, DOCX, and UTF-8 TXT with matching extensions and MIME types. Images remain downloadable but are marked `not_supported` for text extraction. PDFs, DOCX, and TXT are extracted in a FastAPI background task after the original is stored privately.
- Extraction preserves PDF page numbers and heading/section references, limits page count and text size, detects empty/scanned PDFs, chunks text, and stores passages in `resource_chunks`. OCR is not enabled.
- Processing is retried through `POST /api/v1/admin/resources/{resource_id}/process`. Check it with `GET /api/v1/admin/resources/{resource_id}/processing-status`. Both require `X-Ingestion-Key`.
- `POST /api/v1/resources/search` accepts `query` and optional `resource_id`, `course_id`, `category`, and `limit`; it returns passages with source IDs/page/section and an evidence flag. Search uses PostgreSQL full-text search through `search_resource_chunks` and only searches published resources with completed processing.
- `POST /api/v1/resources/ask` accepts the same filters. Without ASI credentials, it returns retrieved source passages and explicitly reports that generation is unavailable. With credentials, it asks the configured OpenAI-compatible ASI endpoint to answer from those passages and cite `[Source N]` references.
- `GET /api/v1/resources/{resource_id}/topics` returns headings/topics and associated pages.

Example search request:

```json
{
  "query": "Explain Faraday's law",
  "resource_id": "00000000-0000-4000-8000-000000000000",
  "limit": 5
}
```

### Manual end-to-end verification

1. Apply migrations `0001`, `0002`, and `0003` in order in Supabase SQL Editor. The first migration creates the private bucket; the third updates its allowed MIME types.
2. Put the server-side Supabase secret and a separate random ingestion key in `backend/.env`. Keep both out of browser settings and GitHub. Start FastAPI from `backend/`.
3. Call `GET /api/v1/academics`, select the intended DTU course UUID, then upload an authorized document:

   ```sh
   curl -X POST http://localhost:8000/api/v1/admin/resources/upload \
     -H "X-Ingestion-Key: ${INGESTION_API_KEY}" \
     -F "course_id=${COURSE_ID}" -F "title=Faraday law notes" \
     -F "category=notes" -F "file=@./faraday-notes.pdf;type=application/pdf"
   ```

4. Check `GET /api/v1/admin/resources/{resource_id}/processing-status` with the same key until it says `completed`. Verify the file exists in the private bucket and that chunk count is greater than zero.
5. Publish the reviewed item with `POST /api/v1/admin/resources/{resource_id}/publish` and the ingestion key. Search it with `POST /api/v1/resources/search`, supplying both the question and selected resource UUID; verify the returned resource ID and page references.
6. Call `POST /api/v1/resources/ask` with the same resource filter. Without ASI credentials, it must return source passages and `generation_available: false`; after configuring a valid ASI key, it can return a generated answer with source markers.

URL resources are currently saved as links only; the backend does not fetch them. This avoids SSRF risk but means URL text extraction is not implemented yet. No embedding provider is configured; this milestone uses indexed keyword search. The background tasks run in the API process, so deploy one worker or move to a durable queue before scaling horizontally. Supabase migration application, real storage access, and live ASI generation need the project's credentials and have not been verified by the local test suite.
