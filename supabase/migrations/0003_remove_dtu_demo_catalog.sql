-- Forward-only cleanup of the DTU COE first-year demo catalog.
--
-- supabase/migrations/0002_dtu_coe_first_year.sql created one college (DTU),
-- one branch (COE) and ten first-year courses whose codes start with
-- 'DTU-COE-'. Those ten course rows are demonstration metadata: no official
-- AKTU/DTU material backs them.
--
-- This migration is idempotent and safe to re-run. It removes only rows that
-- nothing legitimate depends on:
--   * courses that match the demo code prefix AND have no resources
--   * the demo branch, only when no course remains in it
--   * the college is KEPT (it is a real institution other data may reference)
--
-- It never edits 0002 itself, so databases that already applied it are cleaned
-- forward instead of being rewritten.

begin;

-- 1. Demo resources (created with is_demo = true) that were never populated
--    with passages. A demo row that someone turned into real material keeps its
--    chunks and is preserved for explicit review.
delete from public.resources r
where r.is_demo = true
  and not exists (
    select 1 from public.resource_chunks c where c.resource_id = r.id
  );

-- 2. The ten demo courses, only while no resource references them.
delete from public.courses c
using public.branches b,
      public.colleges col
where c.branch_id = b.id
  and b.college_id = col.id
  and col.slug = 'dtu'
  and b.code = 'COE'
  and c.code like 'DTU-COE-%'
  and not exists (
    select 1 from public.resources r where r.course_id = c.id
  );

-- 3. The demo branch, only once it is empty.
delete from public.branches b
using public.colleges col
where b.college_id = col.id
  and col.slug = 'dtu'
  and b.code = 'COE'
  and not exists (
    select 1 from public.courses c where c.branch_id = b.id
  );

commit;
