-- =====================================================
-- Odoo-style quotation numbers: S00001 (was QT).
-- Idempotent.
-- =====================================================

ALTER TABLE public.sales_number_sequences
  ALTER COLUMN prefix SET DEFAULT 'S';

UPDATE public.sales_number_sequences
SET prefix = 'S', updated_at = now()
WHERE prefix IS DISTINCT FROM 'S';

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
