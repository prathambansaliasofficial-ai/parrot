-- 0003_remove_demo_academic_data.sql
--
-- Forward-only, idempotent removal of replicated demonstration data.
--
-- Scope: rows that were never genuine academic records.
--   1. Resources created by scripts/seed.mjs      -> resources.is_sample = 1
--   2. Resources published from the localhost PDF fixture server
--   3. Document assets that only ever came from that fixture server
--   4. Subjects that existed solely to host those sample resources
--
-- Deliberately PRESERVED:
--   * universities, programmes, categories, academic years (real reference data)
--   * every document_asset whose source is fms.aktu.ac.in / aktu.ac.in
--   * approval state and classification of genuine documents
--   * contributions, requests and tickets attached to real users
--
-- R2 objects are NOT deleted here. Object deletion is a separate, audited step
-- (see docs/DEMO-DATA-REMOVAL.md); a SQL migration must never silently destroy
-- a binary that a real record might reference.

PRAGMA foreign_keys = ON;

-- Localhost-only fixture assets, resolved once into a temp table so the three
-- statements below cannot disagree about the set.
DROP TABLE IF EXISTS temp._fixture_assets;
CREATE TEMP TABLE _fixture_assets AS
SELECT id
FROM document_assets
WHERE source_url LIKE 'http://localhost:%'
   OR source_url LIKE 'http://127.0.0.1:%'
   OR source_domain IN ('localhost', '127.0.0.1');

-- 1 + 2. Sample resources and fixture-server publications.
--        resources -> resource_files / resource_chunks / downloads cascade.
DELETE FROM resources
WHERE is_sample = 1
   OR id IN (
        SELECT j.published_resource_id
        FROM ingestion_jobs j
        JOIN _fixture_assets f ON f.id = j.asset_id
        WHERE j.published_resource_id IS NOT NULL
   );

-- 3. Fixture document assets (and their versions). ingestion_jobs.asset_id and
--    syllabus_versions.source_asset_id are ON DELETE SET NULL, so genuine rows
--    survive while losing the dangling reference.
DELETE FROM document_versions WHERE asset_id IN (SELECT id FROM _fixture_assets);
DELETE FROM document_assets   WHERE id IN (SELECT id FROM _fixture_assets);

-- 4. Sample subjects with no remaining resource. The NOT EXISTS guard preserves
--    a sample-flagged subject that a real resource happens to use.
DELETE FROM subjects
WHERE is_sample = 1
  AND NOT EXISTS (SELECT 1 FROM resources r WHERE r.subject_id = subjects.id);

DROP TABLE IF EXISTS temp._fixture_assets;

-- Honest site copy: the announcement that introduced the sample library must not
-- claim the catalog is populated with demonstrations.
UPDATE announcements
SET title = 'FreeResources is indexing AKTU academic material',
    body  = 'University and programme pages are real reference metadata. Resource lists stay empty until a verified document is approved, so nothing here is filled in with sample content.'
WHERE title = 'The library is live with a sample collection'
   OR body LIKE '%resources currently marked SAMPLE%';
