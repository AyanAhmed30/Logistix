-- Unique Inquiry Reference Number + Operations inquiry flags.
-- Idempotent. Does not change lead/customer numbers or inquiry status.

-- 1) Inquiry reference on the existing inquiry row (user identity stays on leads.lead_id_formatted)
ALTER TABLE public.lead_inquiries
  ADD COLUMN IF NOT EXISTS inquiry_reference text;

CREATE SEQUENCE IF NOT EXISTS public.lead_inquiries_inquiry_reference_seq;

-- Backfill existing inquiries in chronological order. Skip rows that already have a reference.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.lead_inquiries
    WHERE inquiry_reference IS NULL
       OR btrim(inquiry_reference) = ''
    ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    UPDATE public.lead_inquiries
    SET inquiry_reference =
      'INQ-' || lpad(nextval('public.lead_inquiries_inquiry_reference_seq')::text, 6, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_inquiries_inquiry_reference
  ON public.lead_inquiries (inquiry_reference);

CREATE OR REPLACE FUNCTION public.assign_lead_inquiry_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.inquiry_reference IS NULL OR btrim(NEW.inquiry_reference) = '' THEN
    NEW.inquiry_reference :=
      'INQ-' || lpad(nextval('public.lead_inquiries_inquiry_reference_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_inquiries_inquiry_reference ON public.lead_inquiries;
CREATE TRIGGER trg_lead_inquiries_inquiry_reference
BEFORE INSERT ON public.lead_inquiries
FOR EACH ROW
EXECUTE PROCEDURE public.assign_lead_inquiry_reference();

-- 2) Flags: one or more messages permanently linked to a specific inquiry
CREATE TABLE IF NOT EXISTS public.inquiry_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.lead_inquiries(id) ON DELETE CASCADE,
  message text NOT NULL,
  raised_by text NOT NULL,
  raised_by_role text NOT NULL DEFAULT 'operations',
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_inquiry_flags_inquiry_created
  ON public.inquiry_flags (inquiry_id, created_at DESC);

ALTER TABLE public.inquiry_flags ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inquiry_flags'
      AND policyname = 'Full access for service role'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Full access for service role"
      ON public.inquiry_flags
      FOR ALL
      USING (true)
      WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- 3) Allow lifecycle inbox event for flags without dropping unknown live event types
DO $$
DECLARE
  rec record;
  allowed text;
BEGIN
  IF to_regclass('public.inquiry_lifecycle_notifications') IS NULL THEN
    RETURN;
  END IF;

  FOR rec IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'inquiry_lifecycle_notifications'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.inquiry_lifecycle_notifications DROP CONSTRAINT IF EXISTS %I',
      rec.conname
    );
  END LOOP;

  SELECT string_agg(quote_literal(val), ', ' ORDER BY val)
  INTO allowed
  FROM (
    SELECT DISTINCT btrim(event_type) AS val
    FROM public.inquiry_lifecycle_notifications
    WHERE event_type IS NOT NULL
      AND btrim(event_type) <> ''
    UNION
    SELECT unnest(ARRAY[
      'inquiry_received',
      'inquiry_sent',
      'sent_for_admin_approval',
      'approved',
      'rejected',
      'lead_transferred',
      'customer_submitted',
      'quotation_sent_to_customer',
      'quotation_negotiation_request',
      'quotation_counter_offer',
      'quotation_customer_accepted',
      'quotation_customer_declined',
      'customer_requested_negotiation',
      'customer_accepted_quotation',
      'customer_declined_quotation',
      'inquiry_flag_raised'
    ])
  ) s;

  IF allowed IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.inquiry_lifecycle_notifications
         ADD CONSTRAINT inquiry_lifecycle_notifications_event_type_check
         CHECK (event_type IN (%s))',
      allowed
    );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
