-- =====================================================
-- Accounting Foundation — Lock Dates / Year Close hardening
-- Completes Phase 6 production architecture. Idempotent.
-- =====================================================

-- Soft lock (Odoo-style): blocks non-administrators; admins may override
ALTER TABLE public.accounting_lock_settings
  ADD COLUMN IF NOT EXISTS soft_lock_date DATE;

-- Track opening-balance carry-forward JE for the next fiscal year
ALTER TABLE public.accounting_fiscal_years
  ADD COLUMN IF NOT EXISTS opening_balance_journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_fiscal_years
  ADD COLUMN IF NOT EXISTS previous_fiscal_year_id UUID
    REFERENCES public.accounting_fiscal_years(id) ON DELETE SET NULL;

-- Allow year_opening as JE source (opening balances)
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
      'year_closing',
      'year_opening'
    )
  );

-- Vendor payments: link to JE for GL integrity
ALTER TABLE public.accounting_vendor_payments
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_payments_je
  ON public.accounting_vendor_payments (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

-- Dashboard / reporting helpers: index posted JE by org+date
CREATE INDEX IF NOT EXISTS idx_accounting_je_org_posted_date
  ON public.accounting_journal_entries (organization_id, status, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_je_lines_entry
  ON public.accounting_journal_entry_lines (journal_entry_id);

-- Outstanding AR/AP dashboard support
CREATE INDEX IF NOT EXISTS idx_accounting_invoices_org_status_residual
  ON public.accounting_customer_invoices (organization_id, status)
  WHERE status IN ('posted', 'paid');

CREATE INDEX IF NOT EXISTS idx_accounting_bills_org_status
  ON public.accounting_vendor_bills (organization_id, status)
  WHERE status IN ('posted', 'paid');

NOTIFY pgrst, 'reload schema';
