-- =====================================================
-- REQUIRED for User Create (run on the CORRECT project)
-- =====================================================
-- Your app (.env.local) uses project:
--   https://uoavdzggnqhypdyenigd.supabase.co
--
-- In Supabase Dashboard, open THAT project (check the
-- browser URL / project ref = uoavdzggnqhypdyenigd),
-- then SQL Editor → paste this entire file → Run.
-- =====================================================

-- 1) Base table
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2) Profile + module + default company columns
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS default_organization UUID;

UPDATE public.app_users
SET full_name = COALESCE(NULLIF(btrim(full_name), ''), username)
WHERE full_name IS NULL OR btrim(full_name) = '';

UPDATE public.app_users
SET permissions = '[]'::jsonb
WHERE permissions IS NULL;

-- 3) Company assignment table
CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id UUID NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id
  ON public.user_organizations (user_id);

CREATE INDEX IF NOT EXISTS idx_user_organizations_organization_id
  ON public.user_organizations (organization_id);

-- 4) RLS + grants (service role / API)
ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_organizations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_users'
      AND policyname = 'Full access for service role'
  ) THEN
    CREATE POLICY "Full access for service role"
      ON public.app_users FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_organizations'
      AND policyname = 'Full access for service role'
  ) THEN
    CREATE POLICY "Full access for service role"
      ON public.user_organizations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

GRANT ALL ON TABLE public.app_users TO postgres, anon, authenticated, service_role;
GRANT ALL ON TABLE public.user_organizations TO postgres, anon, authenticated, service_role;

-- 5) Optional FK for default company
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_default_organization_fkey'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_default_organization_fkey
      FOREIGN KEY (default_organization)
      REFERENCES public.organizations (id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'FK skipped: %', SQLERRM;
END $$;

-- 6) Drop broken sync trigger if a previous migration created one
DROP TRIGGER IF EXISTS trg_sync_app_users_default_org ON public.app_users;
DROP FUNCTION IF EXISTS public.sync_app_users_default_org_columns();

-- 7) CRITICAL — reload PostgREST schema cache (run twice; wait ~15s after)
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
NOTIFY pgrst, 'reload schema';

-- 8) Verify (must list full_name, email, permissions, default_organization)
-- If app still says columns are missing after this SQL succeeds,
-- run RELOAD_POSTGREST_SCHEMA.sql or Restart the Supabase project.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_users'
ORDER BY ordinal_position;

SELECT to_regclass('public.user_organizations') AS user_organizations_table;
