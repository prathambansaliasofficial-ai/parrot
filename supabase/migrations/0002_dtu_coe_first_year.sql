-- First-year DTU Computer Engineering (COE) demo catalog.
-- Course names below were read from the signed-in Fresources subject selector.
-- Resource rows/files are added through the protected API after authorized material is selected.

alter table public.courses
    add column if not exists academic_year smallint not null default 1;

alter table public.resources
    add column if not exists original_file_name text,
    add column if not exists content_type text,
    add column if not exists file_size_bytes bigint,
    add column if not exists source_platform text,
    add column if not exists is_demo boolean not null default false;

create index if not exists courses_branch_year_semester_idx
    on public.courses(branch_id, academic_year, semester);

insert into public.colleges (name, slug)
values ('Delhi Technological University', 'dtu')
on conflict (slug) do update set name = excluded.name;

insert into public.branches (college_id, name, code)
select c.id, 'Computer Engineering', 'COE'
from public.colleges c
where c.slug = 'dtu'
on conflict (college_id, name) do update set code = excluded.code;

insert into public.courses (branch_id, name, code, semester, academic_year)
select b.id, seed.name, seed.code, seed.semester, 1
from public.branches b
join public.colleges c on c.id = b.college_id
cross join (
    values
        ('Maths', 'DTU-COE-Y1-S1-MATHS', '1'),
        ('Programming Fundamentals', 'DTU-COE-Y1-S1-PF', '1'),
        ('Basic ECE', 'DTU-COE-Y1-S1-ECE', '1'),
        ('Web design', 'DTU-COE-Y1-S1-WEB', '1'),
        ('Eng Graphics -2', 'DTU-COE-Y1-S1-EG2', '1'),
        ('Data Structures and Algorithms', 'DTU-COE-Y1-S2-DSA', '2'),
        ('Discrete Structures', 'DTU-COE-Y1-S2-DS', '2'),
        ('AM102 Maths', 'DTU-COE-Y1-S2-AM102', '2'),
        ('Basics of ML & Applications', 'DTU-COE-Y1-S2-ML', '2'),
        ('Physics', 'DTU-COE-Y1-S2-PHY', '2')
) as seed(name, code, semester)
where c.slug = 'dtu' and b.code = 'COE'
on conflict (branch_id, name) do update
set code = excluded.code,
    semester = excluded.semester,
    academic_year = excluded.academic_year;
