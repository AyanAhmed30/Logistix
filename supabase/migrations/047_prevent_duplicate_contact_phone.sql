-- =====================================================
-- Prevent duplicate contacts by normalized phone across
-- Sales Agents (same organization). Concurrent-safe.
-- Does NOT delete/merge existing rows or change IDs.
-- Existing duplicate phones remain; new collisions raise.
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_duplicate_contact_phone()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_id uuid;
  v_existing_name text;
  v_existing_lead text;
  v_digits text;
  v_tail text;
BEGIN
  v_digits := regexp_replace(
    COALESCE(NULLIF(btrim(COALESCE(NEW.phone, '')), ''), NULLIF(btrim(COALESCE(NEW.mobile, '')), ''), ''),
    '\D',
    '',
    'g'
  );

  IF v_digits IS NULL OR length(v_digits) < 10 THEN
    RETURN NEW;
  END IF;

  v_tail := right(v_digits, 10);

  SELECT c.id, c.name, c.lead_id_formatted
    INTO v_existing_id, v_existing_name, v_existing_lead
  FROM public.contacts c
  WHERE c.id IS DISTINCT FROM NEW.id
    AND (
      NEW.organization_id IS NULL
      OR c.organization_id IS NULL
      OR c.organization_id = NEW.organization_id
    )
    AND (
      right(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g'), 10) = v_tail
      OR right(regexp_replace(COALESCE(c.mobile, ''), '\D', '', 'g'), 10) = v_tail
    )
    AND (
      length(regexp_replace(COALESCE(c.phone, ''), '\D', '', 'g')) >= 10
      OR length(regexp_replace(COALESCE(c.mobile, ''), '\D', '', 'g')) >= 10
    )
  ORDER BY c.created_at ASC NULLS LAST, c.id ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate_contact_phone:%|%|%',
      v_existing_id,
      COALESCE(NULLIF(btrim(v_existing_name), ''), '—'),
      COALESCE(NULLIF(btrim(v_existing_lead), ''), '')
      USING ERRCODE = '23505';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_contact_phone ON public.contacts;

CREATE TRIGGER trg_prevent_duplicate_contact_phone
  BEFORE INSERT OR UPDATE OF phone, mobile, organization_id
  ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_duplicate_contact_phone();

CREATE INDEX IF NOT EXISTS idx_contacts_phone_digits_tail
  ON public.contacts (
    (right(regexp_replace(COALESCE(phone, ''), '\D', '', 'g'), 10))
  )
  WHERE phone IS NOT NULL AND btrim(phone) <> '';

CREATE INDEX IF NOT EXISTS idx_contacts_mobile_digits_tail
  ON public.contacts (
    (right(regexp_replace(COALESCE(mobile, ''), '\D', '', 'g'), 10))
  )
  WHERE mobile IS NOT NULL AND btrim(mobile) <> '';

CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm_search
  ON public.contacts (lower(name));

CREATE INDEX IF NOT EXISTS idx_contacts_lead_id_formatted_search
  ON public.contacts (lead_id_formatted)
  WHERE lead_id_formatted IS NOT NULL;

NOTIFY pgrst, 'reload schema';
