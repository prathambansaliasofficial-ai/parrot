-- Parrot / FreeResources starter schema.
-- Apply this migration to the Supabase project before using the resource API.

create extension if not exists vector with schema extensions;

create table if not exists public.colleges (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text not null unique,
    logo_url text,
    created_at timestamptz not null default now()
);

create table if not exists public.branches (
    id uuid primary key default gen_random_uuid(),
    college_id uuid not null references public.colleges(id) on delete cascade,
    name text not null,
    code text,
    created_at timestamptz not null default now(),
    unique (college_id, name)
);

create table if not exists public.courses (
    id uuid primary key default gen_random_uuid(),
    branch_id uuid not null references public.branches(id) on delete cascade,
    name text not null,
    code text,
    semester text,
    created_at timestamptz not null default now(),
    unique (branch_id, name)
);

create table if not exists public.resources (
    id uuid primary key default gen_random_uuid(),
    course_id uuid not null references public.courses(id) on delete cascade,
    title text not null,
    category text not null check (
        category in (
            'books',
            'assignments',
            'notes',
            'practicals',
            'papers',
            'playlists',
            'experiments',
            'syllabus',
            'previous_questions',
            'tests'
        )
    ),
    description text,
    storage_path text,
    source_url text,
    is_published boolean not null default false,
    created_at timestamptz not null default now()
);

create table if not exists public.resource_chunks (
    id uuid primary key default gen_random_uuid(),
    resource_id uuid not null references public.resources(id) on delete cascade,
    chunk_index integer not null check (chunk_index >= 0),
    page_number integer,
    content text not null,
    embedding extensions.vector,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    unique (resource_id, chunk_index)
);

create index if not exists branches_college_id_idx on public.branches(college_id);
create index if not exists courses_branch_id_idx on public.courses(branch_id);
create index if not exists resources_course_id_idx on public.resources(course_id);
create index if not exists resources_category_idx on public.resources(category);
create index if not exists resources_published_idx on public.resources(is_published);
create index if not exists resource_chunks_resource_id_idx on public.resource_chunks(resource_id);

alter table public.colleges enable row level security;
alter table public.branches enable row level security;
alter table public.courses enable row level security;
alter table public.resources enable row level security;
alter table public.resource_chunks enable row level security;

-- The initial backend reads with a server-side Supabase secret key. Keep that key
-- in backend environment variables only. Add student-facing RLS policies before
-- enabling direct browser reads or user-owned writes.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'course-resources',
    'course-resources',
    false,
    52428800,
    array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;
