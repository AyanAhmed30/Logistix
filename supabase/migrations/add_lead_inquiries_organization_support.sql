-- Lead inquiries + parent leads: multi-organization isolation
-- Idempotent — safe to run multiple times.
-- Self-contained: adds organization_id to leads and lead_inquiries before backfill.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organizations'
  ) THEN
    RAISE NOTICE 'organizations table not found — skipping organization_id columns';
    RETURN;
  END IF;

  -- leads.organization_id (required for inquiry backfill and org-scoped sales)
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'leads'
  ) THEN
    ALTER TABLE public.leads
      ADD COLUMN IF NOT EXISTS organization_id UUID
      REFERENCES public.organizations (id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_leads_organization_id
      ON public.leads (organization_id);
  END IF;

  -- lead_inquiries.organization_id + created_by
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'lead_inquiries'
  ) THEN
    ALTER TABLE public.lead_inquiries
      ADD COLUMN IF NOT EXISTS organization_id UUID
      REFERENCES public.organizations (id) ON DELETE SET NULL;

    ALTER TABLE public.lead_inquiries
      ADD COLUMN IF NOT EXISTS created_by TEXT;

    CREATE INDEX IF NOT EXISTS idx_lead_inquiries_organization_id
      ON public.lead_inquiries (organization_id);

    CREATE INDEX IF NOT EXISTS idx_lead_inquiries_org_ops_feed
      ON public.lead_inquiries (organization_id, sent_to_accounting, sent_at DESC NULLS LAST);
  END IF;

  -- inquiry_confirmations.organization_id
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'inquiry_confirmations'
  ) THEN
    ALTER TABLE public.inquiry_confirmations
      ADD COLUMN IF NOT EXISTS organization_id UUID
      REFERENCES public.organizations (id) ON DELETE SET NULL;

    CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_organization_id
      ON public.inquiry_confirmations (organization_id);
  END IF;
END $$;

-- Backfill lead_inquiries from parent lead (only when both columns exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'organization_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_inquiries' AND column_name = 'organization_id'
  ) THEN
    UPDATE public.lead_inquiries AS li
    SET organization_id = l.organization_id
    FROM public.leads AS l
    WHERE li.lead_id = l.id
      AND li.organization_id IS NULL
      AND l.organization_id IS NOT NULL;
  END IF;
END $$;

-- Single-org installs: assign orphan legacy rows to the only active organization
DO $$
DECLARE
  sole_org_id UUID;
  active_org_count INT;
BEGIN
  SELECT COUNT(*)::INT INTO active_org_count
  FROM public.organizations
  WHERE status = 'active';

  IF active_org_count <> 1 THEN
    RETURN;
  END IF;

  SELECT id INTO sole_org_id
  FROM public.organizations
  WHERE status = 'active'
  ORDER BY created_at ASC
  LIMIT 1;

  IF sole_org_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'organization_id'
  ) THEN
    UPDATE public.leads
    SET organization_id = sole_org_id
    WHERE organization_id IS NULL;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_inquiries' AND column_name = 'organization_id'
  ) THEN
    UPDATE public.lead_inquiries
    SET organization_id = sole_org_id
    WHERE organization_id IS NULL;
  END IF;
END $$;

-- Backfill inquiry_confirmations from lead_inquiries
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'inquiry_confirmations' AND column_name = 'organization_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'lead_inquiries' AND column_name = 'organization_id'
  ) THEN
    UPDATE public.inquiry_confirmations AS ic
    SET organization_id = li.organization_id
    FROM public.lead_inquiries AS li
    WHERE ic.inquiry_id = li.id
      AND ic.organization_id IS NULL
      AND li.organization_id IS NOT NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
