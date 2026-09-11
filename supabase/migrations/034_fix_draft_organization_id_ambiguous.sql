-- 034 — Fix ambiguous organization_id in save-draft helper
-- Prerequisite: 033_customer_inquiry_drafts.sql
--
-- _prepare_customer_inquiry_lead RETURNS TABLE (..., organization_id uuid, ...).
-- That output column collided with leads.organization_id in:
--   UPDATE leads SET organization_id = coalesce(organization_id, v_org_id)

CREATE OR REPLACE FUNCTION public._prepare_customer_inquiry_lead(p_session_token text)
RETURNS TABLE (
  user_id uuid,
  phone text,
  user_name text,
  lead_id uuid,
  organization_id uuid,
  agent_id uuid,
  agent_username text,
  lead_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_phone text;
  v_user_name text;
  v_contact public.contacts%rowtype;
  v_agent_id uuid;
  v_agent_username text;
  v_lead public.leads%rowtype;
  v_customer_id text;
  v_org_id uuid;
  v_created_by text;
BEGIN
  v_user_id := public._resolve_session_user_id(p_session_token);

  SELECT u.phone, trim(both from (u.first_name || ' ' || u.last_name))
  INTO v_phone, v_user_name
  FROM public.users u
  WHERE u.id = v_user_id;

  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'unauthorized_user' USING ERRCODE = '42501';
  END IF;

  SELECT ct.*
  INTO v_contact
  FROM public.contacts ct
  WHERE public.phones_match(ct.phone, v_phone)
     OR public.phones_match(ct.mobile, v_phone)
  ORDER BY
    CASE WHEN ct.salesperson_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE
      WHEN ct.created_by IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.sales_agents sa0
         WHERE lower(trim(sa0.username)) = lower(trim(ct.created_by))
       ) THEN 0
      ELSE 1
    END,
    ct.created_at DESC NULLS LAST
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'no_matching_contact';
  END IF;

  v_created_by := nullif(trim(coalesce(v_contact.created_by, '')), '');
  v_customer_id := nullif(trim(coalesce(v_contact.lead_id_formatted, '')), '');
  v_org_id := v_contact.organization_id;

  IF v_contact.salesperson_id IS NOT NULL THEN
    SELECT sa.id, sa.username
    INTO v_agent_id, v_agent_username
    FROM public.sales_agents sa
    WHERE sa.id = v_contact.salesperson_id
    LIMIT 1;
  END IF;

  IF v_agent_id IS NULL AND v_created_by IS NOT NULL THEN
    SELECT sa.id, sa.username
    INTO v_agent_id, v_agent_username
    FROM public.sales_agents sa
    WHERE lower(trim(sa.username)) = lower(v_created_by)
    LIMIT 1;
  END IF;

  IF v_agent_id IS NULL AND v_created_by IS NOT NULL THEN
    SELECT sa.id, sa.username
    INTO v_agent_id, v_agent_username
    FROM public.sales_agents sa
    WHERE sa.email IS NOT NULL
      AND lower(trim(sa.email)) = lower(v_created_by)
    LIMIT 1;
  END IF;

  IF v_agent_id IS NULL THEN
    SELECT sa.id, sa.username
    INTO v_agent_id, v_agent_username
    FROM public.leads l
    JOIN public.sales_agents sa ON sa.id = l.sales_agent_id
    WHERE l.contact_id = v_contact.id
      AND l.sales_agent_id IS NOT NULL
    ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_agent_id IS NULL THEN
    SELECT sa.id, sa.username
    INTO v_agent_id, v_agent_username
    FROM public.leads l
    JOIN public.sales_agents sa ON sa.id = l.sales_agent_id
    WHERE public.phones_match(l.number, v_phone)
      AND l.sales_agent_id IS NOT NULL
    ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC NULLS LAST
    LIMIT 1;
  END IF;

  IF v_agent_id IS NULL THEN
    BEGIN
      SELECT sa.id, sa.username
      INTO v_agent_id, v_agent_username
      FROM public.crm_opportunities o
      JOIN public.sales_agents sa ON sa.id = o.salesperson_id
      WHERE o.contact_id = v_contact.id
        AND o.salesperson_id IS NOT NULL
      ORDER BY o.updated_at DESC NULLS LAST, o.created_at DESC NULLS LAST
      LIMIT 1;
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN undefined_column THEN NULL;
    END;
  END IF;

  IF v_agent_id IS NULL THEN
    RAISE EXCEPTION 'no_sales_owner';
  END IF;

  SELECT l.*
  INTO v_lead
  FROM public.leads l
  WHERE l.contact_id = v_contact.id
    AND l.sales_agent_id = v_agent_id
  ORDER BY l.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    SELECT l.*
    INTO v_lead
    FROM public.leads l
    WHERE l.contact_id = v_contact.id
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT l.*
    INTO v_lead
    FROM public.leads l
    WHERE public.phones_match(l.number, v_phone)
      AND l.sales_agent_id = v_agent_id
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    SELECT l.*
    INTO v_lead
    FROM public.leads l
    WHERE public.phones_match(l.number, v_phone)
    ORDER BY l.created_at DESC
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    IF v_customer_id IS NULL THEN
      v_customer_id := upper(left(replace(v_contact.id::text, '-', ''), 8));
      BEGIN
        UPDATE public.contacts
        SET lead_id_formatted = v_customer_id
        WHERE id = v_contact.id
          AND (lead_id_formatted IS NULL OR btrim(lead_id_formatted) = '');
      EXCEPTION
        WHEN others THEN NULL;
      END;
    END IF;

    INSERT INTO public.leads (
      name, number, source, status, sales_agent_id, created_by_sales_agent_id,
      contact_id, organization_id, converted, lead_id_formatted
    )
    VALUES (
      coalesce(nullif(trim(v_contact.name), ''), nullif(v_user_name, ''), 'Customer'),
      coalesce(nullif(trim(v_contact.phone), ''), nullif(trim(v_contact.mobile), ''), v_phone),
      'Others',
      'Inquiry Received',
      v_agent_id,
      v_agent_id,
      v_contact.id,
      v_org_id,
      false,
      v_customer_id
    )
    RETURNING * INTO v_lead;
  ELSE
    UPDATE public.leads l
    SET
      contact_id = coalesce(l.contact_id, v_contact.id),
      sales_agent_id = coalesce(l.sales_agent_id, v_agent_id),
      organization_id = coalesce(l.organization_id, v_org_id),
      lead_id_formatted = coalesce(nullif(trim(l.lead_id_formatted), ''), v_customer_id)
    WHERE l.id = v_lead.id
    RETURNING * INTO v_lead;
  END IF;

  BEGIN
    UPDATE public.contacts
    SET
      salesperson_id = coalesce(salesperson_id, v_agent_id),
      created_by = coalesce(nullif(trim(created_by), ''), v_agent_username)
    WHERE id = v_contact.id
      AND (salesperson_id IS NULL OR created_by IS NULL OR btrim(created_by) = '');
  EXCEPTION
    WHEN others THEN NULL;
  END;

  user_id := v_user_id;
  phone := v_phone;
  user_name := v_user_name;
  lead_id := v_lead.id;
  organization_id := coalesce(v_lead.organization_id, v_org_id);
  agent_id := v_agent_id;
  agent_username := v_agent_username;
  lead_number := v_lead.lead_id_formatted;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public._prepare_customer_inquiry_lead(text) FROM PUBLIC;
