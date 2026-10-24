-- Processing state and searchable source passages for Phase 2.
update storage.buckets
   set allowed_mime_types = array[
       'application/pdf', 'image/jpeg', 'image/png',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'
   ]
 where id = 'course-resources';

alter table public.resources
    add column if not exists processing_status text not null default 'pending'
        check (processing_status in ('pending', 'queued', 'processing', 'completed', 'failed', 'not_supported')),
    add column if not exists processing_error text,
    add column if not exists processing_started_at timestamptz,
    add column if not exists processed_at timestamptz,
    add column if not exists content_hash text,
    add column if not exists processing_version text;

alter table public.resource_chunks
    add column if not exists content_hash text,
    add column if not exists processing_version text,
    add column if not exists topic text,
    add column if not exists subtopic text,
    add column if not exists section_ref text;

create index if not exists resource_chunks_content_fts_idx
    on public.resource_chunks using gin (to_tsvector('english', content));
create index if not exists resource_chunks_content_hash_idx
    on public.resource_chunks(resource_id, content_hash, processing_version);
create index if not exists resources_processing_status_idx
    on public.resources(processing_status);
create unique index if not exists resources_course_category_content_hash_uq
    on public.resources(course_id, category, content_hash)
    where content_hash is not null and storage_path is not null;

create or replace function public.claim_resource_processing(target_resource_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
    claimed_id uuid;
begin
    update public.resources
       set processing_status = 'processing',
           processing_error = null,
           processing_started_at = now()
     where id = target_resource_id
       and (processing_status <> 'processing' or processing_started_at < now() - interval '30 minutes')
    returning id into claimed_id;
    return claimed_id is not null;
end;
$$;

revoke all on function public.claim_resource_processing(uuid) from public, anon, authenticated;
grant execute on function public.claim_resource_processing(uuid) to service_role;

create or replace function public.search_resource_chunks(
    search_query text,
    filter_resource_id uuid default null,
    filter_course_id uuid default null,
    filter_category text default null,
    result_limit integer default 5
)
returns table (
    chunk_id uuid,
    resource_id uuid,
    content text,
    page_number integer,
    section_ref text,
    topic text,
    subtopic text,
    title text,
    category text,
    course_id uuid,
    score real
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
    select
        rc.id,
        rc.resource_id,
        rc.content,
        rc.page_number,
        rc.section_ref,
        rc.topic,
        rc.subtopic,
        r.title,
        r.category,
        r.course_id,
        ts_rank_cd(to_tsvector('english', rc.content), websearch_to_tsquery('english', search_query))::real
    from public.resource_chunks rc
    join public.resources r on r.id = rc.resource_id
    where r.is_published = true
      and r.processing_status = 'completed'
      and (filter_resource_id is null or r.id = filter_resource_id)
      and (filter_course_id is null or r.course_id = filter_course_id)
      and (filter_category is null or r.category = filter_category)
      and to_tsvector('english', rc.content) @@ websearch_to_tsquery('english', search_query)
    order by ts_rank_cd(to_tsvector('english', rc.content), websearch_to_tsquery('english', search_query)) desc
    limit greatest(1, least(result_limit, 8));
$$;

revoke all on function public.search_resource_chunks(text, uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.search_resource_chunks(text, uuid, uuid, text, integer) to service_role;
