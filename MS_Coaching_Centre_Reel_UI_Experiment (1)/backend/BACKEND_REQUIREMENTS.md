# Backend requirements for M.S Coaching Centre

## Accounts/services required
1. Supabase project
2. Supabase Project URL
3. Supabase anon/public key
4. Supabase Auth admin user
5. Admin profile row in `profiles` table
6. Cloudinary account
7. Cloudinary cloud name
8. Cloudinary unsigned upload preset
9. Hosting for the PWA: Netlify, Vercel, GitHub Pages, or any static hosting
10. Later for APK: PWA-to-APK wrapper or Capacitor/Android Studio

## Backend responsibilities
- Supabase Auth: real login for admin/teacher/student
- Supabase Database: all app records
- Cloudinary: study material PDF/document/image storage
- Supabase `study_materials`: stores Cloudinary URL and metadata only

## Do not put these in frontend
- Supabase service_role key
- Cloudinary API secret
- Database password

## First backend setup order
1. Create Supabase project
2. Run `backend/supabase_schema.sql`
3. Create admin user in Supabase Auth
4. Insert admin row in `profiles`
5. Run or adapt `backend/rls_policies_starter.sql`
6. Create Cloudinary unsigned upload preset
7. Paste keys into `config.js`
8. Set `BACKEND_MODE: true`
9. Test admin login and material upload

## Admin profile insert example
Replace `AUTH_USER_ID_FROM_SUPABASE` with the Auth user UID.

```sql
insert into profiles (auth_user_id, full_name, email, phone, role, status)
values ('AUTH_USER_ID_FROM_SUPABASE', 'Main Admin', 'omthedestroyer019@gmail.com', null, 'admin', 'active');
```

## APK note
Make the backend-connected PWA stable first. APK conversion should come after login, upload, attendance, fees, and role restrictions work in the browser.
