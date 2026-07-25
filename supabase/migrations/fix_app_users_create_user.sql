-- =====================================================
-- FIX / VERIFY: app_users columns for Create User
-- =====================================================
-- Run this in Supabase SQL Editor if user creation still fails.
-- Safe to re-run.
-- =====================================================

-- 1) Ensure table + required columns
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS default_organization_id UUID,
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

-- Fix wrong legacy column name if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users'
      AND column_name = 'default_organization'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users'
      AND column_name = 'default_organization_id'
  ) THEN
    ALTER TABLE public.app_users
      RENAME COLUMN default_organization TO default_organization_id;
  END IF;
END $$;

UPDATE public.app_users
SET full_name = COALESCE(NULLIF(btrim(full_name), ''), username)
WHERE full_name IS NULL OR btrim(full_name) = '';

UPDATE public.app_users
SET permissions = '[]'::jsonb
WHERE permissions IS NULL;

-- 2) Company assignment table
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

-- 3) RLS policies (service role / API)
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

-- 4) Optional FK (skip quietly if organizations missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'app_users_default_organization_id_fkey'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_default_organization_id_fkey
      FOREIGN KEY (default_organization_id)
      REFERENCES public.organizations (id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 5) Drop overly strict role check if it blocks inserts
ALTER TABLE public.app_users DROP CONSTRAINT IF EXISTS app_users_role_check;

-- 6) CRITICAL: reload PostgREST schema cache so new columns are visible to the API
NOTIFY pgrst, 'reload schema';

-- 7) Verify (you should see full_name, email, permissions, default_organization_id)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_users'
ORDER BY ordinal_position;
