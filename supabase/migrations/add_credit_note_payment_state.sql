-- =====================================================
-- Credit note payment_state (Odoo In Payment).
-- Idempotent.
-- =====================================================

ALTER TABLE public.accounting_credit_notes
  ADD COLUMN IF NOT EXISTS payment_state TEXT NOT NULL DEFAULT 'not_paid';

ALTER TABLE public.accounting_credit_notes
  DROP CONSTRAINT IF EXISTS accounting_credit_notes_payment_state_check;

ALTER TABLE public.accounting_credit_notes
  ADD CONSTRAINT accounting_credit_notes_payment_state_check
  CHECK (payment_state IN ('not_paid', 'in_payment', 'partial', 'paid'));

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
