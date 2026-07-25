-- FORCE add default_organization_id (run this exact script)

ALTER TABLE public.app_users
  ADD COLUMN IF NOT EXISTS default_organization_id UUID;

UPDATE public.app_users
SET default_organization_id = default_organization
WHERE default_organization IS NOT NULL
  AND (default_organization_id IS NULL OR default_organization_id IS DISTINCT FROM default_organization);

NOTIFY pgrst, 'reload schema';

-- Must show TWO different names
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'app_users'
  AND column_name LIKE 'default_organization%'
ORDER BY column_name;
