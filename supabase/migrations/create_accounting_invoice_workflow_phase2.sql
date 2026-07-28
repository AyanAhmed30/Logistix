-- =====================================================
-- Accounting Phase 2/3 — Invoice form workflow
-- Notes split, activity logs, allow multiple invoices per SO.
-- Idempotent.
-- =====================================================

-- Customer-facing notes (PDF / email); existing `notes` = internal notes
ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS customer_notes TEXT;

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- Allow multiple invoices from one Sales Order (Odoo partial / duplicate)
DROP INDEX IF EXISTS public.idx_accounting_customer_invoices_sales_order;

CREATE INDEX IF NOT EXISTS idx_accounting_customer_invoices_sales_order_id
  ON public.accounting_customer_invoices (sales_order_id)
  WHERE sales_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.accounting_invoice_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.accounting_customer_invoices(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  performed_by TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_accounting_invoice_logs_invoice
  ON public.accounting_invoice_logs (invoice_id, performed_at DESC);

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
