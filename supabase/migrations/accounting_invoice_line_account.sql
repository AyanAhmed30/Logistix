-- =====================================================
-- Accounting invoice lines — Account column (Odoo-style)
-- Idempotent.
-- =====================================================

ALTER TABLE public.accounting_customer_invoice_lines
  ADD COLUMN IF NOT EXISTS account TEXT NOT NULL DEFAULT 'Sales';

COMMENT ON COLUMN public.accounting_customer_invoice_lines.account IS
  'Income / GL account label for the invoice line (Odoo-style Account column).';

NOTIFY pgrst, 'reload schema';
