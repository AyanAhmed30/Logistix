-- STEP 055 — Super Admin default company
-- Stores the company Super Admin starts in after each login. The active company
-- still lives in the session; this is only the starting point.
--
-- Super Admin has no app_users row (portal users already have
-- app_users.default_organization), so the preference is keyed by username.
-- Deleting an organization clears the preference and login falls back to Admin.
-- New table only. Idempotent. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.admin_preferences (
  username text PRIMARY KEY,
  default_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The app has its own login, so access is checked in the server actions and
-- this table is closed to everything except the service role.
ALTER TABLE public.admin_preferences ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.admin_preferences FROM anon, authenticated;
GRANT ALL ON TABLE public.admin_preferences TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_preferences' AND policyname = 'Service role only'
  ) THEN
    CREATE POLICY "Service role only" ON public.admin_preferences
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
