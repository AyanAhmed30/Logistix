-- =====================================================
-- Invoice line → Chart of Accounts FK (Odoo-style)
-- Stores account_id for JE posting; keeps legacy account TEXT label.
-- Idempotent.
-- =====================================================

ALTER TABLE public.accounting_customer_invoice_lines
  ADD COLUMN IF NOT EXISTS account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aci_lines_account_id
  ON public.accounting_customer_invoice_lines (account_id)
  WHERE account_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
