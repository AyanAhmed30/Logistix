-- =====================================================
-- Accounting Phase 6 — Lock Dates, Fiscal Years, Year Closing
-- Idempotent. Complements tax period locks (Phase 5).
-- =====================================================

ALTER TABLE public.accounting_journal_entries
  DROP CONSTRAINT IF EXISTS accounting_journal_entries_source_type_check;

ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_entries_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN (
      'manual',
      'customer_invoice',
      'customer_payment',
      'credit_note',
      'vendor_bill',
      'vendor_payment',
      'asset_purchase',
      'asset_depreciation',
      'asset_disposal',
      'loan_disbursement',
      'loan_repayment',
      'tax_return',
      'year_closing'
    )
  );

-- Org-level lock dates (Odoo-style)
CREATE TABLE IF NOT EXISTS public.accounting_lock_settings (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Hard / fiscal lock: blocks all journals for dates on or before
  hard_lock_date DATE,
  sale_lock_date DATE,
  purchase_lock_date DATE,
  tax_lock_date DATE,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-journal lock dates
CREATE TABLE IF NOT EXISTS public.accounting_journal_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE CASCADE,
  lock_date DATE NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, journal_id)
);

CREATE INDEX IF NOT EXISTS idx_accounting_journal_locks_org
  ON public.accounting_journal_locks (organization_id);

-- Fiscal years
CREATE TABLE IF NOT EXISTS public.accounting_fiscal_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'closing', 'closed')),
  closing_journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  retained_earnings_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  closed_by TEXT,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from),
  UNIQUE (organization_id, date_from, date_to)
);

CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_years_org
  ON public.accounting_fiscal_years (organization_id, date_from DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_years_status
  ON public.accounting_fiscal_years (organization_id, status);

-- Activity / audit
CREATE TABLE IF NOT EXISTS public.accounting_lock_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  fiscal_year_id UUID REFERENCES public.accounting_fiscal_years(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  performed_by TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_lock_logs_org
  ON public.accounting_lock_logs (organization_id, performed_at DESC);

-- RLS
ALTER TABLE public.accounting_lock_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_fiscal_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_lock_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_lock_settings;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_journal_locks;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_fiscal_years;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_lock_logs;

CREATE POLICY "Full access for service role"
ON public.accounting_lock_settings FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_journal_locks FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_fiscal_years FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_lock_logs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
