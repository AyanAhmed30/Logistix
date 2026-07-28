-- =====================================================
-- Accounting Phase 4 — Invoice Payments
-- Idempotent.
-- =====================================================

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS payment_state TEXT NOT NULL DEFAULT 'not_paid';

ALTER TABLE public.accounting_customer_invoices
  DROP CONSTRAINT IF EXISTS accounting_customer_invoices_payment_state_check;

ALTER TABLE public.accounting_customer_invoices
  ADD CONSTRAINT accounting_customer_invoices_payment_state_check
  CHECK (payment_state IN ('not_paid', 'partial', 'paid', 'overdue'));

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS amount_residual NUMERIC(14, 2);

-- Backfill residual from total when null
UPDATE public.accounting_customer_invoices
SET amount_residual = COALESCE(total_amount, 0) - COALESCE(amount_paid, 0)
WHERE amount_residual IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES public.accounting_customer_invoices(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque')),
  reference TEXT,
  notes TEXT,
  paid_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_invoice_payments_invoice
  ON public.accounting_invoice_payments (invoice_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_invoice_payments_org
  ON public.accounting_invoice_payments (organization_id);

CREATE INDEX IF NOT EXISTS idx_accounting_invoice_payments_created
  ON public.accounting_invoice_payments (invoice_id, created_at DESC);

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
