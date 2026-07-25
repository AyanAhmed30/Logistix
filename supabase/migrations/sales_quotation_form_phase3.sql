-- =====================================================
-- Sales Quotation Form (Phase 3/4)
-- Multi-line quotations, CRM link, notes, lock, versions
-- Idempotent. Preserves existing quotation data.
-- =====================================================

-- Header extensions
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS contact_person_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS delivery_address_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS invoice_address_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS sales_team TEXT;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_reference TEXT;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS pricelist TEXT;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS fiscal_position TEXT;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS quotation_date DATE DEFAULT CURRENT_DATE;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS internal_notes TEXT;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS customer_notes TEXT;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;

-- CRM opportunity link (only if CRM table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'crm_opportunities'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotations'
        AND column_name = 'opportunity_id'
    ) THEN
      ALTER TABLE public.quotations
        ADD COLUMN opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_quotations_opportunity_id
      ON public.quotations (opportunity_id);
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'quotations'
        AND column_name = 'opportunity_id'
    ) THEN
      ALTER TABLE public.quotations ADD COLUMN opportunity_id UUID;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_quotations_contact_person_id
  ON public.quotations (contact_person_id);

-- Backfill quotation_date from created_at
UPDATE public.quotations
SET quotation_date = (created_at AT TIME ZONE 'UTC')::date
WHERE quotation_date IS NULL AND created_at IS NOT NULL;

-- Status: add customer_review (Odoo-style intermediate)
DO $$
BEGIN
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
      CHECK (status IN (
        'quotation',
        'quotation_sent',
        'customer_review',
        'sales_order',
        'cancelled'
      ));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Order lines
CREATE TABLE IF NOT EXISTS public.quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 10,
  product_name TEXT NOT NULL DEFAULT '',
  description TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  uom TEXT NOT NULL DEFAULT 'pcs / u',
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(5, 2) NOT NULL DEFAULT 0,
  taxes NUMERIC(5, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_lines_quotation_id
  ON public.quotation_lines (quotation_id, sequence);

-- Migrate legacy single-line header fields into quotation_lines (once)
INSERT INTO public.quotation_lines (
  quotation_id, sequence, product_name, description, quantity, uom, unit_price, discount, taxes, line_total
)
SELECT
  q.id,
  10,
  COALESCE(NULLIF(TRIM(q.product_service), ''), 'Product'),
  q.product_service,
  COALESCE(q.quantity, 1),
  COALESCE(NULLIF(TRIM(q.uom), ''), 'pcs / u'),
  COALESCE(q.unit_price, 0),
  0,
  COALESCE(q.taxes, 0),
  COALESCE(q.total_amount, 0)
FROM public.quotations q
WHERE NOT EXISTS (
  SELECT 1 FROM public.quotation_lines l WHERE l.quotation_id = q.id
)
AND COALESCE(NULLIF(TRIM(q.product_service), ''), '') <> '';

-- Version history snapshots
CREATE TABLE IF NOT EXISTS public.quotation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL,
  status TEXT,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_versions_quotation_id
  ON public.quotation_versions (quotation_id, revision DESC);

-- Expand quotation_logs actions for workflow
ALTER TABLE public.quotation_logs
  DROP CONSTRAINT IF EXISTS quotation_logs_action_check;

ALTER TABLE public.quotation_logs
  ADD CONSTRAINT quotation_logs_action_check
  CHECK (action IN (
    'created',
    'updated',
    'deleted',
    'status_changed',
    'printed',
    'log_note',
    'activity',
    'duplicated',
    'locked',
    'unlocked',
    'emailed',
    'previewed'
  ));

-- RLS: block anon/authenticated direct access (app uses service-role server actions)
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_versions ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
