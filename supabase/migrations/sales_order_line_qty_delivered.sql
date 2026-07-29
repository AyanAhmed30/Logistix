-- =====================================================
-- Sales Order line qty_delivered (Odoo-style, manual until Warehouse)
-- Idempotent.
-- =====================================================

ALTER TABLE public.quotation_lines
  ADD COLUMN IF NOT EXISTS qty_delivered NUMERIC(18, 4) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.quotation_lines.qty_delivered IS
  'Delivered quantity (manual until Warehouse automation updates it).';

NOTIFY pgrst, 'reload schema';
