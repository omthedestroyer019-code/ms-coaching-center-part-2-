# Your next backend steps

Your config has been filled with:
- Supabase URL
- Supabase public/publishable key
- Cloudinary cloud name

The Supabase secret key is NOT used anywhere in this frontend. Never put it in frontend code.

## Step 1: Supabase tables
Open Supabase > SQL Editor and run:
1. backend/supabase_schema.sql
2. backend/admin_profile_insert.sql
3. backend/rls_policies_starter.sql

## Step 2: Cloudinary unsigned upload preset
Open Cloudinary > Settings > Upload > Upload presets.
Create an unsigned preset:
- Name: ms_coaching_materials
- Signing mode: Unsigned
- Folder: ms-coaching/study-materials
- Use filename: ON
- Unique filename: ON
- Overwrite: OFF

Then open config.js and replace:
CLOUDINARY_UPLOAD_PRESET: "PASTE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET_HERE"
with:
CLOUDINARY_UPLOAD_PRESET: "ms_coaching_materials"

## Step 3: Backend mode
Only after SQL + RLS + Cloudinary preset are ready, change in config.js:
BACKEND_MODE: false

to:
BACKEND_MODE: true

Current app still uses demo login/data for most sections. Full final backend connection requires replacing demo CRUD/login functions with Supabase Auth and Supabase database queries.
