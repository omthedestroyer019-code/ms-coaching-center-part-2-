-- Run this AFTER:
-- 1) You create the admin user in Supabase Auth
-- 2) You run supabase_schema.sql
-- This connects the Supabase Auth admin user to app role = admin.

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
on conflict (auth_user_id) do update set
  full_name = excluded.full_name,
  email = excluded.email,
  role = excluded.role,
  status = excluded.status;
