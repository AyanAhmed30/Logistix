-- =====================================================
-- Sales module foundation — quotations org scope + cancelled
-- Safe to run multiple times (idempotent). Preserves data.
-- =====================================================

-- Organization scope for Sales quotations
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS salesperson_id UUID REFERENCES public.sales_agents(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_organization_id
  ON public.quotations (organization_id);

CREATE INDEX IF NOT EXISTS idx_quotations_salesperson_id
  ON public.quotations (salesperson_id);

-- Backfill organization from linked contact when contacts.organization_id exists.
-- Skip safely if that column was never migrated (avoids ERROR 42703).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND column_name = 'organization_id'
  ) THEN
    UPDATE public.quotations q
    SET organization_id = c.organization_id
    FROM public.contacts c
    WHERE q.contact_id = c.id
      AND q.organization_id IS NULL
      AND c.organization_id IS NOT NULL;
  END IF;
END $$;

-- Allow cancelled status (legacy values quotation / quotation_sent / sales_order remain)
DO $$
BEGIN
  -- Drop legacy check if present (name may vary)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_status_check'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations DROP CONSTRAINT quotations_status_check;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_status_check'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_status_check
      CHECK (status IN ('quotation', 'quotation_sent', 'sales_order', 'cancelled'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
