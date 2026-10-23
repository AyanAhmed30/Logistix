-- STEP 049 — Admin-direct inquiry calculation origin + status
-- Persists who submitted the calculation (operations vs admin).
-- Extends lead_inquiries.approval_status with calculated_by_admin.
-- Idempotent. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- inquiry_confirmations.submitted_by_role
-- ---------------------------------------------------------------------------
ALTER TABLE public.inquiry_confirmations
  ADD COLUMN IF NOT EXISTS submitted_by_role text;

DO $$
BEGIN
  -- Default existing rows to operations (do not fabricate admin origin).
  UPDATE public.inquiry_confirmations
  SET submitted_by_role = 'operations'
  WHERE submitted_by_role IS NULL
     OR btrim(submitted_by_role) = '';

  ALTER TABLE public.inquiry_confirmations
    ALTER COLUMN submitted_by_role SET DEFAULT 'operations';

  ALTER TABLE public.inquiry_confirmations
    ALTER COLUMN submitted_by_role SET NOT NULL;
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inquiry_confirmations_submitted_by_role_check'
  ) THEN
    ALTER TABLE public.inquiry_confirmations
      DROP CONSTRAINT inquiry_confirmations_submitted_by_role_check;
  END IF;

  ALTER TABLE public.inquiry_confirmations
    ADD CONSTRAINT inquiry_confirmations_submitted_by_role_check
    CHECK (submitted_by_role IN ('operations', 'admin'));
END $$;

CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_submitted_by_role
  ON public.inquiry_confirmations (submitted_by_role);

-- ---------------------------------------------------------------------------
-- lead_inquiries.approval_status — add calculated_by_admin
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lead_inquiries_approval_status_check'
  ) THEN
    ALTER TABLE public.lead_inquiries
      DROP CONSTRAINT lead_inquiries_approval_status_check;
  END IF;

  ALTER TABLE public.lead_inquiries
    ADD CONSTRAINT lead_inquiries_approval_status_check
    CHECK (
      approval_status IN (
        'draft',
        'sent',
        'sent_to_admin',
        'calculated_by_admin',
        'approved',
        'rejected'
      )
    );
END $$;
