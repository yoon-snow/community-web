# Authentication

Google OAuth routes: `src/app/auth/`. Request-scoped verified Supabase SSR: `src/lib/supabase/server.ts` and `src/proxy.ts`. Approval/role checks and RLS are in `supabase/migrations/`. See root README for provider setup and manual first-admin bootstrap. A successful OAuth login does not grant membership.
