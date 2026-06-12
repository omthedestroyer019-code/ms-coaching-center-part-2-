-- M.S Coaching Centre: Student material reach + assignment SQL fix
-- Paste this full SQL in Supabase SQL Editor and click Run.

create extension if not exists "pgcrypto";

alter table students
add column if not exists batch_id uuid references batches(id) on delete set null;

alter table batches
add column if not exists teacher_id uuid references teachers(id) on delete set null;

create table if not exists student_batches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  batch_id uuid references batches(id) on delete cascade,
  created_at timestamptz default now(),
  unique(student_id, batch_id)
);

create table if not exists teacher_batches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  batch_id uuid references batches(id) on delete cascade,
  created_at timestamptz default now(),
  unique(teacher_id, batch_id)
);

-- Make sure material table has the columns used by the app.
alter table study_materials
add column if not exists title text,
add column if not exists description text,
add column if not exists subject text,
add column if not exists batch_id uuid references batches(id) on delete set null,
add column if not exists teacher_id uuid references teachers(id) on delete set null,
add column if not exists uploaded_by_profile_id uuid references profiles(id) on delete set null,
add column if not exists cloudinary_url text,
add column if not exists cloudinary_public_id text,
add column if not exists file_type text,
add column if not exists file_size text,
add column if not exists created_at timestamptz default now();

-- Copy old single-batch links into multi-batch link tables.
insert into student_batches (student_id, batch_id)
select id, batch_id
from students
where batch_id is not null
on conflict (student_id, batch_id) do nothing;

insert into teacher_batches (teacher_id, batch_id)
select teacher_id, id
from batches
where teacher_id is not null
on conflict (teacher_id, batch_id) do nothing;

-- If multiple-batch table has data but old fallback column is empty, fill it.
update students s
set batch_id = sb.batch_id
from student_batches sb
where s.id = sb.student_id
and s.batch_id is null;

update batches b
set teacher_id = tb.teacher_id
from teacher_batches tb
where b.id = tb.batch_id
and b.teacher_id is null;

alter table profiles enable row level security;
alter table teachers enable row level security;
alter table students enable row level security;
alter table batches enable row level security;
alter table student_batches enable row level security;
alter table teacher_batches enable row level security;
alter table attendance enable row level security;
alter table fees enable row level security;
alter table notices enable row level security;
alter table tests enable row level security;
alter table test_results enable row level security;
alter table study_materials enable row level security;

-- Testing policies: open to authenticated users so the PWA can read assignments/materials during testing.
do $$
declare
  t text;
begin
  foreach t in array array['profiles','teachers','students','batches','student_batches','teacher_batches','attendance','fees','notices','tests','test_results','study_materials'] loop
    execute format('drop policy if exists "authenticated read %I" on %I', t, t);
    execute format('drop policy if exists "authenticated insert %I" on %I', t, t);
    execute format('drop policy if exists "authenticated update %I" on %I', t, t);
    execute format('drop policy if exists "authenticated delete %I" on %I', t, t);
    execute format('create policy "authenticated read %I" on %I for select to authenticated using (true)', t, t);
    execute format('create policy "authenticated insert %I" on %I for insert to authenticated with check (true)', t, t);
    execute format('create policy "authenticated update %I" on %I for update to authenticated using (true) with check (true)', t, t);
    execute format('create policy "authenticated delete %I" on %I for delete to authenticated using (true)', t, t);
  end loop;
end $$;
