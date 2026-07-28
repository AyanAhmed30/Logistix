-- RPC fallback when PostgREST schema cache has not picked up contacts.lead_id_formatted yet.
-- Run this in Supabase SQL Editor if the REST API still cannot see the column.

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
