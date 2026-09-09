-- 029 — Put mobile customer contacts in the assigned Sales Agent's organization
-- Prerequisites: 021 (register_user), 027 (_organization_id_for_sales_agent), 028 (transfer helper)
--
-- Symptom: Support shows the assigned agent, but that agent’s Contacts list does not
-- include the customer. Contacts are filtered by active organization_id; mobile signup
-- previously used the oldest active org instead of the agent’s portal org.

-- Prefer Sales Agent's portal default organization so Contacts/CRM match their switcher.
-- Fallback: most common organization among that agent's existing contacts.
CREATE OR REPLACE FUNCTION public._organization_id_for_sales_agent(p_agent_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_app_user_id uuid;
BEGIN
  IF p_agent_id IS NULL THEN
    RETURN public._default_organization_id_for_mobile();
  END IF;

  SELECT sa.app_user_id INTO v_app_user_id
  FROM public.sales_agents sa
  WHERE sa.id = p_agent_id;

  IF v_app_user_id IS NOT NULL THEN
    BEGIN
      SELECT coalesce(au.default_organization_id, au.default_organization)
      INTO v_org
      FROM public.app_users au
      WHERE au.id = v_app_user_id;
    EXCEPTION
      WHEN undefined_column THEN
        BEGIN
          SELECT au.default_organization INTO v_org
          FROM public.app_users au
          WHERE au.id = v_app_user_id;
        EXCEPTION
          WHEN others THEN
            v_org := NULL;
        END;
    END;

    IF v_org IS NOT NULL THEN
      RETURN v_org;
    END IF;

    BEGIN
      SELECT uo.organization_id INTO v_org
      FROM public.user_organizations uo
      WHERE uo.user_id = v_app_user_id
      ORDER BY uo.created_at ASC NULLS LAST
      LIMIT 1;
      IF v_org IS NOT NULL THEN
        RETURN v_org;
      END IF;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
    END;
  END IF;

  -- Match the org where this agent already has contacts (e.g. ayan sales' list)
  BEGIN
    SELECT c.organization_id
    INTO v_org
    FROM public.contacts c
    WHERE c.salesperson_id = p_agent_id
      AND c.organization_id IS NOT NULL
    GROUP BY c.organization_id
    ORDER BY count(*) DESC, max(c.updated_at) DESC NULLS LAST
    LIMIT 1;
    IF v_org IS NOT NULL THEN
      RETURN v_org;
    END IF;
  EXCEPTION
    WHEN others THEN
      v_org := NULL;
  END;

  RETURN public._default_organization_id_for_mobile();
END;
$$;

REVOKE ALL ON FUNCTION public._organization_id_for_sales_agent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._organization_id_for_sales_agent(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Repair: sync existing mobile contacts (+ their opportunities) to the agent org
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.repair_mobile_contact_organization_for_agents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_org uuid;
  v_stage uuid;
  v_contacts int := 0;
  v_opps int := 0;
  v_moved int := 0;
BEGIN
  FOR v_row IN
    SELECT c.id, c.salesperson_id, c.organization_id
    FROM public.contacts c
    WHERE c.salesperson_id IS NOT NULL
      AND (
        lower(coalesce(c.source, '')) = 'mobile_app'
        OR c.mobile_registered_at IS NOT NULL
        OR c.mobile_user_id IS NOT NULL
      )
  LOOP
    v_org := public._organization_id_for_sales_agent(v_row.salesperson_id);
    IF v_org IS NULL THEN
      CONTINUE;
    END IF;

    IF v_row.organization_id IS DISTINCT FROM v_org THEN
      UPDATE public.contacts
      SET organization_id = v_org, updated_at = now()
      WHERE id = v_row.id;
      v_contacts := v_contacts + 1;
    END IF;

    BEGIN
      v_stage := public._ensure_crm_new_stage_for_org(v_org);
      UPDATE public.crm_opportunities o
      SET
        organization_id = v_org,
        stage_id = coalesce(v_stage, o.stage_id),
        salesperson_id = coalesce(o.salesperson_id, v_row.salesperson_id),
        updated_at = now()
      WHERE o.contact_id = v_row.id
        AND (
          o.organization_id IS DISTINCT FROM v_org
          OR o.salesperson_id IS DISTINCT FROM v_row.salesperson_id
          OR o.salesperson_id IS NULL
        )
        AND (
          o.salesperson_id IS NULL
          OR o.salesperson_id IS NOT DISTINCT FROM v_row.salesperson_id
          OR lower(coalesce(o.source, '')) IN ('mobile_app', 'contact_auto')
        );
      GET DIAGNOSTICS v_moved = ROW_COUNT;
      v_opps := v_opps + coalesce(v_moved, 0);
    EXCEPTION
      WHEN undefined_table THEN NULL;
      WHEN undefined_function THEN NULL;
      WHEN others THEN NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'contacts_org_updated', v_contacts,
    'opportunities_synced', v_opps
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- register_user: assign contact to the Sales Agent's organization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.register_user(
  p_phone text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.users%rowtype;
  v_phone text;
  v_contact public.contacts%rowtype;
  v_agent_id uuid;
  v_agent_username text;
  v_org_id uuid;
  v_display_name text;
  v_lead_id text;
  v_created_contact boolean := false;
  v_assigned_now boolean := false;
BEGIN
  v_phone := trim(coalesce(p_phone, ''));

  IF length(v_phone) < 7
     OR public.normalize_phone_digits(v_phone) IS NULL
     OR length(public.normalize_phone_digits(v_phone)) < 7 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  IF length(coalesce(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'weak_password';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE public.phones_match(u.phone, v_phone)
  ) THEN
    RAISE EXCEPTION 'duplicate_phone';
  END IF;

  BEGIN
    INSERT INTO public.users (phone, email, first_name, last_name, password_hash)
    VALUES (
      v_phone,
      lower(trim(p_email)),
      trim(p_first_name),
      trim(p_last_name),
      extensions.crypt(p_password, extensions.gen_salt('bf'::text))
    )
    RETURNING * INTO v_user;
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%users_phone_key%' OR SQLERRM ILIKE '%phone%' THEN
        RAISE EXCEPTION 'duplicate_phone';
      ELSIF SQLERRM ILIKE '%users_email_key%' OR SQLERRM ILIKE '%email%' THEN
        RAISE EXCEPTION 'duplicate_email';
      ELSE
        RAISE EXCEPTION 'duplicate_account';
      END IF;
  END;

  v_display_name := trim(both FROM concat_ws(' ', trim(p_first_name), trim(p_last_name)));
  IF v_display_name = '' THEN
    v_display_name := v_phone;
  END IF;

  PERFORM pg_advisory_xact_lock(872314001);

  SELECT c.*
  INTO v_contact
  FROM public.contacts c
  WHERE public.phones_match(c.phone, v_phone)
     OR public.phones_match(c.mobile, v_phone)
  ORDER BY
    CASE WHEN c.salesperson_id IS NOT NULL THEN 0 ELSE 1 END,
    c.created_at ASC NULLS LAST,
    c.id ASC
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.contacts
    SET
      mobile_registered_at = coalesce(mobile_registered_at, now()),
      mobile_user_id = coalesce(mobile_user_id, v_user.id),
      email = coalesce(nullif(btrim(email), ''), lower(trim(p_email))),
      updated_at = now()
    WHERE id = v_contact.id
    RETURNING * INTO v_contact;

    IF v_contact.salesperson_id IS NULL THEN
      v_agent_id := public._pick_least_loaded_sales_agent();
      IF v_agent_id IS NULL THEN
        RAISE EXCEPTION 'no_active_sales_agent';
      END IF;

      SELECT sa.username INTO v_agent_username
      FROM public.sales_agents sa
      WHERE sa.id = v_agent_id;

      v_org_id := public._organization_id_for_sales_agent(v_agent_id);

      UPDATE public.contacts
      SET
        salesperson_id = v_agent_id,
        created_by = coalesce(nullif(btrim(created_by), ''), v_agent_username),
        organization_id = coalesce(v_org_id, organization_id),
        updated_at = now()
      WHERE id = v_contact.id
      RETURNING * INTO v_contact;

      UPDATE public.sales_agents
      SET last_mobile_auto_assigned_at = now(), updated_at = now()
      WHERE id = v_agent_id;

      PERFORM public._record_contact_sales_assignment(
        v_contact.id,
        v_agent_id,
        NULL,
        'automatic',
        'mobile_register',
        'existing_contact_missing_salesperson'
      );
      v_assigned_now := true;
    ELSE
      -- Keep existing salesperson; ensure org matches so agent Contacts list includes them
      v_org_id := public._organization_id_for_sales_agent(v_contact.salesperson_id);
      IF v_org_id IS NOT NULL AND v_contact.organization_id IS DISTINCT FROM v_org_id THEN
        UPDATE public.contacts
        SET organization_id = v_org_id, updated_at = now()
        WHERE id = v_contact.id
        RETURNING * INTO v_contact;
      END IF;
    END IF;
  ELSE
    v_agent_id := public._pick_least_loaded_sales_agent();
    IF v_agent_id IS NULL THEN
      RAISE EXCEPTION 'no_active_sales_agent';
    END IF;

    SELECT sa.username INTO v_agent_username
    FROM public.sales_agents sa
    WHERE sa.id = v_agent_id;

    -- Prefer the assigned agent's portal organization (not the oldest org)
    v_org_id := coalesce(
      public._organization_id_for_sales_agent(v_agent_id),
      public._default_organization_id_for_mobile()
    );
    v_lead_id := public._allocate_contact_lead_id_safe();

    INSERT INTO public.contacts (
      contact_kind,
      company_type,
      name,
      email,
      phone,
      mobile,
      salesperson_id,
      source,
      mobile_registered_at,
      mobile_user_id,
      organization_id,
      lead_id_formatted,
      created_by,
      customer_rank,
      is_active
    ) VALUES (
      'contact',
      'person',
      v_display_name,
      lower(trim(p_email)),
      v_phone,
      v_phone,
      v_agent_id,
      'mobile_app',
      now(),
      v_user.id,
      v_org_id,
      v_lead_id,
      v_agent_username,
      1,
      true
    )
    RETURNING * INTO v_contact;

    UPDATE public.sales_agents
    SET last_mobile_auto_assigned_at = now(), updated_at = now()
    WHERE id = v_agent_id;

    PERFORM public._record_contact_sales_assignment(
      v_contact.id,
      v_agent_id,
      NULL,
      'automatic',
      'mobile_register',
      'new_mobile_customer'
    );

    v_created_contact := true;
    v_assigned_now := true;
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'phone', v_user.phone,
      'email', v_user.email,
      'first_name', v_user.first_name,
      'last_name', v_user.last_name,
      'created_at', v_user.created_at
    ),
    'contact_id', v_contact.id,
    'salesperson_id', v_contact.salesperson_id,
    'created_contact', v_created_contact,
    'assigned_now', v_assigned_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_user(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_user(text, text, text, text, text)
  TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Transfer helper: always move contact into the new agent's org when known
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._transfer_contact_sales_ownership(
  p_contact_id uuid,
  p_from_agent_id uuid,
  p_to_agent_id uuid,
  p_changed_by text DEFAULT 'system',
  p_reason text DEFAULT 'sales_ownership_transfer'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to_username text;
  v_new_org uuid;
  v_new_stage uuid;
  v_opp record;
  v_opps int := 0;
  v_leads int := 0;
BEGIN
  IF p_contact_id IS NULL OR p_to_agent_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_ids');
  END IF;

  SELECT sa.username INTO v_to_username
  FROM public.sales_agents sa
  WHERE sa.id = p_to_agent_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'target_agent_not_found');
  END IF;

  v_new_org := public._organization_id_for_sales_agent(p_to_agent_id);
  IF v_new_org IS NOT NULL THEN
    v_new_stage := public._ensure_crm_new_stage_for_org(v_new_org);
  END IF;

  UPDATE public.contacts
  SET
    salesperson_id = p_to_agent_id,
    created_by = coalesce(nullif(btrim(coalesce(v_to_username, '')), ''), created_by),
    organization_id = coalesce(v_new_org, organization_id),
    updated_at = now()
  WHERE id = p_contact_id;

  IF p_from_agent_id IS NOT NULL AND p_from_agent_id = p_to_agent_id THEN
    NULL;
  ELSE
    BEGIN
      PERFORM public._record_contact_sales_assignment(
        p_contact_id,
        p_to_agent_id,
        p_from_agent_id,
        CASE
          WHEN p_reason ILIKE '%manual%' OR p_changed_by NOT IN ('sales_agent_deleted', 'orphaned_agent_repair', 'system')
            THEN 'manual'
          ELSE 'automatic'
        END,
        p_changed_by,
        p_reason
      );
    EXCEPTION
      WHEN others THEN NULL;
    END;
  END IF;

  BEGIN
    FOR v_opp IN
      SELECT o.id, o.organization_id, o.salesperson_id, o.source, o.stage_id
      FROM public.crm_opportunities o
      WHERE o.contact_id = p_contact_id
        AND (
          o.salesperson_id IS NULL
          OR o.salesperson_id IS NOT DISTINCT FROM p_from_agent_id
          OR (
            lower(coalesce(o.source, '')) IN ('mobile_app', 'contact_auto')
            AND o.salesperson_id IS DISTINCT FROM p_to_agent_id
          )
        )
    LOOP
      UPDATE public.crm_opportunities
      SET
        organization_id = coalesce(v_new_org, organization_id),
        stage_id = coalesce(v_new_stage, stage_id),
        salesperson_id = p_to_agent_id,
        created_by = coalesce(nullif(btrim(coalesce(v_to_username, '')), ''), created_by),
        updated_at = now()
      WHERE id = v_opp.id;
      v_opps := v_opps + 1;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  BEGIN
    UPDATE public.leads
    SET
      sales_agent_id = p_to_agent_id,
      updated_at = now()
    WHERE contact_id = p_contact_id
      AND (sales_agent_id IS NULL OR sales_agent_id IS NOT DISTINCT FROM p_from_agent_id);
    GET DIAGNOSTICS v_leads = ROW_COUNT;
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN
      BEGIN
        UPDATE public.leads
        SET sales_agent_id = p_to_agent_id
        WHERE contact_id = p_contact_id
          AND (sales_agent_id IS NULL OR sales_agent_id IS NOT DISTINCT FROM p_from_agent_id);
      EXCEPTION
        WHEN others THEN NULL;
      END;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'contact_id', p_contact_id,
    'to_agent_id', p_to_agent_id,
    'organization_id', v_new_org,
    'opportunities_moved', v_opps,
    'leads_moved', v_leads
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repair_mobile_contact_organization_for_agents() FROM public;
GRANT EXECUTE ON FUNCTION public.repair_mobile_contact_organization_for_agents() TO service_role;
REVOKE ALL ON FUNCTION public._transfer_contact_sales_ownership(uuid, uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public._transfer_contact_sales_ownership(uuid, uuid, uuid, text, text) TO service_role;

-- One-shot repair for Hamza / other mobile customers already assigned
SELECT public.repair_mobile_contact_organization_for_agents();
