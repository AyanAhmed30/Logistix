-- Organization accounts for the Organization Portal
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  description TEXT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

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
