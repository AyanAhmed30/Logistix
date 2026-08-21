-- Accounting Review Phase 3 — Deferral schedules foundation
-- Idempotent. Does NOT auto-post; schedules are created when deferral is configured on documents.

CREATE TABLE IF NOT EXISTS public.accounting_deferral_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  schedule_type TEXT NOT NULL
    CHECK (schedule_type IN ('deferred_revenue', 'deferred_expense')),
  source_type TEXT NOT NULL
    CHECK (source_type IN ('customer_invoice', 'vendor_bill', 'manual')),
  source_id UUID,
  source_line_id UUID,
  source_number TEXT,
  partner_name TEXT,
  product_name TEXT,
  deferred_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  recognition_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  original_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (original_amount >= 0),
  recognized_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (recognized_amount >= 0),
  remaining_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'PKR',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN (
      'draft',
      'scheduled',
      'partially_recognized',
      'fully_recognized',
      'cancelled'
    )),
  next_recognition_date DATE,
  initial_journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_deferral_schedules_org_type_status
  ON public.accounting_deferral_schedules (organization_id, schedule_type, status);

CREATE INDEX IF NOT EXISTS idx_deferral_schedules_org_dates
  ON public.accounting_deferral_schedules (organization_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.accounting_deferral_recognition_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL
    REFERENCES public.accounting_deferral_schedules(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 10,
  recognition_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'posted', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deferral_recognition_schedule
  ON public.accounting_deferral_recognition_lines (schedule_id, recognition_date);

-- Working Files are required by Annual Report → New (not deferral tables).
CREATE TABLE IF NOT EXISTS public.accounting_working_file_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'WF',
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_working_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  file_number TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  return_type TEXT NOT NULL DEFAULT 'audit'
    CHECK (return_type IN ('audit', 'annual_report')),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  cycles JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ongoing'
    CHECK (status IN ('draft', 'ongoing', 'paused', 'done', 'cancelled')),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_working_files_org_number
  ON public.accounting_working_files (organization_id, file_number);

CREATE INDEX IF NOT EXISTS idx_accounting_working_files_org_status_created
  ON public.accounting_working_files (organization_id, status, created_at DESC);

-- Extend working files return types for annual reports
DO $$
BEGIN
  IF to_regclass('public.accounting_working_files') IS NOT NULL THEN
    ALTER TABLE public.accounting_working_files
      DROP CONSTRAINT IF EXISTS accounting_working_files_return_type_check;
    ALTER TABLE public.accounting_working_files
      ADD CONSTRAINT accounting_working_files_return_type_check
      CHECK (return_type IN ('audit', 'annual_report'));
  END IF;
END $$;

-- Allow Odoo-style Deferred Revenue on Chart of Accounts (missing from original CHECK)
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

-- Seed default Deferred Revenue account (org-null = shared template)
INSERT INTO public.chart_of_accounts (code, name, type, account_type, is_active, organization_id)
SELECT '2405', 'Deferred Revenue', 'liability', 'deferred_revenue', true, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.chart_of_accounts
  WHERE code = '2405' AND organization_id IS NULL
);

NOTIFY pgrst, 'reload schema';
