# Supabase users, login activity, and admin setup

The project already uses Supabase. This update adds central user profiles and login activity to the existing `survey_submissions` and `user_roles` setup. The profile table contains account identity/contact fields and timestamps only; passwords remain in Supabase Auth. Row Level Security lets a user read only their own profile/activity, while the assigned admin can read all application records.

## 1. Confirm the browser configuration

`css/js/supabase-config.js` should contain this project's Supabase Project URL and public Publishable/anon key. These are browser-safe values. Never put a Supabase Secret or `service_role` key in HTML or JavaScript.

## 2. Keep registration password-only

In Supabase Dashboard, open **Authentication → Sign In / Providers → Email** (or the Email provider settings) and turn **Confirm email** off. This project intentionally does not use email verification, OTP, or magic links. If confirmation remains enabled, Supabase returns no session from registration and the page will explain the setting needed.

## 3. Add the user and activity tables

1. Open **SQL Editor → New query**.
2. Run the updated `supabase-admin-setup.sql` file from this project. It is safe to run again: it keeps the existing survey table and admin role, adds `user_profiles` and `user_login_activity`, backfills existing Supabase Auth users without copying passwords, and installs RLS policies and login/logout timestamp functions.
3. Wait a few seconds for the Data API schema cache to refresh, then retry Admin Login. The SQL ends by notifying PostgREST to reload its schema cache. If the function is still reported missing, run `NOTIFY pgrst, 'reload schema';` in the Supabase SQL Editor and retry.
3. Keep the existing authorized admin account in `public.user_roles`. The project SQL includes its configured user UUID; do not add public admin registration or grant the `admin` role to survey users.

## 4. Registered users and activity behavior

- New Supabase Auth accounts automatically create a `user_profiles` row through a database trigger.
- Existing users in Supabase Auth are backfilled when the SQL runs.
- Browser-local accounts from the previous version can migrate only from the browser that contains that account: their next login checks the old local password hash, creates the Supabase Auth account, and removes any legacy plaintext password field after a successful login. Accounts held only in another browser cannot be recovered centrally and must be registered again. Legacy browser profiles without a password hash must also register again; the auth page removes any old plaintext password field.
- Login times are recorded by a database function when the user signs in. Logout time is recorded when they use the website's Logout link. Closing a tab or losing connectivity cannot reliably produce a logout event, so those rows may show no logout time.
- The Total Registered Users card excludes admin accounts. User search supports name/email and registration date. Passwords are never returned by the dashboard.

## 5. Test locally

1. Serve the project root over localhost with VS Code Live Server.
2. Create a test account, sign in, and submit a survey.
3. In Supabase **Table Editor**, confirm records in `user_profiles`, `user_login_activity`, and `survey_submissions`.
4. Open `admin-login.html` and sign in with the authorized Supabase admin email/password. Confirm the new user, login activity, and survey response appear.
5. Sign out and open `admin-dashboard.html` directly. It should return to the admin login; an ordinary authenticated user also cannot read admin-only rows because of RLS.

## 6. Deploy to Netlify

Deploy the updated site folder containing the root HTML pages, `css/`, and `assets/` to the existing Netlify site. The Supabase browser config is included; no service-role secret is needed in Netlify frontend files. If using the same Netlify URL, keep it in Supabase **Authentication → URL Configuration → Site URL** and Redirect URLs. Open the live site after deployment and repeat the survey/admin checks above.

Existing survey responses in Supabase are not deleted. Responses that existed only in browser `pp_submissions` localStorage are not automatically uploaded.
