# PeoplePulse AI local authentication

The user flow uses browser-local accounts. Registration stores the user's profile and a salted PBKDF2 password hash in `localStorage` under `pp_users`. Login checks the email and password locally, then opens `survey.html`.

No Supabase project, email confirmation, OTP, SMS service, or verification configuration is used by the user login flow. Serve the site from `localhost` or HTTPS so the browser's Web Crypto API is available; opening the pages directly with `file://` may prevent password hashing.

Survey submissions remain in `localStorage` under `pp_submissions`. Authentication changes do not delete existing submissions. Local browser storage is specific to that browser profile and device, so this setup is suitable for a college project prototype rather than shared production accounts.
