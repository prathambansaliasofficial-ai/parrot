# Sample-data removal report

Generated as part of the D1 migration / AKTU data-import work.
This documents **what was demo data, where it came from, and how it is removed**
without touching genuine records.

## What was demo data

| Source | Records | What it fabricated |
| --- | --- | --- |
| `supabase/migrations/0002_dtu_coe_first_year.sql` | 10 courses + 1 branch | DTU Computer Engineering first-year course rows (`DTU-COE-Y1-*`) with no backing material |
| `freeresources/scripts/seed.mjs` (sample seed) | 14 resources + 7 subjects | "SAMPLE" PDFs with fake question papers/notes/syllabi, fake download/view counters, `Demo University`-style course descriptions |
| `backend/app/services/demo_data.py` | 2 resources, 2 quizzes, 2 teach-back rubrics | Faraday's law notes, Python lists notes, demo college/course metadata |
| Acquired *fixture* documents | 3 assets, 3 published resources | `http://localhost:4111/syllabus-ds.pdf` 1.6 KB test PDFs published as "First Year CSE Stream (Common) — Syllabus" |

Totals identified: **27 resource rows, 7 subjects, 10 courses, 1 branch, 3 document assets.**

## How it is removed

Nothing was deleted by editing a historical migration. Two forward-only,
idempotent migrations do the work:

- `freeresources/db/d1/0003_remove_demo_academic_data.sql` (D1)
  - deletes `resources.is_sample = 1`
  - deletes resources published from `localhost`/`127.0.0.1` fixture assets
  - deletes those fixture `document_assets` and `document_versions`
  - deletes sample subjects that no remaining resource references
  - rewrites the "sample collection" announcement copy
- `supabase/migrations/0003_remove_dtu_demo_catalog.sql` (Supabase/Postgres)
  - deletes the ten `DTU-COE-%` demo courses **only if no resource references them**
  - deletes the `COE` demo branch **only once it is empty**
  - keeps the `dtu` college row, which is a real institution other data may use
  - deletes demo resources that never received passages

Both migrations are safe to re-run: they are `DELETE … WHERE` statements with
`NOT EXISTS` guards, so a second run removes nothing.

## What is preserved

- Every genuine document asset (source `fms.aktu.ac.in`): **6 documents**,
  including the 100-page CSE Stream 2026-27 course structure.
- All approval state: the 5 course-structure documents stay unpublished, the
  CSE Stream document stays published and correctly classified as a
  `course_structure` (not a Data Structures syllabus). Its `in_review` syllabus
  version stays `in_review`.
- Real institutions: universities, programmes, categories, academic years.
- Contributions, requests, tickets and audit history belonging to real users.

## Production no longer seeds demo content

- `npm run db:seed` seeds reference metadata only (no subjects, no resources).
- The sample catalog moved behind `npm run db:seed:fixtures`
  (`scripts/seed.mjs --with-fixtures`) and is inventoried in
  `tests/fixtures/sample-catalog.json`.
- `GET /api/v1/resources` returns `[]` when no catalog is configured; the
  website renders an explicit "no resources indexed yet" state.
- The backend `demo_data.py` fixture is no longer served as a catalog; it remains
  only for the labelled `demo_mode` tutor loop that runs when no AI key is set.

## R2 objects

The migration deliberately does **not** delete R2 objects. Deleting a binary is a
separate, audited operation because a real record might reference the same
object key. The three localhost fixture PDFs (1.6 KB each) should be removed from
the development bucket once the SQL has been applied:

```sh
npx wrangler r2 object delete freeresources-originals-dev/<storage-key> --config wrangler.jsonc
```

Check `document_assets` for the storage keys first. Do not delete anything whose
`source_url` is on `fms.aktu.ac.in`.

## How to verify

```sh
cd freeresources
npm run d1:migrate:local        # applies 0003
npx wrangler d1 execute freeresources-dev --local --config wrangler.jsonc \
  --command "SELECT COUNT(*) AS sample_resources FROM resources WHERE is_sample = 1"
npx wrangler d1 execute freeresources-dev --local --config wrangler.jsonc \
  --command "SELECT COUNT(*) AS fixture_assets FROM document_assets WHERE source_url LIKE 'http://localhost%'"
```

Both counts must be `0`. Then confirm the genuine set:

```sh
npm run data:aktu:verify
```

Expected: 6 genuine documents, 1 published, 5 pending, 3 fixtures excluded.

## Current status of this run

The repository in this workspace contains **no database, no `.wrangler` state and
no PDFs** — they are local to the developer machine. The migrations and tooling
are committed and syntax-verified; applying them to a live D1/Supabase instance
must be done where those databases exist. No row counts above are claimed as
already deleted.
