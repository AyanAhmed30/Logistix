-- Access Rights: store module permissions on portal users and department accounts
-- Prefer the all-in-one file if starting fresh:
--   portal_user_login_and_module_access.sql
--
-- permissions JSONB examples:
--   ["sales"]
--   ["operations"]
--   ["sales","operations"]

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]'::jsonb;

UPDATE public.app_users
SET permissions = '[]'::jsonb
WHERE permissions IS NULL;

CREATE INDEX IF NOT EXISTS idx_app_users_permissions
  ON public.app_users USING GIN (permissions);

-- Legacy Operations accounts (synced when Operations module is assigned)
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

-- Legacy Sales accounts (synced when Sales module is assigned)
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
