-- Add legacy-style 6-digit Lead Number / Customer ID to contacts.
-- Unique per contact; never reused after delete. Backfills from linked leads where possible.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_id_formatted TEXT;

COMMENT ON COLUMN public.contacts.lead_id_formatted IS
  'Permanent 6-digit business identifier (Lead Number / Customer ID). Auto-assigned on create; never changed or reused.';

CREATE SEQUENCE IF NOT EXISTS public.contact_lead_id_seq
  START WITH 100001
  INCREMENT BY 1
  MINVALUE 100001
  MAXVALUE 999999
  NO CYCLE;

CREATE OR REPLACE FUNCTION public.allocate_contact_lead_id_formatted()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  candidate bigint;
  formatted text;
  attempts int := 0;
BEGIN
  LOOP
    attempts := attempts + 1;
    IF attempts > 200 THEN
      RAISE EXCEPTION 'Unable to allocate unique contact lead id after 200 attempts';
    END IF;

    candidate := nextval('public.contact_lead_id_seq');
    IF candidate > 999999 THEN
      RAISE EXCEPTION 'Contact lead id sequence exhausted (>999999)';
    END IF;

    formatted := lpad(candidate::text, 6, '0');

    IF NOT EXISTS (
      SELECT 1 FROM public.contacts WHERE lead_id_formatted = formatted
    ) THEN
      RETURN formatted;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_contact_lead_id_formatted() TO service_role;

-- Copy from linked legacy leads when the contact has no number yet.
UPDATE public.contacts c
SET lead_id_formatted = NULLIF(btrim(l.lead_id_formatted), '')
FROM public.leads l
WHERE c.legacy_lead_id = l.id
  AND (c.lead_id_formatted IS NULL OR btrim(c.lead_id_formatted) = '')
  AND l.lead_id_formatted IS NOT NULL
  AND btrim(l.lead_id_formatted) <> ''
  AND l.lead_id_formatted ~ '^\d{6}$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.contacts c2
    WHERE c2.lead_id_formatted = l.lead_id_formatted
      AND c2.id <> c.id
  );

-- Drop invalid or duplicate values (keep oldest contact per number).
UPDATE public.contacts
SET lead_id_formatted = NULL
WHERE lead_id_formatted IS NOT NULL
  AND lead_id_formatted !~ '^\d{6}$';

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lead_id_formatted
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.contacts
  WHERE lead_id_formatted IS NOT NULL
    AND btrim(lead_id_formatted) <> ''
)
UPDATE public.contacts c
SET lead_id_formatted = NULL
FROM ranked r
WHERE c.id = r.id
  AND r.rn > 1;

-- Assign sequential numbers to any contact still missing one.
DO $$
DECLARE
  r RECORD;
  new_id text;
BEGIN
  FOR r IN
    SELECT id
    FROM public.contacts
    WHERE lead_id_formatted IS NULL OR btrim(lead_id_formatted) = ''
    ORDER BY created_at ASC NULLS LAST, id ASC
  LOOP
    new_id := public.allocate_contact_lead_id_formatted();
    UPDATE public.contacts
    SET lead_id_formatted = new_id
    WHERE id = r.id;
  END LOOP;
END;
$$;

-- Advance sequence past all known IDs (contacts + leads) so new allocations never collide.
DO $$
DECLARE
  max_val bigint := 100000;
  next_start bigint;
BEGIN
  SELECT GREATEST(
    max_val,
    COALESCE((
      SELECT MAX(lead_id_formatted::bigint)
      FROM public.contacts
      WHERE lead_id_formatted ~ '^\d{6}$'
    ), max_val),
    COALESCE((
      SELECT MAX(lead_id_formatted::bigint)
      FROM public.leads
      WHERE lead_id_formatted ~ '^\d{6}$'
    ), max_val)
  ) INTO max_val;

  next_start := GREATEST(max_val, 100000);
  PERFORM setval('public.contact_lead_id_seq', next_start, true);
END;
$$;

ALTER TABLE public.contacts
  ALTER COLUMN lead_id_formatted SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contacts_lead_id_formatted_key'
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_lead_id_formatted_key UNIQUE (lead_id_formatted);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_id_formatted
  ON public.contacts (lead_id_formatted);

-- Refresh PostgREST schema cache so the API returns lead_id_formatted immediately.
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');

-- RPC fallback when PostgREST still cannot expose contacts.lead_id_formatted.
CREATE OR REPLACE FUNCTION public.get_contact_lead_ids(p_ids uuid[])
RETURNS TABLE(id uuid, lead_id_formatted text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.lead_id_formatted
  FROM public.contacts c
  WHERE c.id = ANY(p_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_contact_lead_ids(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_contact_lead_ids(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_contact_lead_id(
  p_contact_id uuid,
  p_lead_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_lead_id IS NULL OR btrim(p_lead_id) = '' THEN
    RAISE EXCEPTION 'lead_id is required';
  END IF;

  UPDATE public.contacts
  SET lead_id_formatted = p_lead_id
  WHERE id = p_contact_id
    AND (lead_id_formatted IS NULL OR btrim(lead_id_formatted) = '');

  RETURN (
    SELECT lead_id_formatted
    FROM public.contacts
    WHERE id = p_contact_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_contact_lead_id(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_contact_lead_id(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
