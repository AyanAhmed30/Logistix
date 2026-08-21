-- =====================================================
-- Vendor refunds must post to the GL (Odoo vendor credit notes).
-- Idempotent. Run in the Supabase SQL editor.
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
      'vendor_refund',
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

ALTER TABLE public.accounting_vendor_refunds
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_refunds_je
  ON public.accounting_vendor_refunds (journal_entry_id)
  WHERE journal_entry_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
