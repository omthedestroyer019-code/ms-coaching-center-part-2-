# M.S Coaching Centre — Backend Connected PWA

This version has backend mode ON in `config.js`.

## Connected now
- Supabase Auth login
- Supabase database read/write for teachers, students, batches, attendance, fees, notices, tests/results
- Attendance entry/exit time saving
- Fee paid/pending/overdue calculation from Supabase records
- Study material file upload to Cloudinary
- Study material metadata saved in Supabase

## Before testing
In Supabase SQL Editor, run:

1. `backend/RUN_BEFORE_TESTING_BACKEND.sql`
2. `backend/RLS_TESTING_POLICIES.sql`

Then open `index.html` or upload the folder to Netlify.

## Login
Admin login uses Supabase Auth:
- Email: `omthedestroyer019@gmail.com`
- Password: your Supabase Auth password

Teacher/student login will work only after you create their Supabase Auth users and matching `profiles` rows.

## Important security note
Your Supabase secret/service_role key must never be pasted into frontend files. This app only uses the public/publishable key.
