-- Phase 4 — Review integrity: fix deferral CHECK, credit-note aging indexes.
-- Idempotent.

DO $$
BEGIN
  IF to_regclass('public.accounting_deferral_schedules') IS NOT NULL THEN
    ALTER TABLE public.accounting_deferral_schedules
      DROP CONSTRAINT IF EXISTS accounting_deferral_schedules_check;
    ALTER TABLE public.accounting_deferral_schedules
      DROP CONSTRAINT IF EXISTS accounting_deferral_schedules_end_after_start;
    ALTER TABLE public.accounting_deferral_schedules
      ADD CONSTRAINT accounting_deferral_schedules_end_after_start
      CHECK (end_date >= start_date);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_accounting_credit_notes_invoice_posted
  ON public.accounting_credit_notes (invoice_id, status, credit_note_date)
  WHERE invoice_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_refunds_bill_posted
  ON public.accounting_vendor_refunds (bill_id, status, refund_date)
  WHERE bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotation_lines_quotation_seq
  ON public.quotation_lines (quotation_id, sequence);

CREATE INDEX IF NOT EXISTS idx_accounting_invoice_payments_invoice_date
  ON public.accounting_invoice_payments (invoice_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_payments_bill_date
  ON public.accounting_vendor_payments (bill_id, payment_date);

NOTIFY pgrst, 'reload schema';
