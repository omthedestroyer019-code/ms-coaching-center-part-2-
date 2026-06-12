-- Starter RLS policies for M.S Coaching Centre
-- These are MVP policies to begin testing safely. Tighten further before real client use.
-- Run after supabase_schema.sql and after creating the admin profile.

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_profile_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from profiles where auth_user_id = auth.uid() and role = 'admin' and status = 'active');
$$;

create or replace function public.is_teacher()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from profiles where auth_user_id = auth.uid() and role = 'teacher' and status = 'active');
$$;

create or replace function public.is_student()
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists(select 1 from profiles where auth_user_id = auth.uid() and role = 'student' and status = 'active');
$$;

-- Profiles
create policy "profiles_select_own_or_admin" on profiles for select using (auth_user_id = auth.uid() or is_admin());
create policy "profiles_admin_all" on profiles for all using (is_admin()) with check (is_admin());

-- Admin can manage master records.
create policy "teachers_admin_all" on teachers for all using (is_admin()) with check (is_admin());
create policy "students_admin_all" on students for all using (is_admin()) with check (is_admin());
create policy "batches_admin_all" on batches for all using (is_admin()) with check (is_admin());
create policy "fees_admin_all" on fees for all using (is_admin()) with check (is_admin());

-- Teachers can read teacher/student/batch records they need.
create policy "teachers_read_self_and_admin" on teachers for select using (is_admin() or profile_id = current_profile_id() or is_teacher());
create policy "students_teacher_read" on students for select using (
  is_admin()
  or profile_id = current_profile_id()
  or exists (
    select 1 from batches b
    join teachers t on t.id = b.teacher_id
    where b.id = students.batch_id and t.profile_id = current_profile_id()
  )
);
create policy "batches_teacher_student_read" on batches for select using (
  is_admin()
  or exists(select 1 from teachers t where t.id = batches.teacher_id and t.profile_id = current_profile_id())
  or exists(select 1 from students s where s.batch_id = batches.id and s.profile_id = current_profile_id())
);

-- Attendance: admin/teacher can write, student can read own.
create policy "attendance_read_role_based" on attendance for select using (
  is_admin()
  or exists(select 1 from students s where s.id = attendance.student_id and s.profile_id = current_profile_id())
  or exists(select 1 from teachers t where t.id = attendance.teacher_id and t.profile_id = current_profile_id())
);
create policy "attendance_admin_teacher_write" on attendance for all using (is_admin() or is_teacher()) with check (is_admin() or is_teacher());

-- Fees: admin writes, student reads own. Teacher access intentionally blocked.
create policy "fees_admin_student_read" on fees for select using (
  is_admin()
  or exists(select 1 from students s where s.id = fees.student_id and s.profile_id = current_profile_id())
);
create policy "fees_admin_write" on fees for all using (is_admin()) with check (is_admin());

-- Notices/materials/tests: broad MVP read rules; write admin/teacher.
create policy "notices_read_logged_in" on notices for select using (auth.uid() is not null);
create policy "notices_admin_teacher_write" on notices for all using (is_admin() or is_teacher()) with check (is_admin() or is_teacher());

create policy "materials_read_logged_in" on study_materials for select using (auth.uid() is not null);
create policy "materials_admin_teacher_write" on study_materials for all using (is_admin() or is_teacher()) with check (is_admin() or is_teacher());

create policy "tests_read_logged_in" on tests for select using (auth.uid() is not null);
create policy "tests_admin_teacher_write" on tests for all using (is_admin() or is_teacher()) with check (is_admin() or is_teacher());

create policy "results_read_logged_in" on test_results for select using (auth.uid() is not null);
create policy "results_admin_teacher_write" on test_results for all using (is_admin() or is_teacher()) with check (is_admin() or is_teacher());
