-- Sales → Operations → Admin → Quotation inquiry workflow.
-- Extends lead_inquiries.approval_status with sent_to_admin and links
-- sales quotations back to the same inquiry record.
-- Idempotent. Safe to run multiple times.

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
    CHECK (approval_status IN ('draft', 'sent', 'sent_to_admin', 'approved', 'rejected'));
END $$;

-- Legacy rows: Operations already submitted to Admin but approval_status stayed 'sent'.
UPDATE public.lead_inquiries li
SET approval_status = 'sent_to_admin',
    updated_at = now()
WHERE li.approval_status = 'sent'
  AND EXISTS (
    SELECT 1
    FROM public.inquiry_confirmations ic
    WHERE ic.inquiry_id = li.id
      AND ic.status = 'pending'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.inquiry_confirmations ic2
    WHERE ic2.inquiry_id = li.id
      AND ic2.status = 'approved'
  );

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS linked_inquiry_id UUID REFERENCES public.lead_inquiries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_linked_inquiry_id
  ON public.quotations (linked_inquiry_id)
  WHERE linked_inquiry_id IS NOT NULL;
