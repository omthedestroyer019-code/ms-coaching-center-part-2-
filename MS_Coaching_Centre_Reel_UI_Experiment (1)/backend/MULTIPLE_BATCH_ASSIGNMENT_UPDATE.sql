-- M.S Coaching Centre: multiple batch assignment update
-- Run this once in Supabase SQL Editor before testing the new ZIP.
-- It lets one teacher and one student be assigned to many batches.

create extension if not exists "pgcrypto";

-- Student-to-many-batches mapping. Some older versions already have this table.
create table if not exists student_batches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  batch_id uuid references batches(id) on delete cascade,
  created_at timestamptz default now(),
  unique(student_id, batch_id)
);

-- Teacher-to-many-batches mapping. This is the new table required for multiple teacher batch assignment.
create table if not exists teacher_batches (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid references teachers(id) on delete cascade,
  batch_id uuid references batches(id) on delete cascade,
  created_at timestamptz default now(),
  unique(teacher_id, batch_id)
);

-- Keep old single-batch data working by copying it into the many-to-many tables.
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

alter table student_batches enable row level security;
alter table teacher_batches enable row level security;

-- Testing policies. Good for development/testing. Tighten later for production.
do $$
declare
  t text;
begin
  foreach t in array array['student_batches','teacher_batches'] loop
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
