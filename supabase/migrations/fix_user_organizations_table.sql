-- =====================================================
-- Create user_organizations (required for company assign)
-- Run in Supabase SQL Editor, then click Run query.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id UUID NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_organizations_organization_id
  ON public.user_organizations (organization_id);

CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id
  ON public.user_organizations (user_id);

ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_organizations'
      AND policyname = 'Full access for service role'
  ) THEN
    CREATE POLICY "Full access for service role"
      ON public.user_organizations
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Expose to PostgREST / reload schema cache
GRANT ALL ON TABLE public.user_organizations TO postgres, anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';

-- Verify
SELECT to_regclass('public.user_organizations') AS user_organizations_table;
