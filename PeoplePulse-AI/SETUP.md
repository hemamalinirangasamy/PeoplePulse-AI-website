# PeoplePulse AI setup

The public website uses Supabase Auth for new email/password accounts, and Supabase Postgres for account profiles, login activity, and survey submissions. User passwords are handled by Supabase Auth and are never copied to the profile or activity tables. Browser-local accounts created by the older version can migrate on their original browser the first time the user logs in with the same email and password.

Complete the project settings and SQL steps in [SETUP_SUPABASE_ADMIN.md](SETUP_SUPABASE_ADMIN.md) before using registration and login. Email confirmation must be disabled because this project uses password-only login without OTP or email verification.

The client-side Supabase URL and publishable key are in `css/js/supabase-config.js`. Only public browser keys belong there; never put a secret or `service_role` key in website files.

Older survey responses already in `public.survey_submissions` remain available. Responses saved only in browser `localStorage` are not automatically migrated. Existing local-only accounts from another browser cannot be migrated because their records are not available to this site; those users need to create a new account.
