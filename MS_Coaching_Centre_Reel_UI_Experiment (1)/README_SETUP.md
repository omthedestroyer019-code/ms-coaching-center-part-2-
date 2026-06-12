# M.S Coaching Centre PWA

This is a mobile-first PWA demo prepared for backend integration.

## Demo mode
Open `index.html` directly in browser.

Demo logins:
- Admin: `omthedestroyer019@gmail.com` / `22102008`
- Teacher: `teacher@mscoaching.com` / `teacher123`
- Student: `student@mscoaching.com` / `student123`

## Current features
- Admin / Teacher / Student role-based login demo
- Teacher fee section removed/blocked
- Student fee view allowed
- Admin fee dashboard with total fee, pending, overdue, revenue and pie chart
- Search in all major sections
- Attendance entry/exit time
- Admin/teacher can edit attendance timing
- Student can only view attendance
- Study material file picker in demo mode
- Backend-ready Cloudinary upload function
- Backend-ready Supabase metadata save function

## Backend mode
Edit `config.js`:

```js
window.APP_CONFIG = {
  BACKEND_MODE: true,
  SUPABASE_URL: "your_supabase_url",
  SUPABASE_ANON_KEY: "your_supabase_anon_key",
  CLOUDINARY_CLOUD_NAME: "your_cloudinary_cloud_name",
  CLOUDINARY_UPLOAD_PRESET: "your_unsigned_upload_preset"
};
```

Never paste service role key, database password, or Cloudinary API secret in frontend.

## Backend files
See the `backend/` folder:
- `BACKEND_REQUIREMENTS.md`
- `supabase_schema.sql`
- `rls_policies_starter.sql`
- `CLOUDINARY_SETUP.md`
- `APK_NEXT_STEPS.md`

## Important
This app is backend-ready, but only study material upload has the Cloudinary/Supabase backend-ready flow wired. Full Supabase Auth + CRUD replacement should be done step-by-step after testing demo mode.


## Provided backend values
config.js has been filled with your Supabase URL, Supabase public key, and Cloudinary cloud name. The secret key is intentionally not included. Run backend/admin_profile_insert.sql after the main schema.
