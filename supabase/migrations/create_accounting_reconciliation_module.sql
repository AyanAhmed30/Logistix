-- =====================================================
-- Accounting Phase 2 — Reconciliation module (Odoo-style)
-- Document matching + bank statement architecture.
-- Idempotent. Does not alter legacy journal_entry_lines.
-- =====================================================

-- Payment reconcile tracking (bank stays outstanding until matched)
ALTER TABLE public.accounting_invoice_payments
  ADD COLUMN IF NOT EXISTS journal TEXT
    CHECK (journal IS NULL OR journal IN ('bank', 'cash'));

ALTER TABLE public.accounting_invoice_payments
  ADD COLUMN IF NOT EXISTS payment_number TEXT;

ALTER TABLE public.accounting_invoice_payments
  ADD COLUMN IF NOT EXISTS reconcile_status TEXT NOT NULL DEFAULT 'outstanding'
    CHECK (reconcile_status IN ('outstanding', 'partial', 'reconciled'));

ALTER TABLE public.accounting_invoice_payments
  ADD COLUMN IF NOT EXISTS amount_reconciled NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- Backfill: cash / already-settled style — treat as reconciled when invoice is paid
UPDATE public.accounting_invoice_payments p
SET
  journal = COALESCE(p.journal, CASE WHEN p.payment_method = 'cash' THEN 'cash' ELSE 'bank' END),
  reconcile_status = CASE
    WHEN COALESCE(p.amount_reconciled, 0) >= p.amount - 0.004 THEN 'reconciled'
    WHEN COALESCE(p.amount_reconciled, 0) > 0.004 THEN 'partial'
    WHEN EXISTS (
      SELECT 1 FROM public.accounting_customer_invoices i
      WHERE i.id = p.invoice_id AND i.payment_state = 'paid'
    ) THEN 'reconciled'
    WHEN EXISTS (
      SELECT 1 FROM public.accounting_customer_invoices i
      WHERE i.id = p.invoice_id AND i.payment_state IN ('partial', 'paid')
        AND COALESCE(i.amount_paid, 0) > 0.004
        AND COALESCE(p.journal, CASE WHEN p.payment_method = 'cash' THEN 'cash' ELSE 'bank' END) = 'cash'
    ) THEN 'reconciled'
    ELSE 'outstanding'
  END,
  amount_reconciled = CASE
    WHEN EXISTS (
      SELECT 1 FROM public.accounting_customer_invoices i
      WHERE i.id = p.invoice_id
        AND (
          i.payment_state = 'paid'
          OR (
            COALESCE(p.journal, CASE WHEN p.payment_method = 'cash' THEN 'cash' ELSE 'bank' END) = 'cash'
            AND i.payment_state IN ('partial', 'paid')
          )
        )
    ) THEN p.amount
    ELSE COALESCE(p.amount_reconciled, 0)
  END
WHERE true;

-- JE line residuals (architecture for line-level / bank recon)
ALTER TABLE public.accounting_journal_entry_lines
  ADD COLUMN IF NOT EXISTS amount_residual NUMERIC(14, 2);

ALTER TABLE public.accounting_journal_entry_lines
  ADD COLUMN IF NOT EXISTS amount_reconciled NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.accounting_journal_entry_lines
  ADD COLUMN IF NOT EXISTS is_reconciled BOOLEAN NOT NULL DEFAULT false;

UPDATE public.accounting_journal_entry_lines
SET amount_residual = COALESCE(amount_residual, GREATEST(debit, credit) - COALESCE(amount_reconciled, 0))
WHERE amount_residual IS NULL;

-- Reconciliation groups
CREATE TABLE IF NOT EXISTS public.accounting_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL DEFAULT '',
  reconciliation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'full'
    CHECK (status IN ('draft', 'partial', 'full', 'cancelled')),
  match_type TEXT NOT NULL DEFAULT 'manual'
    CHECK (match_type IN ('auto', 'manual', 'bank')),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_reconciliations_org_date
  ON public.accounting_reconciliations (organization_id, reconciliation_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_reconciliations_status
  ON public.accounting_reconciliations (organization_id, status);

-- Reconciliation lines (documents matched together)
CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID NOT NULL
    REFERENCES public.accounting_reconciliations(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  side TEXT NOT NULL CHECK (side IN ('debit', 'credit')),
  document_type TEXT NOT NULL
    CHECK (document_type IN (
      'customer_invoice',
      'customer_payment',
      'credit_note',
      'vendor_bill',
      'vendor_payment',
      'bank_statement_line',
      'journal_item'
    )),
  document_id UUID NOT NULL,
  document_number TEXT,
  journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  journal_entry_line_id UUID
    REFERENCES public.accounting_journal_entry_lines(id) ON DELETE SET NULL,
  partner_name TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_recon_lines_recon
  ON public.accounting_reconciliation_lines (reconciliation_id);

CREATE INDEX IF NOT EXISTS idx_accounting_recon_lines_doc
  ON public.accounting_reconciliation_lines (document_type, document_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_recon_lines_unique_active
  ON public.accounting_reconciliation_lines (reconciliation_id, document_type, document_id, side);

-- Activity logs
CREATE TABLE IF NOT EXISTS public.accounting_reconciliation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id UUID
    REFERENCES public.accounting_reconciliations(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  performed_by TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_recon_logs_recon
  ON public.accounting_reconciliation_logs (reconciliation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_recon_logs_org
  ON public.accounting_reconciliation_logs (organization_id, created_at DESC);

-- Bank statement architecture (future imports plug in here)
CREATE TABLE IF NOT EXISTS public.accounting_bank_statements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  date_from DATE,
  date_to DATE,
  balance_start NUMERIC(14, 2) NOT NULL DEFAULT 0,
  balance_end NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'processing', 'done', 'cancelled')),
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_bank_statements_org
  ON public.accounting_bank_statements (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.accounting_bank_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id UUID NOT NULL
    REFERENCES public.accounting_bank_statements(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  line_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_ref TEXT,
  partner_name TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  is_reconciled BOOLEAN NOT NULL DEFAULT false,
  reconciliation_id UUID
    REFERENCES public.accounting_reconciliations(id) ON DELETE SET NULL,
  journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_bank_stmt_lines_stmt
  ON public.accounting_bank_statement_lines (statement_id, line_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_bank_stmt_lines_open
  ON public.accounting_bank_statement_lines (organization_id, is_reconciled)
  WHERE is_reconciled = false;

-- RLS (service role / admin client)
ALTER TABLE public.accounting_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_reconciliation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_reconciliation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_reconciliations;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_reconciliation_lines;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_reconciliation_logs;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_bank_statements;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_bank_statement_lines;

CREATE POLICY "Full access for service role"
ON public.accounting_reconciliations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_reconciliation_lines FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_reconciliation_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_bank_statements FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_bank_statement_lines FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
