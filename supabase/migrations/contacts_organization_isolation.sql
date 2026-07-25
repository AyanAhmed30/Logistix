-- Contacts multi-organization isolation (Odoo-style)
-- Ensures organization_id exists and is indexed. New contacts are stamped
-- by the app from the header company switcher.
--
-- Prefer "Run and enable RLS" if prompted.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_organization_id
  ON public.contacts (organization_id);

-- Optional helper: if you have exactly one organization and want to attach
-- legacy NULL contacts to it, uncomment and run carefully:
--
-- UPDATE public.contacts
-- SET organization_id = (SELECT id FROM public.organizations ORDER BY created_at ASC LIMIT 1)
-- WHERE organization_id IS NULL
--   AND (SELECT COUNT(*) FROM public.organizations) = 1;
