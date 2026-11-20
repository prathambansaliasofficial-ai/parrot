# Test / development fixtures

Everything in this directory is **test data**. None of it is a real academic
resource and none of it is imported by application code.

| File | What it holds |
| --- | --- |
| `sample-catalog.json` | Inventory of the sample subjects, sample resources and localhost fixture URLs that `scripts/seed.mjs --with-fixtures` creates. |

## Rules

1. `scripts/seed.mjs` (run by `npm run db:seed`) seeds **reference metadata only**:
   universities, programmes, categories, academic years, site settings, FAQs.
   It creates no resources and no subjects.
2. The sample catalog is created only by `npm run db:seed:fixtures`
   (`scripts/seed.mjs --with-fixtures`) against a local database.
3. Fixture rows are written with `is_sample = 1`, so
   `db/d1/0003_remove_demo_academic_data.sql` removes exactly them and nothing
   else.
4. Never point `--with-fixtures` at a production D1 database or a Supabase
   project used by students.
