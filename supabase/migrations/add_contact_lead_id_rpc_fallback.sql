-- RPC fallback for contacts.lead_id_formatted (Customer ID).
-- Safe to re-run in Supabase SQL Editor.
-- Prerequisite: contacts table exists.
-- This script also adds lead_id_formatted if it is missing.

-- 1) Ensure the column exists
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS lead_id_formatted TEXT;

-- 2) Drop old function versions (avoids "cannot change return type" errors)
DROP FUNCTION IF EXISTS public.get_contact_lead_ids(uuid[]);
DROP FUNCTION IF EXISTS public.set_contact_lead_id(uuid, text);

-- 3) Read Customer IDs even when PostgREST schema cache omits the column
CREATE FUNCTION public.get_contact_lead_ids(p_ids uuid[])
RETURNS TABLE(id uuid, lead_id_formatted text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.lead_id_formatted::text
  FROM public.contacts AS c
  WHERE c.id = ANY (p_ids);
$$;

-- 4) Set Customer ID only when the contact does not already have one
CREATE FUNCTION public.set_contact_lead_id(
  p_contact_id uuid,
  p_lead_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing text;
BEGIN
  IF p_lead_id IS NULL OR btrim(p_lead_id) = '' THEN
    RAISE EXCEPTION 'lead_id is required';
  END IF;

  SELECT c.lead_id_formatted
  INTO v_existing
  FROM public.contacts AS c
  WHERE c.id = p_contact_id;

  IF v_existing IS NOT NULL AND btrim(v_existing) <> '' THEN
    RETURN btrim(v_existing);
  END IF;

  UPDATE public.contacts AS c
  SET lead_id_formatted = btrim(p_lead_id)
  WHERE c.id = p_contact_id
    AND (c.lead_id_formatted IS NULL OR btrim(c.lead_id_formatted) = '');

  SELECT c.lead_id_formatted
  INTO v_existing
  FROM public.contacts AS c
  WHERE c.id = p_contact_id;

  RETURN NULLIF(btrim(COALESCE(v_existing, '')), '');
END;
$$;

-- 5) Permissions
GRANT EXECUTE ON FUNCTION public.get_contact_lead_ids(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_contact_lead_ids(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_contact_lead_id(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_contact_lead_id(uuid, text) TO authenticated;

-- 6) Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
