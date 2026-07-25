-- =====================================================
-- Sales Orders Phase 7 — delivery status placeholder
-- Idempotent. No warehouse logic yet.
-- =====================================================

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'waiting';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_delivery_status_check'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_delivery_status_check
      CHECK (delivery_status IN ('waiting', 'ready', 'delivered'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Confirmed sales orders default to waiting delivery
UPDATE public.quotations
SET delivery_status = 'waiting'
WHERE status = 'sales_order'
  AND (delivery_status IS NULL OR delivery_status = '');

NOTIFY pgrst, 'reload schema';
