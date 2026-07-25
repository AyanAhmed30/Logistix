-- =====================================================
-- Portal Users: Organization assignment + Module Access
-- =====================================================
-- Required for: Settings → Users → Create User → Login →
-- dashboard with default company + Sales/Operations modules.
--
-- How to run:
--   Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- Safe to re-run (idempotent).
-- =====================================================

-- -----------------------------------------------------
-- 0) Ensure base portal users table exists
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_app_users_username
  ON public.app_users (username);

CREATE INDEX IF NOT EXISTS idx_app_users_role
  ON public.app_users (role);

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

-- -----------------------------------------------------
-- 1) Odoo-style profile + default company
-- -----------------------------------------------------
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS default_organization_id UUID;

-- FK for default company (organizations must already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_default_organization_id_fkey'
  ) THEN
    ALTER TABLE public.app_users
      ADD CONSTRAINT app_users_default_organization_id_fkey
      FOREIGN KEY (default_organization_id)
      REFERENCES public.organizations (id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'organizations table missing — create organizations first, then re-run this migration.';
END $$;

CREATE INDEX IF NOT EXISTS idx_app_users_default_organization_id
  ON public.app_users (default_organization_id);

CREATE INDEX IF NOT EXISTS idx_app_users_email_lower
  ON public.app_users (LOWER(email));

-- Backfill display name from username where missing
UPDATE public.app_users
SET full_name = username
WHERE full_name IS NULL OR btrim(full_name) = '';

-- Role should be user | admin (portal roles) — optional, do not block if legacy roles exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'app_users_role_check'
  ) THEN
    -- Only add if all existing roles are compatible
    IF NOT EXISTS (
      SELECT 1 FROM public.app_users
      WHERE role IS NOT NULL AND role NOT IN ('user', 'admin')
    ) THEN
      ALTER TABLE public.app_users
        ADD CONSTRAINT app_users_role_check
        CHECK (role IN ('user', 'admin'));
    END IF;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not add app_users_role_check (existing data may use other roles).';
END $$;

-- -----------------------------------------------------
-- 2) Many-to-many: users ↔ companies (organizations)
-- -----------------------------------------------------
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

-- -----------------------------------------------------
-- 3) Module Access (Sales / Operations) on portal users
--    Stored as JSONB array, e.g. ["sales","operations"]
-- -----------------------------------------------------
ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

UPDATE public.app_users
SET permissions = '[]'::jsonb
WHERE permissions IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_permissions
  ON public.app_users USING GIN (permissions);

-- -----------------------------------------------------
-- 4) Module permissions on operations_users (legacy sync)
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'operations_users'
  ) THEN
    ALTER TABLE public.operations_users
      ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

    UPDATE public.operations_users
    SET permissions = '[]'::jsonb
    WHERE permissions IS NULL;

    CREATE INDEX IF NOT EXISTS idx_operations_users_permissions
      ON public.operations_users USING GIN (permissions);
  END IF;
END $$;

-- -----------------------------------------------------
-- 5) Ensure sales_agents.permissions exists (legacy sync)
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales_agents'
  ) THEN
    ALTER TABLE public.sales_agents
      ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_sales_agents_permissions
      ON public.sales_agents USING GIN (permissions);
  END IF;
END $$;

-- -----------------------------------------------------
-- 6) Organizations are companies — login lives on Users
--    (username/password on organizations become optional)
-- -----------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'username'
  ) THEN
    ALTER TABLE public.organizations
      ALTER COLUMN username DROP NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
      AND column_name = 'password'
  ) THEN
    ALTER TABLE public.organizations
      ALTER COLUMN password DROP NOT NULL;
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'Could not relax organizations username/password NOT NULL constraints.';
END $$;

-- -----------------------------------------------------
-- Reload PostgREST schema cache (required after ALTER TABLE)
-- -----------------------------------------------------
NOTIFY pgrst, 'reload schema';

-- -----------------------------------------------------
-- Done. Verify with:
--   SELECT column_name, data_type
--   FROM information_schema.columns
--   WHERE table_name = 'app_users'
--   ORDER BY ordinal_position;
--
--   SELECT * FROM public.user_organizations LIMIT 5;
-- -----------------------------------------------------
