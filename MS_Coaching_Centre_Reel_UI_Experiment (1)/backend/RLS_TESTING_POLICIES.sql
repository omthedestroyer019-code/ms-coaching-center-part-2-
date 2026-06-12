-- Starter/testing RLS policies for the PWA.
-- These allow authenticated users to use the app while you test.
-- For serious production, tighten these policies later by role.

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
