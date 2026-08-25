-- Period lock date (month-end close without year-end).
-- Distinct from fiscal/hard lock. Idempotent.

ALTER TABLE public.accounting_lock_settings
  ADD COLUMN IF NOT EXISTS period_lock_date DATE;

COMMENT ON COLUMN public.accounting_lock_settings.period_lock_date IS
  'Period lock: blocks posting on or before this date for the organization. Inclusive.';
