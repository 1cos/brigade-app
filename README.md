# Brigade — new app (reserved: Max + Pablo)

- `web/` — the app (static PWA). Talks only to the edge function `brigade-app-api`. Ships **no** Supabase key.
- `supabase/functions/brigade-app-api/` — server: session check, access list (app_access), all reads/writes.
- `supabase/migrations/` — additive: app_access, app_sessions, app_events, app_login(). Rollback in the file header.
- `base-frozen/` — the approved V020-B Clean Pass base (reference, do not edit).

Access: only users in `app_access` (Max id 1 chef, Pablo id 38 staff). URL is not the protection; the server is.
R1 writes go to `app_events` with `mode='test'` — they never touch prep_log, prep_stock_counts, chef_reports.
Release = git tag `r1.x`. Rollback = redeploy the previous tag.
