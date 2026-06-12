-- M.S Coaching Centre assign-user workflow schema safety update
-- Run this if Assign Student/Assign Teacher or Edit fails because a column is missing.

alter table profiles add column if not exists phone text;
alter table profiles add column if not exists status text default 'active';

alter table teachers add column if not exists profile_id uuid references profiles(id) on delete cascade;
alter table teachers add column if not exists email text;
alter table teachers add column if not exists phone text;
alter table teachers add column if not exists subject text;
alter table teachers add column if not exists qualification text;
alter table teachers add column if not exists status text default 'active';

alter table students add column if not exists profile_id uuid references profiles(id) on delete cascade;
alter table students add column if not exists email text;
alter table students add column if not exists phone text;
alter table students add column if not exists parent_name text;
alter table students add column if not exists parent_phone text;
alter table students add column if not exists class_name text;
alter table students add column if not exists batch_id uuid references batches(id) on delete set null;
alter table students add column if not exists status text default 'active';
alter table students add column if not exists admission_date date default current_date;
