-- =====================================================
-- Accounting Foundation — Payment Terms (Odoo-style)
-- Payment Policy Engine. Idempotent.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.accounting_payment_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  note TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sequence INTEGER NOT NULL DEFAULT 10,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_payment_terms_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_terms_shared_name_lower
  ON public.accounting_payment_terms (lower(name))
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_terms_org_name_lower
  ON public.accounting_payment_terms (organization_id, lower(name))
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_terms_shared_code
  ON public.accounting_payment_terms (code)
  WHERE organization_id IS NULL AND code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_terms_org_code
  ON public.accounting_payment_terms (organization_id, code)
  WHERE organization_id IS NOT NULL AND code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_terms_org_active
  ON public.accounting_payment_terms (organization_id, is_active, sequence);

-- Term lines (Odoo account.payment.term.line) — supports installments
CREATE TABLE IF NOT EXISTS public.accounting_payment_term_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_term_id UUID NOT NULL
    REFERENCES public.accounting_payment_terms(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 10,
  value_amount_type TEXT NOT NULL DEFAULT 'percent'
    CHECK (value_amount_type IN ('percent', 'fixed')),
  value_amount NUMERIC(15, 6) NOT NULL DEFAULT 100
    CHECK (value_amount >= 0),
  nb_days INTEGER NOT NULL DEFAULT 0
    CHECK (nb_days >= 0),
  delay_type TEXT NOT NULL DEFAULT 'days_after'
    CHECK (delay_type IN (
      'days_after',
      'days_after_end_of_month',
      'days_end_of_month'
    )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_term_lines_term
  ON public.accounting_payment_term_lines (payment_term_id, sequence);

ALTER TABLE public.accounting_payment_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_payment_term_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_payment_terms;
CREATE POLICY "Full access for service role"
  ON public.accounting_payment_terms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_payment_term_lines;
CREATE POLICY "Full access for service role"
  ON public.accounting_payment_term_lines FOR ALL USING (true) WITH CHECK (true);

-- Link documents / partners (nullable — keep free-text payment_terms for display)
ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS payment_term_id UUID
    REFERENCES public.accounting_payment_terms(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_vendor_bills
  ADD COLUMN IF NOT EXISTS payment_term_id UUID
    REFERENCES public.accounting_payment_terms(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  ) THEN
    ALTER TABLE public.contacts
      ADD COLUMN IF NOT EXISTS payment_term_id UUID
        REFERENCES public.accounting_payment_terms(id) ON DELETE SET NULL;
    ALTER TABLE public.contacts
      ADD COLUMN IF NOT EXISTS purchase_payment_term_id UUID
        REFERENCES public.accounting_payment_terms(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_customer_invoices_payment_term
  ON public.accounting_customer_invoices (payment_term_id)
  WHERE payment_term_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_vendor_bills_payment_term
  ON public.accounting_vendor_bills (payment_term_id)
  WHERE payment_term_id IS NOT NULL;

-- Seed standard shared terms
INSERT INTO public.accounting_payment_terms (name, code, note, organization_id, sequence, is_active)
SELECT 'Immediate', 'IMMEDIATE', 'Due on invoice/bill date', NULL, 10, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_payment_terms
  WHERE lower(name) = 'immediate' AND organization_id IS NULL
);

INSERT INTO public.accounting_payment_terms (name, code, note, organization_id, sequence, is_active)
SELECT '15 Days', 'NET15', 'Net 15 days', NULL, 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_payment_terms
  WHERE (lower(name) = '15 days' OR code = 'NET15') AND organization_id IS NULL
);

INSERT INTO public.accounting_payment_terms (name, code, note, organization_id, sequence, is_active)
SELECT '30 Days', 'NET30', 'Net 30 days', NULL, 30, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_payment_terms
  WHERE (lower(name) = '30 days' OR code = 'NET30') AND organization_id IS NULL
);

INSERT INTO public.accounting_payment_terms (name, code, note, organization_id, sequence, is_active)
SELECT '45 Days', 'NET45', 'Net 45 days', NULL, 40, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_payment_terms
  WHERE (lower(name) = '45 days' OR code = 'NET45') AND organization_id IS NULL
);

INSERT INTO public.accounting_payment_terms (name, code, note, organization_id, sequence, is_active)
SELECT '60 Days', 'NET60', 'Net 60 days', NULL, 50, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_payment_terms
  WHERE (lower(name) = '60 days' OR code = 'NET60') AND organization_id IS NULL
);

INSERT INTO public.accounting_payment_terms (name, code, note, organization_id, sequence, is_active)
SELECT 'End of Next Month', 'EOM_NEXT', 'Due at end of next month', NULL, 60, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_payment_terms
  WHERE (lower(name) = 'end of next month' OR code = 'EOM_NEXT') AND organization_id IS NULL
);

-- Seed lines (100% balance) for each default term
INSERT INTO public.accounting_payment_term_lines (
  payment_term_id, sequence, value_amount_type, value_amount, nb_days, delay_type
)
SELECT t.id, 10, 'percent', 100, 0, 'days_after'
FROM public.accounting_payment_terms t
WHERE t.code = 'IMMEDIATE' AND t.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_payment_term_lines l WHERE l.payment_term_id = t.id
  );

INSERT INTO public.accounting_payment_term_lines (
  payment_term_id, sequence, value_amount_type, value_amount, nb_days, delay_type
)
SELECT t.id, 10, 'percent', 100, 15, 'days_after'
FROM public.accounting_payment_terms t
WHERE t.code = 'NET15' AND t.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_payment_term_lines l WHERE l.payment_term_id = t.id
  );

INSERT INTO public.accounting_payment_term_lines (
  payment_term_id, sequence, value_amount_type, value_amount, nb_days, delay_type
)
SELECT t.id, 10, 'percent', 100, 30, 'days_after'
FROM public.accounting_payment_terms t
WHERE t.code = 'NET30' AND t.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_payment_term_lines l WHERE l.payment_term_id = t.id
  );

INSERT INTO public.accounting_payment_term_lines (
  payment_term_id, sequence, value_amount_type, value_amount, nb_days, delay_type
)
SELECT t.id, 10, 'percent', 100, 45, 'days_after'
FROM public.accounting_payment_terms t
WHERE t.code = 'NET45' AND t.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_payment_term_lines l WHERE l.payment_term_id = t.id
  );

INSERT INTO public.accounting_payment_term_lines (
  payment_term_id, sequence, value_amount_type, value_amount, nb_days, delay_type
)
SELECT t.id, 10, 'percent', 100, 60, 'days_after'
FROM public.accounting_payment_terms t
WHERE t.code = 'NET60' AND t.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_payment_term_lines l WHERE l.payment_term_id = t.id
  );

INSERT INTO public.accounting_payment_term_lines (
  payment_term_id, sequence, value_amount_type, value_amount, nb_days, delay_type
)
SELECT t.id, 10, 'percent', 100, 0, 'days_end_of_month'
FROM public.accounting_payment_terms t
WHERE t.code = 'EOM_NEXT' AND t.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.accounting_payment_term_lines l WHERE l.payment_term_id = t.id
  );
