-- =====================================================
-- Allow Odoo-style "in_payment" on customer invoices.
-- Idempotent.
-- =====================================================

ALTER TABLE public.accounting_customer_invoices
  DROP CONSTRAINT IF EXISTS accounting_customer_invoices_payment_state_check;

ALTER TABLE public.accounting_customer_invoices
  ADD CONSTRAINT accounting_customer_invoices_payment_state_check
  CHECK (payment_state IN ('not_paid', 'in_payment', 'partial', 'paid', 'overdue'));

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
