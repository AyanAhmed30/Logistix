-- Odoo-style Users: extend app_users + company assignment
-- Run in Supabase SQL editor before using the new Users flow.
-- Prefer the all-in-one file if starting fresh:
--   portal_user_login_and_module_access.sql

-- 0) Ensure base table exists
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_app_users_username ON public.app_users (username);
CREATE INDEX IF NOT EXISTS idx_app_users_role ON public.app_users (role);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_users'
      AND policyname = 'Full access for service role'
  ) THEN
    CREATE POLICY "Full access for service role"
      ON public.app_users
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 1) Portal user profile fields
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS default_organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_default_organization_id
  ON public.app_users(default_organization_id);

CREATE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON public.app_users (LOWER(email));

-- Backfill display name from username where missing
UPDATE public.app_users
SET full_name = username
WHERE full_name IS NULL OR btrim(full_name) = '';

-- 2) Many-to-many: users ↔ companies (organizations)
CREATE TABLE IF NOT EXISTS public.user_organizations (
  user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_user_organizations_organization_id
  ON public.user_organizations(organization_id);

CREATE INDEX IF NOT EXISTS idx_user_organizations_user_id
  ON public.user_organizations(user_id);

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

-- 3) Organizations are companies only — login credentials live on Users
DO $$
BEGIN
  ALTER TABLE public.organizations ALTER COLUMN username DROP NOT NULL;
  ALTER TABLE public.organizations ALTER COLUMN password DROP NOT NULL;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'organizations username/password already nullable or columns missing.';
END $$;
