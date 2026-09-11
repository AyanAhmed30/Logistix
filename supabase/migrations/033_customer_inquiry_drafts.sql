-- 033 — Customer mobile inquiry drafts
-- Prerequisites: 018 (submit_customer_inquiry), 019 (portal), 031 (opportunity trigger)
--
-- Drafts are the same lead_inquiries row with:
--   status = 'draft', customer_submitted = false
-- They must NOT create a CRM Opportunity or notify the Sales Agent.
-- Final submit flips the same row to pending + customer_submitted = true.

-- Allow status = draft on lead_inquiries
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'lead_inquiries'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
      AND pg_get_constraintdef(c.oid) ILIKE '%pending%'
      AND pg_get_constraintdef(c.oid) NOT ILIKE '%''draft''%'
  LOOP
    EXECUTE format('ALTER TABLE public.lead_inquiries DROP CONSTRAINT %I', r.conname);
  END LOOP;
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE public.lead_inquiries
    ADD CONSTRAINT lead_inquiries_status_check
    CHECK (status IN ('draft', 'pending', 'in_progress', 'quotation_sent', 'completed'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_table THEN NULL;
END $$;

ALTER TABLE public.lead_inquiries
  ADD COLUMN IF NOT EXISTS draft_step integer NOT NULL DEFAULT 0;

ALTER TABLE public.lead_inquiries
  ADD COLUMN IF NOT EXISTS mobile_user_id uuid;

ALTER TABLE public.lead_inquiries
  ADD COLUMN IF NOT EXISTS draft_attachments jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS lead_inquiries_mobile_drafts_idx
  ON public.lead_inquiries (mobile_user_id, updated_at DESC)
  WHERE status = 'draft' AND coalesce(customer_submitted, false) IS NOT TRUE;

COMMENT ON COLUMN public.lead_inquiries.draft_step IS
  '0-based wizard step where the customer saved this mobile draft.';
COMMENT ON COLUMN public.lead_inquiries.mobile_user_id IS
  'Customer app user who owns this draft / submitted inquiry.';
COMMENT ON COLUMN public.lead_inquiries.draft_attachments IS
  'Attachment metadata (url, name, kind) for mobile draft resume.';

-- ---------------------------------------------------------------------------
-- Resolve contact + lead for a customer session (shared by draft save/submit)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Save / update a draft (no CRM opportunity, no agent notification)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_customer_inquiry_draft(
  p_session_token text,
  p_inquiry_id uuid DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_quantity text DEFAULT NULL,
  p_total_weight text DEFAULT NULL,
  p_cbm text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_additional_image_urls jsonb DEFAULT '[]'::jsonb,
  p_draft_step integer DEFAULT 0,
  p_draft_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_lead_id uuid;
  v_org_id uuid;
  v_lead_number text;
  v_inquiry public.lead_inquiries%rowtype;
  v_next_version integer;
  v_group_id uuid;
  v_step integer;
  v_additional jsonb;
  v_attachments jsonb;
  v_product text;
  v_qty text;
  v_weight text;
  v_cbm text;
  v_desc text;
  v_image_url text;
BEGIN
  SELECT ctx.user_id, ctx.lead_id, ctx.organization_id, ctx.lead_number
  INTO v_user_id, v_lead_id, v_org_id, v_lead_number
  FROM public._prepare_customer_inquiry_lead(p_session_token) ctx;

  v_product := coalesce(trim(coalesce(p_product_name, '')), '');
  v_qty := coalesce(trim(coalesce(p_quantity, '')), '');
  v_weight := coalesce(trim(coalesce(p_total_weight, '')), '');
  v_cbm := coalesce(trim(coalesce(p_cbm, '')), '');
  v_desc := coalesce(trim(coalesce(p_description, '')), '');
  v_image_url := nullif(trim(coalesce(p_image_url, '')), '');
  v_additional := coalesce(p_additional_image_urls, '[]'::jsonb);
  IF jsonb_typeof(v_additional) IS DISTINCT FROM 'array' THEN
    v_additional := '[]'::jsonb;
  END IF;
  v_attachments := coalesce(p_draft_attachments, '[]'::jsonb);
  IF jsonb_typeof(v_attachments) IS DISTINCT FROM 'array' THEN
    v_attachments := '[]'::jsonb;
  END IF;
  v_step := greatest(0, least(coalesce(p_draft_step, 0), 20));

  IF p_inquiry_id IS NOT NULL THEN
    UPDATE public.lead_inquiries
    SET
      product_name = v_product,
      quantity = v_qty,
      total_weight = v_weight,
      cbm = v_cbm,
      description = v_desc,
      image_url = v_image_url,
      additional_image_urls = v_additional,
      draft_step = v_step,
      draft_attachments = v_attachments,
      mobile_user_id = v_user_id,
      status = 'draft',
      customer_submitted = false,
      sent_to_accounting = false,
      sent_to_operations = false,
      approval_status = 'draft',
      updated_at = now()
    WHERE id = p_inquiry_id
      AND lead_id = v_lead_id
      AND coalesce(customer_submitted, false) IS NOT TRUE
      AND lower(coalesce(status, 'draft')) = 'draft'
      AND (
        mobile_user_id = v_user_id
        OR mobile_user_id IS NULL
      )
    RETURNING * INTO v_inquiry;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'draft_not_found';
    END IF;
  ELSE
    SELECT coalesce(max(li.version_number), 0) + 1
    INTO v_next_version
    FROM public.lead_inquiries li
    WHERE li.lead_id = v_lead_id;

    v_group_id := gen_random_uuid();

    INSERT INTO public.lead_inquiries (
      lead_id,
      inquiry_group_id,
      version_number,
      is_current_version,
      product_name,
      quantity,
      total_weight,
      cbm,
      description,
      image_url,
      additional_image_urls,
      status,
      sent_to_accounting,
      sent_to_operations,
      approval_status,
      approved_at,
      organization_id,
      created_by,
      customer_submitted,
      draft_step,
      mobile_user_id,
      draft_attachments
    )
    VALUES (
      v_lead_id,
      v_group_id,
      v_next_version,
      true,
      v_product,
      v_qty,
      v_weight,
      v_cbm,
      v_desc,
      v_image_url,
      v_additional,
      'draft',
      false,
      false,
      'draft',
      NULL,
      v_org_id,
      'customer_app',
      false,
      v_step,
      v_user_id,
      v_attachments
    )
    RETURNING * INTO v_inquiry;
  END IF;

  RETURN jsonb_build_object(
    'inquiry', jsonb_build_object(
      'id', v_inquiry.id,
      'lead_id', v_inquiry.lead_id,
      'lead_number', v_lead_number,
      'inquiry_number', coalesce(
        v_inquiry.version_number::text,
        upper(left(replace(v_inquiry.id::text, '-', ''), 8))
      ),
      'product_name', v_inquiry.product_name,
      'quantity', v_inquiry.quantity,
      'total_weight', v_inquiry.total_weight,
      'cbm', v_inquiry.cbm,
      'description', v_inquiry.description,
      'image_url', v_inquiry.image_url,
      'additional_image_urls', v_inquiry.additional_image_urls,
      'status', v_inquiry.status,
      'approval_status', v_inquiry.approval_status,
      'customer_submitted', false,
      'draft_step', v_inquiry.draft_step,
      'draft_attachments', v_inquiry.draft_attachments,
      'updated_at', v_inquiry.updated_at,
      'created_at', v_inquiry.created_at
    ),
    'message', 'Draft saved. You can continue this request anytime.'
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Convert an existing draft into a submitted inquiry (same row)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_customer_inquiry_draft(
  p_session_token text,
  p_inquiry_id uuid,
  p_product_name text,
  p_quantity text,
  p_total_weight text,
  p_cbm text,
  p_description text DEFAULT NULL,
  p_image_url text DEFAULT NULL,
  p_additional_image_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user_id uuid;
  v_lead_id uuid;
  v_lead_number text;
  v_agent_username text;
  v_inquiry public.lead_inquiries%rowtype;
  v_product text;
  v_qty text;
  v_weight text;
  v_cbm text;
  v_desc text;
  v_image_url text;
  v_additional jsonb;
BEGIN
  IF p_inquiry_id IS NULL THEN
    RAISE EXCEPTION 'draft_not_found';
  END IF;

  SELECT ctx.user_id, ctx.lead_id, ctx.lead_number, ctx.agent_username
  INTO v_user_id, v_lead_id, v_lead_number, v_agent_username
  FROM public._prepare_customer_inquiry_lead(p_session_token) ctx;

  v_product := trim(coalesce(p_product_name, ''));
  v_qty := trim(coalesce(p_quantity, ''));
  v_weight := trim(coalesce(p_total_weight, ''));
  v_cbm := trim(coalesce(p_cbm, ''));
  v_desc := nullif(trim(coalesce(p_description, '')), '');
  v_image_url := nullif(trim(coalesce(p_image_url, '')), '');
  v_additional := coalesce(p_additional_image_urls, '[]'::jsonb);
  IF jsonb_typeof(v_additional) IS DISTINCT FROM 'array' THEN
    v_additional := '[]'::jsonb;
  END IF;

  IF v_product = '' THEN
    RAISE EXCEPTION 'product_name_required';
  END IF;
  IF v_qty = '' OR v_qty !~ '^\d+$' THEN
    RAISE EXCEPTION 'quantity_invalid';
  END IF;
  IF v_weight = '' OR v_weight !~ '^(?:\d+|\d+\.\d+|\d*\.\d+)$' THEN
    RAISE EXCEPTION 'total_weight_invalid';
  END IF;
  IF v_cbm = '' OR v_cbm !~ '^(?:\d+|\d+\.\d+|\d*\.\d+)$' THEN
    RAISE EXCEPTION 'cbm_invalid';
  END IF;

  UPDATE public.lead_inquiries
  SET
    product_name = v_product,
    quantity = v_qty,
    total_weight = v_weight,
    cbm = v_cbm,
    description = v_desc,
    image_url = v_image_url,
    additional_image_urls = v_additional,
    status = 'pending',
    customer_submitted = true,
    sent_to_accounting = false,
    sent_to_operations = false,
    approval_status = 'draft',
    approved_at = NULL,
    mobile_user_id = v_user_id,
    updated_at = now()
  WHERE id = p_inquiry_id
    AND lead_id = v_lead_id
    AND coalesce(customer_submitted, false) IS NOT TRUE
    AND lower(coalesce(status, 'draft')) = 'draft'
    AND (
      mobile_user_id = v_user_id
      OR mobile_user_id IS NULL
    )
  RETURNING * INTO v_inquiry;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'draft_not_found';
  END IF;

  RETURN jsonb_build_object(
    'inquiry', jsonb_build_object(
      'id', v_inquiry.id,
      'lead_id', v_inquiry.lead_id,
      'lead_number', v_lead_number,
      'inquiry_number', coalesce(
        v_inquiry.version_number::text,
        upper(left(replace(v_inquiry.id::text, '-', ''), 8))
      ),
      'product_name', v_inquiry.product_name,
      'quantity', v_inquiry.quantity,
      'total_weight', v_inquiry.total_weight,
      'cbm', v_inquiry.cbm,
      'description', v_inquiry.description,
      'image_url', v_inquiry.image_url,
      'additional_image_urls', v_inquiry.additional_image_urls,
      'status', v_inquiry.status,
      'approval_status', v_inquiry.approval_status,
      'customer_submitted', true,
      'sent_to_accounting', false,
      'created_at', v_inquiry.created_at
    ),
    'sales_agent_username', v_agent_username,
    'message', 'Request submitted to your sales agent for review.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb, integer, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- CRM: never create an opportunity until the customer actually submits
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ensure_crm_opportunity_for_mobile_inquiry(p_inquiry_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inquiry record;
  v_lead record;
  v_contact record;
  v_opp record;
  v_opp_id uuid;
  v_org uuid;
  v_stage uuid;
  v_prob int := 40;
  v_name text;
  v_has_contact boolean := false;
BEGIN
  IF p_inquiry_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT
    li.id,
    li.lead_id,
    li.product_name,
    li.organization_id,
    li.crm_opportunity_id,
    li.customer_submitted,
    li.status,
    li.created_by
  INTO v_inquiry
  FROM public.lead_inquiries li
  WHERE li.id = p_inquiry_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Drafts (and any unsubmitted mobile row) must not enter the pipeline.
  IF coalesce(v_inquiry.customer_submitted, false) IS NOT TRUE
     OR lower(coalesce(v_inquiry.status, '')) = 'draft' THEN
    RETURN v_inquiry.crm_opportunity_id;
  END IF;

  IF v_inquiry.crm_opportunity_id IS NOT NULL THEN
    SELECT o.* INTO v_opp
    FROM public.crm_opportunities o
    WHERE o.id = v_inquiry.crm_opportunity_id;

    IF FOUND AND (v_opp.lead_inquiry_id IS NULL OR v_opp.lead_inquiry_id = p_inquiry_id) THEN
      UPDATE public.crm_opportunities
      SET lead_inquiry_id = p_inquiry_id, updated_at = now()
      WHERE id = v_opp.id
        AND lead_inquiry_id IS DISTINCT FROM p_inquiry_id;
      RETURN v_opp.id;
    END IF;
  END IF;

  SELECT o.id INTO v_opp_id
  FROM public.crm_opportunities o
  WHERE o.lead_inquiry_id = p_inquiry_id
  LIMIT 1;

  IF v_opp_id IS NOT NULL THEN
    UPDATE public.lead_inquiries
    SET crm_opportunity_id = v_opp_id, updated_at = now()
    WHERE id = p_inquiry_id
      AND crm_opportunity_id IS DISTINCT FROM v_opp_id;
    RETURN v_opp_id;
  END IF;

  SELECT
    l.id,
    l.contact_id,
    l.sales_agent_id,
    l.organization_id,
    l.name,
    l.number
  INTO v_lead
  FROM public.leads l
  WHERE l.id = v_inquiry.lead_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_lead.contact_id IS NOT NULL THEN
    SELECT c.id, c.name, c.email, c.phone, c.mobile, c.salesperson_id, c.organization_id, c.created_by
    INTO v_contact
    FROM public.contacts c
    WHERE c.id = v_lead.contact_id;
    v_has_contact := FOUND;
  END IF;

  v_org := coalesce(
    v_inquiry.organization_id,
    v_lead.organization_id,
    CASE WHEN v_has_contact THEN v_contact.organization_id ELSE NULL END,
    public._organization_id_for_sales_agent(coalesce(
      v_lead.sales_agent_id,
      CASE WHEN v_has_contact THEN v_contact.salesperson_id ELSE NULL END
    ))
  );

  v_stage := public._ensure_crm_qualified_stage_for_org(v_org);
  IF v_stage IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT coalesce(s.default_probability, 40) INTO v_prob
    FROM public.crm_pipeline_stages s
    WHERE s.id = v_stage;
  EXCEPTION
    WHEN undefined_column THEN v_prob := 40;
  END;

  v_name := public._opportunity_name_for_inquiry(
    v_inquiry.product_name,
    CASE WHEN v_has_contact THEN v_contact.name ELSE NULL END,
    coalesce(v_lead.name, 'Mobile Inquiry')
  );

  IF v_has_contact THEN
    SELECT o.id
    INTO v_opp_id
    FROM public.crm_opportunities o
    WHERE o.contact_id = v_contact.id
      AND o.lead_inquiry_id IS NULL
      AND lower(coalesce(o.source, '')) IN ('mobile_app', 'mobile_inquiry', 'contact_auto')
    ORDER BY
      CASE WHEN lower(coalesce(o.source, '')) = 'mobile_app' THEN 0 ELSE 1 END,
      o.created_at ASC NULLS LAST,
      o.id ASC
    LIMIT 1;
  END IF;

  IF v_opp_id IS NOT NULL THEN
    UPDATE public.crm_opportunities
    SET
      name = v_name,
      stage_id = v_stage,
      probability = v_prob,
      lead_inquiry_id = p_inquiry_id,
      salesperson_id = coalesce(
        salesperson_id,
        v_lead.sales_agent_id,
        CASE WHEN v_has_contact THEN v_contact.salesperson_id ELSE NULL END
      ),
      organization_id = coalesce(organization_id, v_org),
      email = coalesce(email, CASE WHEN v_has_contact THEN v_contact.email ELSE NULL END),
      phone = coalesce(phone, CASE WHEN v_has_contact THEN v_contact.phone ELSE NULL END, v_lead.number),
      mobile = coalesce(
        mobile,
        CASE WHEN v_has_contact THEN v_contact.mobile ELSE NULL END,
        CASE WHEN v_has_contact THEN v_contact.phone ELSE NULL END,
        v_lead.number
      ),
      updated_at = now()
    WHERE id = v_opp_id;
  ELSE
    BEGIN
      INSERT INTO public.crm_opportunities (
        organization_id,
        stage_id,
        name,
        contact_id,
        expected_revenue,
        probability,
        priority,
        salesperson_id,
        source,
        email,
        phone,
        mobile,
        created_by,
        lead_inquiry_id,
        updated_at
      ) VALUES (
        v_org,
        v_stage,
        v_name,
        CASE WHEN v_has_contact THEN v_contact.id ELSE NULL END,
        0,
        v_prob,
        0,
        coalesce(
          v_lead.sales_agent_id,
          CASE WHEN v_has_contact THEN v_contact.salesperson_id ELSE NULL END
        ),
        'mobile_inquiry',
        CASE WHEN v_has_contact THEN nullif(btrim(coalesce(v_contact.email, '')), '') ELSE NULL END,
        nullif(btrim(coalesce(
          CASE WHEN v_has_contact THEN v_contact.phone ELSE NULL END,
          v_lead.number,
          ''
        )), ''),
        nullif(btrim(coalesce(
          CASE WHEN v_has_contact THEN v_contact.mobile ELSE NULL END,
          CASE WHEN v_has_contact THEN v_contact.phone ELSE NULL END,
          v_lead.number,
          ''
        )), ''),
        coalesce(
          CASE WHEN v_has_contact THEN nullif(btrim(coalesce(v_contact.created_by, '')), '') ELSE NULL END,
          'customer_app'
        ),
        p_inquiry_id,
        now()
      )
      RETURNING id INTO v_opp_id;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT o.id INTO v_opp_id
        FROM public.crm_opportunities o
        WHERE o.lead_inquiry_id = p_inquiry_id
        LIMIT 1;
      WHEN others THEN
        RAISE WARNING 'mobile inquiry opportunity create failed for inquiry %: %', p_inquiry_id, SQLERRM;
        RETURN NULL;
    END;
  END IF;

  IF v_opp_id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE public.lead_inquiries
  SET crm_opportunity_id = v_opp_id, updated_at = now()
  WHERE id = p_inquiry_id
    AND crm_opportunity_id IS DISTINCT FROM v_opp_id;

  BEGIN
    UPDATE public.leads
    SET
      crm_opportunity_id = coalesce(crm_opportunity_id, v_opp_id),
      contact_id = coalesce(contact_id, CASE WHEN v_has_contact THEN v_contact.id ELSE NULL END),
      updated_at = now()
    WHERE id = v_lead.id;
  EXCEPTION
    WHEN undefined_column THEN
      UPDATE public.leads
      SET crm_opportunity_id = coalesce(crm_opportunity_id, v_opp_id)
      WHERE id = v_lead.id;
    WHEN others THEN NULL;
  END;

  RETURN v_opp_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_lead_inquiries_mobile_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only submitted inquiries. Drafts (customer_app created_by) must not qualify.
  IF NEW.customer_submitted IS TRUE
     AND lower(coalesce(NEW.status, '')) IS DISTINCT FROM 'draft' THEN
    IF TG_OP = 'UPDATE'
       AND coalesce(OLD.customer_submitted, false) IS TRUE
       AND NEW.customer_submitted IS TRUE
       AND NEW.crm_opportunity_id IS NOT NULL THEN
      RETURN NEW;
    END IF;
    BEGIN
      PERFORM public._ensure_crm_opportunity_for_mobile_inquiry(NEW.id);
    EXCEPTION
      WHEN others THEN
        RAISE WARNING 'trg_lead_inquiries_mobile_opportunity failed for %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

-- Notify trigger already requires customer_submitted; keep it that way.
CREATE OR REPLACE FUNCTION public.notify_inquiry_received_from_mobile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_username text;
  v_lead_number text;
  v_customer_name text;
  v_source text;
  v_summary text;
  v_href text;
  v_opportunity_id uuid;
BEGIN
  IF NEW.customer_submitted IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.status, '')) = 'draft' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND coalesce(OLD.customer_submitted, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT
      sa.username,
      l.lead_id_formatted,
      l.name,
      l.source
    INTO
      v_agent_username,
      v_lead_number,
      v_customer_name,
      v_source
    FROM public.leads l
    LEFT JOIN public.sales_agents sa ON sa.id = l.sales_agent_id
    WHERE l.id = NEW.lead_id;

    IF v_agent_username IS NULL OR btrim(v_agent_username) = '' THEN
      RETURN NEW;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.inquiry_lifecycle_notifications n
      WHERE n.inquiry_id = NEW.id
        AND n.event_type IN ('inquiry_received', 'customer_submitted')
        AND n.recipient_username = v_agent_username
    ) THEN
      RETURN NEW;
    END IF;

    v_opportunity_id := NEW.crm_opportunity_id;

    IF v_opportunity_id IS NULL THEN
      BEGIN
        SELECT o.id
        INTO v_opportunity_id
        FROM public.crm_opportunities o
        WHERE o.lead_inquiry_id = NEW.id
        ORDER BY o.created_at DESC NULLS LAST
        LIMIT 1;
      EXCEPTION
        WHEN undefined_column THEN
          v_opportunity_id := NULL;
        WHEN undefined_table THEN
          v_opportunity_id := NULL;
      END;
    END IF;

    IF v_opportunity_id IS NULL THEN
      BEGIN
        SELECT i.crm_opportunity_id
        INTO v_opportunity_id
        FROM public.lead_inquiries i
        WHERE i.id = NEW.id;
      EXCEPTION
        WHEN undefined_column THEN
          v_opportunity_id := NULL;
      END;
    END IF;

    v_summary := coalesce(
      nullif(btrim(coalesce(NEW.product_name, '')), ''),
      nullif(btrim(coalesce(NEW.description, '')), ''),
      'Inquiry'
    );

    IF v_opportunity_id IS NOT NULL THEN
      v_href :=
        '/crm/opportunities/'
        || v_opportunity_id::text
        || '/inquiry?tab=view&inquiryId='
        || NEW.id::text;
    ELSE
      v_href :=
        '/sales-agent/leads/'
        || NEW.lead_id::text
        || '?tab=view&inquiryId='
        || NEW.id::text;
    END IF;

    INSERT INTO public.inquiry_lifecycle_notifications (
      lead_id,
      inquiry_id,
      confirmation_id,
      sender_role,
      sender_username,
      recipient_role,
      recipient_username,
      event_type,
      title,
      message,
      href,
      payload
    ) VALUES (
      NEW.lead_id,
      NEW.id,
      NULL,
      'system',
      'mobile',
      'sales_agent',
      v_agent_username,
      'inquiry_received',
      'New Inquiry Received',
      'A new inquiry has been received from the mobile application.',
      v_href,
      jsonb_build_object(
        'leadId', NEW.lead_id,
        'inquiryId', NEW.id,
        'opportunityId', v_opportunity_id,
        'inquiryNumber', coalesce(v_lead_number, ''),
        'customerName', coalesce(v_customer_name, ''),
        'source', coalesce(nullif(btrim(coalesce(v_source, '')), ''), 'mobile'),
        'summary', v_summary,
        'origin', 'mobile'
      )
    );
  EXCEPTION
    WHEN undefined_column THEN
      BEGIN
        INSERT INTO public.inquiry_lifecycle_notifications (
          lead_id,
          inquiry_id,
          confirmation_id,
          sender_role,
          sender_username,
          recipient_role,
          recipient_username,
          event_type,
          message
        ) VALUES (
          NEW.lead_id,
          NEW.id,
          NULL,
          'system',
          'mobile',
          'sales_agent',
          v_agent_username,
          'inquiry_received',
          'A new inquiry has been received from the mobile application.'
        );
      EXCEPTION
        WHEN others THEN
          NULL;
      END;
    WHEN others THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Portal: include the customer's drafts (plus existing submitted inquiries)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._customer_portal_for_user_phone(p_user_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF public.normalize_phone_digits(p_user_phone) IS NULL
     OR length(public.normalize_phone_digits(p_user_phone)) < 7 THEN
    RETURN jsonb_build_object('leads', '[]'::jsonb, 'inquiries', '[]'::jsonb);
  END IF;

  WITH matched_leads AS (
    SELECT DISTINCT
      l.id,
      l.name,
      l.lead_id_formatted,
      l.status,
      l.created_at
    FROM public.leads l
    WHERE public.phones_match(l.number, p_user_phone)

    UNION

    SELECT DISTINCT
      l.id,
      l.name,
      l.lead_id_formatted,
      l.status,
      l.created_at
    FROM public.customers c
    JOIN public.leads l ON l.id = c.lead_id
    WHERE c.lead_id IS NOT NULL
      AND public.phones_match(c.phone_number, p_user_phone)

    UNION

    SELECT DISTINCT
      l.id,
      l.name,
      l.lead_id_formatted,
      l.status,
      l.created_at
    FROM public.contacts ct
    JOIN public.leads l ON l.contact_id = ct.id
    WHERE public.phones_match(ct.phone, p_user_phone)
       OR public.phones_match(ct.mobile, p_user_phone)
  ),
  matched_inquiries AS (
    SELECT
      li.id,
      li.lead_id,
      ml.lead_id_formatted,
      li.product_name,
      li.description,
      li.quantity,
      li.total_weight,
      li.cbm,
      li.link_url,
      li.image_url,
      coalesce(li.additional_image_urls, '[]'::jsonb) AS additional_image_urls,
      li.status,
      li.created_at,
      li.sent_at,
      li.updated_at,
      li.version_number,
      li.customer_submitted,
      li.approval_status,
      li.sent_to_accounting,
      li.draft_step,
      coalesce(li.draft_attachments, '[]'::jsonb) AS draft_attachments,
      cq.quotation_id,
      cq.quotation_number,
      cq.quote_total,
      cq.quote_sent_at
    FROM public.lead_inquiries li
    JOIN matched_leads ml ON ml.id = li.lead_id
    LEFT JOIN LATERAL (
      SELECT
        q.id AS quotation_id,
        q.quotation_number,
        q.total_amount AS quote_total,
        q.sent_to_customer_at AS quote_sent_at
      FROM public.quotations q
      WHERE q.linked_inquiry_id = li.id
        AND q.sent_to_customer_at IS NOT NULL
        AND nullif(trim(coalesce(q.customer_pdf_url, '')), '') IS NOT NULL
      ORDER BY q.sent_to_customer_at DESC NULLS LAST
      LIMIT 1
    ) cq ON true
    WHERE li.sent_to_accounting = true
       OR li.customer_submitted = true
       OR (
         lower(coalesce(li.status, '')) = 'draft'
         AND coalesce(li.customer_submitted, false) IS NOT TRUE
       )
    ORDER BY li.updated_at DESC NULLS LAST, li.created_at DESC
  )
  SELECT jsonb_build_object(
    'leads',
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', ml.id,
            'name', ml.name,
            'lead_number', ml.lead_id_formatted,
            'status', ml.status,
            'created_at', ml.created_at
          )
          ORDER BY ml.created_at DESC
        )
        FROM matched_leads ml
      ),
      '[]'::jsonb
    ),
    'inquiries',
    coalesce(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'id', mi.id,
            'lead_id', mi.lead_id,
            'lead_number', mi.lead_id_formatted,
            'inquiry_number',
              coalesce(
                nullif(mi.version_number::text, ''),
                upper(left(replace(mi.id::text, '-', ''), 8))
              ),
            'product_name', nullif(trim(mi.product_name), ''),
            'description', nullif(trim(mi.description), ''),
            'quantity', nullif(trim(mi.quantity), ''),
            'total_weight', nullif(trim(mi.total_weight), ''),
            'cbm', nullif(trim(mi.cbm), ''),
            'link_url', nullif(trim(mi.link_url), ''),
            'image_url', nullif(trim(mi.image_url), ''),
            'additional_image_urls', mi.additional_image_urls,
            'status', mi.status,
            'created_at', mi.created_at,
            'sent_at', mi.sent_at,
            'updated_at', mi.updated_at,
            'customer_submitted', mi.customer_submitted,
            'approval_status', mi.approval_status,
            'sent_to_accounting', mi.sent_to_accounting,
            'is_draft',
              lower(coalesce(mi.status, '')) = 'draft'
              AND coalesce(mi.customer_submitted, false) IS NOT TRUE,
            'draft_step', coalesce(mi.draft_step, 0),
            'draft_attachments', mi.draft_attachments,
            'has_quote', mi.quotation_id IS NOT NULL,
            'quote_total', mi.quote_total,
            'quote_number', mi.quotation_number,
            'quote_sent_at', mi.quote_sent_at,
            'shipping_mark', NULL,
            'origin', NULL,
            'destination', NULL
          )
          ORDER BY mi.updated_at DESC NULLS LAST, mi.created_at DESC
        )
        FROM matched_inquiries mi
      ),
      '[]'::jsonb
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;
