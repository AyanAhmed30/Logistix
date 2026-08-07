-- =====================================================
-- Accounting Foundation — Journals (Odoo-style)
-- Extends existing journals. Idempotent.
-- Does NOT break JE / invoice / payment FKs.
-- =====================================================

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'PKR';

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS sequence_prefix TEXT;

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS next_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.journals
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Soft-validate currency (ISO-ish codes)
ALTER TABLE public.journals
  DROP CONSTRAINT IF EXISTS journals_currency_check;

ALTER TABLE public.journals
  ADD CONSTRAINT journals_currency_check
  CHECK (currency ~ '^[A-Z]{3}$');

ALTER TABLE public.journals
  DROP CONSTRAINT IF EXISTS journals_next_number_check;

ALTER TABLE public.journals
  ADD CONSTRAINT journals_next_number_check
  CHECK (next_number >= 1);

-- Replace global UNIQUE(code) / unique name with org-aware uniqueness
ALTER TABLE public.journals
  DROP CONSTRAINT IF EXISTS journals_code_key;

DROP INDEX IF EXISTS journals_code_key;
DROP INDEX IF EXISTS idx_journals_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_shared_code
  ON public.journals (code)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_org_code
  ON public.journals (organization_id, code)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_shared_name_lower
  ON public.journals (lower(name))
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_journals_org_name_lower
  ON public.journals (organization_id, lower(name))
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_journals_org
  ON public.journals (organization_id, is_active, type, code);

CREATE INDEX IF NOT EXISTS idx_journals_type_org
  ON public.journals (type, organization_id, is_active);

-- Backfill sequence prefixes from codes
UPDATE public.journals
SET sequence_prefix = code
WHERE sequence_prefix IS NULL AND code IS NOT NULL;

-- Odoo labels Miscellaneous for type=general
UPDATE public.journals
SET name = 'Miscellaneous Journal'
WHERE code = 'GEN'
  AND organization_id IS NULL
  AND (name IS NULL OR name ILIKE 'General Journal' OR name = 'GEN');

-- Ensure default shared journals exist (idempotent)
INSERT INTO public.journals (
  name, code, type, default_debit_account_id, default_credit_account_id,
  is_active, currency, sequence_prefix, organization_id
)
SELECT
  'Sales Journal', 'SJ', 'sales',
  (SELECT id FROM public.chart_of_accounts WHERE code = '1300' AND organization_id IS NULL LIMIT 1),
  (SELECT id FROM public.chart_of_accounts WHERE code = '4100' AND organization_id IS NULL LIMIT 1),
  true, 'PKR', 'SJ', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.journals WHERE code = 'SJ' AND organization_id IS NULL
);

INSERT INTO public.journals (
  name, code, type, default_debit_account_id, default_credit_account_id,
  is_active, currency, sequence_prefix, organization_id
)
SELECT
  'Purchase Journal', 'PJ', 'purchase',
  (SELECT id FROM public.chart_of_accounts WHERE code = '5100' AND organization_id IS NULL LIMIT 1),
  (SELECT id FROM public.chart_of_accounts WHERE code = '2100' AND organization_id IS NULL LIMIT 1),
  true, 'PKR', 'PJ', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.journals WHERE code = 'PJ' AND organization_id IS NULL
);

INSERT INTO public.journals (
  name, code, type, default_debit_account_id, default_credit_account_id,
  is_active, currency, sequence_prefix, organization_id
)
SELECT
  'Bank Journal', 'BNK', 'bank',
  (SELECT id FROM public.chart_of_accounts WHERE code = '1200' AND organization_id IS NULL LIMIT 1),
  (SELECT id FROM public.chart_of_accounts WHERE code = '1200' AND organization_id IS NULL LIMIT 1),
  true, 'PKR', 'BNK', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.journals WHERE code = 'BNK' AND organization_id IS NULL
);

INSERT INTO public.journals (
  name, code, type, default_debit_account_id, default_credit_account_id,
  is_active, currency, sequence_prefix, organization_id
)
SELECT
  'Cash Journal', 'CSH', 'cash',
  (SELECT id FROM public.chart_of_accounts WHERE code = '1100' AND organization_id IS NULL LIMIT 1),
  (SELECT id FROM public.chart_of_accounts WHERE code = '1100' AND organization_id IS NULL LIMIT 1),
  true, 'PKR', 'CSH', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.journals WHERE code = 'CSH' AND organization_id IS NULL
);

INSERT INTO public.journals (
  name, code, type, default_debit_account_id, default_credit_account_id,
  is_active, currency, sequence_prefix, organization_id
)
SELECT
  'Miscellaneous Journal', 'GEN', 'general',
  NULL, NULL,
  true, 'PKR', 'MISC', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.journals WHERE code = 'GEN' AND organization_id IS NULL
);

-- Per-organization journal document sequences (reusable for invoices/payments later)
CREATE TABLE IF NOT EXISTS public.accounting_journal_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL,
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number >= 1),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (journal_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_journal_sequences_org
  ON public.accounting_journal_sequences (organization_id, journal_id);

ALTER TABLE public.accounting_journal_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_journal_sequences;
CREATE POLICY "Full access for service role"
  ON public.accounting_journal_sequences
  FOR ALL USING (true) WITH CHECK (true);
