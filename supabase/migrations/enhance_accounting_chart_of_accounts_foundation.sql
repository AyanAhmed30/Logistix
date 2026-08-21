-- =====================================================
-- Accounting Foundation — Chart of Accounts (Odoo-style)
-- Extends existing chart_of_accounts. Idempotent.
-- Does NOT break JE / assets / loans / tax FKs.
-- =====================================================

-- Classification subtypes (Odoo internal types)
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS account_type TEXT;

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS default_tax_id UUID;

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Soft-validate account_type values (nullable allowed for legacy rows)
ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_account_type_check;

ALTER TABLE public.chart_of_accounts
  ADD CONSTRAINT chart_of_accounts_account_type_check
  CHECK (
    account_type IS NULL
    OR account_type IN (
      'receivable',
      'bank',
      'cash',
      'current_assets',
      'fixed_assets',
      'non_current_assets',
      'prepayments',
      'deferred_revenue',
      'payable',
      'credit_card',
      'current_liabilities',
      'non_current_liabilities',
      'equity',
      'retained_earnings',
      'current_year_earnings',
      'income',
      'other_income',
      'cost_of_revenue',
      'expense',
      'depreciation',
      'administrative',
      'view'
    )
  );

-- Optional FK to taxes table if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'taxes'
  ) THEN
    ALTER TABLE public.chart_of_accounts
      DROP CONSTRAINT IF EXISTS chart_of_accounts_default_tax_id_fkey;
    ALTER TABLE public.chart_of_accounts
      ADD CONSTRAINT chart_of_accounts_default_tax_id_fkey
      FOREIGN KEY (default_tax_id) REFERENCES public.taxes(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Replace global UNIQUE(code) with org-aware uniqueness
ALTER TABLE public.chart_of_accounts
  DROP CONSTRAINT IF EXISTS chart_of_accounts_code_key;

DROP INDEX IF EXISTS chart_of_accounts_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_of_accounts_shared_code
  ON public.chart_of_accounts (code)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chart_of_accounts_org_code
  ON public.chart_of_accounts (organization_id, code)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_org
  ON public.chart_of_accounts (organization_id, is_active, code);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type
  ON public.chart_of_accounts (type, account_type);

CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_reconcile
  ON public.chart_of_accounts (allow_reconciliation)
  WHERE allow_reconciliation = true AND is_active = true;

-- Backfill subtypes for existing seeded accounts
UPDATE public.chart_of_accounts SET account_type = 'view'
WHERE type = 'view' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'cash'
WHERE code = '1100' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'bank'
WHERE code = '1200' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'receivable'
WHERE code = '1300' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'payable'
WHERE code = '2100' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'income'
WHERE code IN ('4100', '4001', '4002', '4003', '4004') AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'expense'
WHERE code IN ('5100', '5001', '5002', '5003', '5004', '5005') AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'prepayments'
WHERE code IN ('1203', '1204') AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'current_assets'
WHERE type = 'asset' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'current_liabilities'
WHERE type = 'liability' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'equity'
WHERE type = 'equity' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'income'
WHERE type = 'income' AND account_type IS NULL;

UPDATE public.chart_of_accounts SET account_type = 'expense'
WHERE type = 'expense' AND account_type IS NULL;

-- Seed Odoo-style foundation accounts (skip if code already exists globally)
INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Fixed Assets', '1500', 'asset', 'fixed_assets', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '1000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '1500' AND c.organization_id IS NULL);

INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Tax Payable', '2200', 'liability', 'current_liabilities', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '2000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '2200' AND c.organization_id IS NULL);

INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Owner Equity', '3100', 'equity', 'equity', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '3000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '3100' AND c.organization_id IS NULL);

INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Retained Earnings', '3200', 'equity', 'retained_earnings', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '3000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '3200' AND c.organization_id IS NULL);

INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Other Income', '4200', 'income', 'other_income', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '4000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '4200' AND c.organization_id IS NULL);

-- Office / Admin / Depreciation (5100 may already be General Expense)
INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Office Expense', '5200', 'expense', 'expense', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '5000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '5200' AND c.organization_id IS NULL);

INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Administrative Expense', '5300', 'expense', 'administrative', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '5000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '5300' AND c.organization_id IS NULL);

INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Depreciation Expense', '5400', 'expense', 'depreciation', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '5000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '5400' AND c.organization_id IS NULL);

INSERT INTO public.chart_of_accounts (name, code, type, account_type, parent_id, allow_reconciliation, is_active)
SELECT 'Accumulated Depreciation', '1600', 'asset', 'fixed_assets', p.id, false, true
FROM public.chart_of_accounts p
WHERE p.code = '1000' AND p.organization_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.chart_of_accounts c WHERE c.code = '1600' AND c.organization_id IS NULL);

-- Ensure AR/AP reconcile flags
UPDATE public.chart_of_accounts
SET allow_reconciliation = true
WHERE code IN ('1300', '2100') AND organization_id IS NULL;

NOTIFY pgrst, 'reload schema';
