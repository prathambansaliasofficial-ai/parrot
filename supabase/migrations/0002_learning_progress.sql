-- Parrot learning-progress schema.
-- Apply after 0001_initial_schema.sql. Records one row per teach-back
-- assessment so revision plans can be built from real outcomes.
-- Rows are written/read by the API through the server-side Supabase
-- credential only; RLS is enabled with no public policies on purpose, which
-- also means the anon key cannot read student records. Add per-user policies
-- once real student authentication exists.

create table if not exists public.learning_progress (
    id uuid primary key default gen_random_uuid(),
    session_id text not null,
    resource_id text,
    topic text not null,
    question text not null,
    student_answer text not null,
    overall_assessment text not null
        check (overall_assessment in ('correct', 'partially_correct', 'incorrect', 'unclear')),
    correct_points jsonb not null default '[]'::jsonb,
    missing_points jsonb not null default '[]'::jsonb,
    misconceptions jsonb not null default '[]'::jsonb,
    next_question text,
    recommended_activity text,
    created_at timestamptz not null default now()
);

create index if not exists learning_progress_session_id_idx
    on public.learning_progress(session_id);
create index if not exists learning_progress_resource_id_idx
    on public.learning_progress(resource_id);
create index if not exists learning_progress_created_at_idx
    on public.learning_progress(created_at);

alter table public.learning_progress enable row level security;
