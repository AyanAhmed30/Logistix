-- =====================================================
-- Accounting Phase 5 — Tax Returns & Period Lock (Odoo-style)
-- Idempotent. Integrates with invoices, bills, JEs.
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
      'tax_return'
    )
  );

CREATE TABLE IF NOT EXISTS public.accounting_tax_return_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'TAX',
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tax periods (monthly / custom) with lock
CREATE TABLE IF NOT EXISTS public.accounting_tax_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  unlocked_at TIMESTAMPTZ,
  unlocked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from),
  UNIQUE (organization_id, date_from, date_to)
);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_periods_org_dates
  ON public.accounting_tax_periods (organization_id, date_from, date_to);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_periods_locked
  ON public.accounting_tax_periods (organization_id, is_locked)
  WHERE is_locked = true;

-- Tax returns
CREATE TABLE IF NOT EXISTS public.accounting_tax_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  return_number TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  period_id UUID REFERENCES public.accounting_tax_periods(id) ON DELETE SET NULL,
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'generated',
      'confirmed',
      'filed',
      'cancelled'
    )),
  currency TEXT NOT NULL DEFAULT 'PKR',
  -- GST / VAT summary
  total_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  taxable_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  exempt_sales NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_purchases NUMERIC(14, 2) NOT NULL DEFAULT 0,
  taxable_purchases NUMERIC(14, 2) NOT NULL DEFAULT 0,
  purchase_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit_note_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  vendor_refund_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  adjustments NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_tax NUMERIC(14, 2) NOT NULL DEFAULT 0,
  -- Accounts for settlement JE
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  sales_tax_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  purchase_tax_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  tax_authority_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  generated_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  filed_at TIMESTAMPTZ,
  filed_by TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_tax_returns_org_number
  ON public.accounting_tax_returns (organization_id, return_number);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_returns_org_status
  ON public.accounting_tax_returns (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_returns_period
  ON public.accounting_tax_returns (organization_id, date_from, date_to);

-- Detail lines (snapshot of source documents)
CREATE TABLE IF NOT EXISTS public.accounting_tax_return_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID NOT NULL REFERENCES public.accounting_tax_returns(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL DEFAULT 1,
  line_type TEXT NOT NULL
    CHECK (line_type IN (
      'sales',
      'purchase',
      'credit_note',
      'vendor_refund',
      'adjustment'
    )),
  source_type TEXT,
  source_id UUID,
  source_number TEXT,
  partner_name TEXT,
  document_date DATE,
  tax_rate NUMERIC(8, 4) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_return_lines_return
  ON public.accounting_tax_return_lines (return_id, sequence);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_tax_return_lines_source
  ON public.accounting_tax_return_lines (return_id, source_type, source_id)
  WHERE source_id IS NOT NULL AND source_type IS NOT NULL;

-- Activity logs
CREATE TABLE IF NOT EXISTS public.accounting_tax_return_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id UUID REFERENCES public.accounting_tax_returns(id) ON DELETE CASCADE,
  period_id UUID REFERENCES public.accounting_tax_periods(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  performed_by TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_return_logs_return
  ON public.accounting_tax_return_logs (return_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_tax_return_logs_period
  ON public.accounting_tax_return_logs (period_id, performed_at DESC);

-- RLS
ALTER TABLE public.accounting_tax_return_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_tax_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_tax_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_tax_return_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_tax_return_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_tax_return_sequences;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_tax_periods;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_tax_returns;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_tax_return_lines;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_tax_return_logs;

CREATE POLICY "Full access for service role"
ON public.accounting_tax_return_sequences FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_tax_periods FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_tax_returns FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_tax_return_lines FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_tax_return_logs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
