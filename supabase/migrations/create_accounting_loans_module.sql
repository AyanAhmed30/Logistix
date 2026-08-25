-- =====================================================
-- Accounting Phase 4 — Loan Management (Odoo-style)
-- Idempotent. Integrates with accounting_journal_entries.
--
-- Do not drop accounting_journal_entries_source_type_check here.
-- Later migrations already allow loan_disbursement / loan_repayment
-- (plus vendor_refund, tax_return, year_closing, year_opening).
-- =====================================================

-- Sequences
CREATE TABLE IF NOT EXISTS public.accounting_loan_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'LN',
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loans
CREATE TABLE IF NOT EXISTS public.accounting_loans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  loan_number TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN (
      'draft',
      'active',
      'partially_paid',
      'fully_paid',
      'closed',
      'cancelled'
    )),
  -- borrowed = company borrows; issued = company lends (future-ready)
  direction TEXT NOT NULL DEFAULT 'borrowed'
    CHECK (direction IN ('borrowed', 'issued')),
  loan_type TEXT NOT NULL DEFAULT 'bank_loan'
    CHECK (loan_type IN (
      'bank_loan',
      'vehicle_loan',
      'equipment_loan',
      'business_loan',
      'mortgage',
      'internal_loan',
      'other'
    )),
  lender_name TEXT,
  reference_number TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  principal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  interest_rate NUMERIC(8, 4) NOT NULL DEFAULT 0 CHECK (interest_rate >= 0),
  interest_method TEXT NOT NULL DEFAULT 'reducing_balance'
    CHECK (interest_method IN ('fixed', 'reducing_balance')),
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  first_installment_date DATE,
  total_installments INTEGER NOT NULL DEFAULT 12 CHECK (total_installments > 0),
  installment_frequency TEXT NOT NULL DEFAULT 'monthly'
    CHECK (installment_frequency IN ('monthly', 'quarterly', 'yearly')),
  currency TEXT NOT NULL DEFAULT 'PKR',
  -- Outstanding / paid rollups (maintained on pay)
  total_interest NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_payable NUMERIC(14, 2) NOT NULL DEFAULT 0,
  principal_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  interest_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  remaining_principal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  remaining_interest NUMERIC(14, 2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  monthly_installment NUMERIC(14, 2) NOT NULL DEFAULT 0,
  next_installment_date DATE,
  -- Accounts
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  liability_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  interest_expense_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  interest_payable_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  bank_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  payment_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  disbursement_journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  closed_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_loans_org_number
  ON public.accounting_loans (organization_id, loan_number);

CREATE INDEX IF NOT EXISTS idx_accounting_loans_org_status
  ON public.accounting_loans (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_loans_start
  ON public.accounting_loans (organization_id, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_loans_lender
  ON public.accounting_loans (organization_id, lender_name);

-- Installment schedule
CREATE TABLE IF NOT EXISTS public.accounting_loan_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.accounting_loans(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL DEFAULT 1,
  due_date DATE NOT NULL,
  opening_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  principal_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (principal_amount >= 0),
  interest_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (interest_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  closing_balance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'partial', 'cancelled', 'skipped')),
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  paid_date DATE,
  journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  paid_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (loan_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_accounting_loan_inst_loan
  ON public.accounting_loan_installments (loan_id, sequence);

CREATE INDEX IF NOT EXISTS idx_accounting_loan_inst_status
  ON public.accounting_loan_installments (organization_id, status, due_date);

-- Activity logs
CREATE TABLE IF NOT EXISTS public.accounting_loan_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.accounting_loans(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  performed_by TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_loan_logs_loan
  ON public.accounting_loan_logs (loan_id, performed_at DESC);

-- RLS
ALTER TABLE public.accounting_loan_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_loan_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_loan_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_loan_sequences;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_loans;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_loan_installments;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_loan_logs;

CREATE POLICY "Full access for service role"
ON public.accounting_loan_sequences FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_loans FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_loan_installments FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_loan_logs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
