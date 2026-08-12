-- =====================================================
-- Company bank accounts on invoices (Odoo-style recipient bank)
-- Source of truth: Chart of Accounts rows with account_type = 'bank'
-- Idempotent.
-- =====================================================

-- Optional payment-instruction metadata on CoA bank accounts
ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS bank_account_number TEXT;

ALTER TABLE public.chart_of_accounts
  ADD COLUMN IF NOT EXISTS bank_currency TEXT;

-- Invoice → selected recipient bank (CoA bank account)
ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS bank_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_aci_bank_account_id
  ON public.accounting_customer_invoices (bank_account_id)
  WHERE bank_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_coa_bank_accounts_active
  ON public.chart_of_accounts (organization_id, is_active, code)
  WHERE account_type = 'bank';

NOTIFY pgrst, 'reload schema';
