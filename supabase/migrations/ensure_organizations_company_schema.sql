-- =====================================================
-- Organizations / Companies — full schema for Admin
-- Settings → Organization / Company create & save
-- =====================================================
-- Run in Supabase SQL Editor (safe to re-run).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  description TEXT,
  username TEXT UNIQUE,
  password TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Profile / address fields used by the company form
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS street TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS street_2 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zip TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS branches JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Company-only accounts: login credentials are optional (users live in app_users)
DO $$
BEGIN
  ALTER TABLE public.organizations ALTER COLUMN username DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN others THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.organizations ALTER COLUMN password DROP NOT NULL;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN others THEN NULL;
END $$;

-- Ensure columns exist even on older schemas that used different defaults
ALTER TABLE public.organizations
  ALTER COLUMN phone SET DEFAULT '',
  ALTER COLUMN address SET DEFAULT '',
  ALTER COLUMN city SET DEFAULT '',
  ALTER COLUMN country SET DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_email_lower
  ON public.organizations (LOWER(email));

CREATE INDEX IF NOT EXISTS idx_organizations_username
  ON public.organizations (username);

CREATE INDEX IF NOT EXISTS idx_organizations_status
  ON public.organizations (status);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Full access for service role'
  ) THEN
    CREATE POLICY "Full access for service role"
      ON public.organizations
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- updated_at helper (optional)
CREATE OR REPLACE FUNCTION public.set_organizations_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE PROCEDURE public.set_organizations_updated_at();
