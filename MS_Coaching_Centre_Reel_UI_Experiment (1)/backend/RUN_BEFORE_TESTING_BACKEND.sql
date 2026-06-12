-- Run this once in Supabase SQL Editor before testing the backend-connected PWA.
-- It safely adds missing columns required by the latest app.

alter table attendance
add column if not exists entry_time text,
add column if not exists exit_time text,
add column if not exists status text check (status in ('present','absent','late')),
add column if not exists remarks text,
add column if not exists created_at timestamptz default now();

alter table fees
add column if not exists paid_amount numeric default 0,
add column if not exists created_at timestamptz default now();

insert into profiles (
  auth_user_id,
  full_name,
  email,
  phone,
  role,
  status
)
values (
  'c17aeb36-9935-4839-9b53-0ddc1cae8b0b',
  'Main Admin',
  'omthedestroyer019@gmail.com',
  null,
  'admin',
  'active'
)
on conflict (email) do update set
  auth_user_id = excluded.auth_user_id,
  role = 'admin',
  status = 'active';
