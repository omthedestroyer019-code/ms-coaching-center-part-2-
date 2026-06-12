-- M.S Coaching Centre Supabase schema
-- Run this in Supabase SQL Editor.
-- IMPORTANT: Do not put Supabase service_role key in frontend.

create extension if not exists "pgcrypto";

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique not null references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique not null,
  phone text,
  role text not null check (role in ('admin','teacher','student')),
  status text not null default 'active' check (status in ('active','inactive')),
  created_at timestamptz default now()
);

create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  email text unique not null,
  phone text,
  subject text,
  qualification text,
  status text default 'active',
  created_at timestamptz default now()
);

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id) on delete cascade,
  name text not null,
  email text unique,
  phone text,
  parent_name text,
  parent_phone text,
  class_name text,
  batch_id uuid,
  status text default 'active',
  admission_date date default current_date,
  created_by_teacher_id uuid references teachers(id),
  created_at timestamptz default now()
);

create table if not exists batches (
  id uuid primary key default gen_random_uuid(),
  batch_name text not null,
  class_name text,
  subject text,
  schedule text,
  teacher_id uuid references teachers(id),
  status text default 'active',
  description text,
  created_at timestamptz default now()
);

alter table students
  add constraint students_batch_id_fkey
  foreign key (batch_id) references batches(id)
  on delete set null;

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

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  batch_id uuid references batches(id) on delete cascade,
  teacher_id uuid references teachers(id),
  date date not null,
  entry_time time,
  exit_time time,
  status text check (status in ('present','absent','late')),
  remarks text,
  created_at timestamptz default now()
);

create table if not exists fees (
  id uuid primary key default gen_random_uuid(),
  student_id uuid references students(id) on delete cascade,
  amount numeric default 0,
  paid_amount numeric default 0,
  fee_type text,
  due_date date,
  payment_date date,
  status text check (status in ('paid','pending','partial','overdue')),
  remarks text,
  created_at timestamptz default now()
);

create table if not exists notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  priority text default 'normal' check (priority in ('normal','important','urgent')),
  target text default 'all' check (target in ('all','students','teachers','batch')),
  batch_id uuid references batches(id),
  created_by_profile_id uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists tests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  batch_id uuid references batches(id),
  teacher_id uuid references teachers(id),
  test_date date,
  total_marks numeric,
  created_at timestamptz default now()
);

create table if not exists test_results (
  id uuid primary key default gen_random_uuid(),
  test_id uuid references tests(id) on delete cascade,
  student_id uuid references students(id) on delete cascade,
  marks_obtained numeric,
  remarks text,
  created_at timestamptz default now()
);

create table if not exists study_materials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  subject text,
  batch_id uuid references batches(id),
  teacher_id uuid references teachers(id),
  uploaded_by_profile_id uuid references profiles(id),
  cloudinary_url text not null,
  cloudinary_public_id text,
  file_type text,
  file_size text,
  created_at timestamptz default now()
);

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
