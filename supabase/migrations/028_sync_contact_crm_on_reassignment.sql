-- 028 — Synchronize Contact + CRM Opportunity ownership on sales-agent reassignment
-- Prerequisites: 025 (reassign on delete), 027 (mobile opportunity helpers)
--
-- Whenever a customer moves to a new Sales Agent:
--   * contacts.salesperson_id + created_by → new agent
--   * crm_opportunities for that contact → new agent (salesperson_id + created_by)
--   * opportunity org/stage remapped to new agent's CRM org "New" board when needed
--   * never creates duplicate contacts or opportunities

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

  -- Contact ownership (Contacts list filter uses salesperson_id / created_by)
  UPDATE public.contacts
  SET
    salesperson_id = p_to_agent_id,
    created_by = coalesce(nullif(btrim(coalesce(v_to_username, '')), ''), created_by),
    organization_id = coalesce(organization_id, v_new_org),
    updated_at = now()
  WHERE id = p_contact_id;

  -- Skip assignment history only when truly unchanged AND opps already on target
  IF p_from_agent_id IS NOT NULL AND p_from_agent_id = p_to_agent_id THEN
    NULL; -- still sync opportunities / leads below (idempotent)
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

  -- Move existing opportunities for this contact onto the new agent.
  -- Prefer New board under the new agent's org. Never insert duplicates.
  BEGIN
    FOR v_opp IN
      SELECT o.id, o.organization_id, o.salesperson_id, o.source, o.stage_id
      FROM public.crm_opportunities o
      WHERE o.contact_id = p_contact_id
        AND (
          -- Owned by previous agent (or unassigned)
          o.salesperson_id IS NULL
          OR o.salesperson_id IS NOT DISTINCT FROM p_from_agent_id
          -- Auto / mobile opportunities must follow the contact owner
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

  -- Leads tied to this contact + old agent
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
    'opportunities_moved', v_opps,
    'leads_moved', v_leads
  );
END;
$$;

-- Replace delete-reassignment to use the shared transfer helper
CREATE OR REPLACE FUNCTION public.reassign_customers_before_sales_agent_delete(
  p_agent_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contact record;
  v_opp record;
  v_lead record;
  v_new_agent uuid;
  v_contacts_reassigned int := 0;
  v_leads_reassigned int := 0;
  v_opps_reassigned int := 0;
  v_pending_contacts int := 0;
  v_pending_leads int := 0;
  v_pending_opps int := 0;
  v_transfer jsonb;
BEGIN
  IF p_agent_id IS NULL THEN
    RAISE EXCEPTION 'invalid_sales_agent_id';
  END IF;

  PERFORM pg_advisory_xact_lock(872314001);

  SELECT count(*)::int INTO v_pending_contacts
  FROM public.contacts c
  WHERE c.salesperson_id = p_agent_id;

  BEGIN
    SELECT count(*)::int INTO v_pending_leads
    FROM public.leads l
    WHERE l.sales_agent_id = p_agent_id;
  EXCEPTION
    WHEN undefined_table THEN v_pending_leads := 0;
  END;

  BEGIN
    SELECT count(*)::int INTO v_pending_opps
    FROM public.crm_opportunities o
    WHERE o.salesperson_id = p_agent_id;
  EXCEPTION
    WHEN undefined_table THEN v_pending_opps := 0;
  END;

  IF v_pending_contacts = 0 AND v_pending_leads = 0 AND v_pending_opps = 0 THEN
    RETURN jsonb_build_object(
      'reassigned_contacts', 0,
      'reassigned_leads', 0,
      'reassigned_opportunities', 0,
      'replacement_required', false
    );
  END IF;

  v_new_agent := public._pick_least_loaded_sales_agent_excluding(p_agent_id);
  IF v_new_agent IS NULL THEN
    RAISE EXCEPTION 'cannot_delete_sales_agent_no_replacement'
      USING MESSAGE = format(
        'Cannot delete this Sales Agent: %s contact(s), %s lead(s), and %s opportunity(ies) are assigned, and no other active Sales Agent is available to receive them.',
        v_pending_contacts, v_pending_leads, v_pending_opps
      );
  END IF;

  FOR v_contact IN
    SELECT c.id, c.mobile_registered_at
    FROM public.contacts c
    WHERE c.salesperson_id = p_agent_id
    ORDER BY c.created_at ASC NULLS LAST, c.id ASC
  LOOP
    v_new_agent := public._pick_least_loaded_sales_agent_excluding(p_agent_id);
    IF v_new_agent IS NULL THEN
      RAISE EXCEPTION 'cannot_delete_sales_agent_no_replacement'
        USING MESSAGE = 'Cannot delete this Sales Agent: no other active Sales Agent is available.';
    END IF;

    v_transfer := public._transfer_contact_sales_ownership(
      v_contact.id,
      p_agent_id,
      v_new_agent,
      'sales_agent_deleted',
      'reassigned_on_agent_delete'
    );

    v_contacts_reassigned := v_contacts_reassigned + 1;
    v_opps_reassigned := v_opps_reassigned + coalesce((v_transfer->>'opportunities_moved')::int, 0);
    v_leads_reassigned := v_leads_reassigned + coalesce((v_transfer->>'leads_moved')::int, 0);

    IF v_contact.mobile_registered_at IS NOT NULL THEN
      UPDATE public.sales_agents
      SET last_mobile_auto_assigned_at = now(), updated_at = now()
      WHERE id = v_new_agent;
    END IF;
  END LOOP;

  -- Opportunities still pointing at deleted agent (no/odd contact link)
  BEGIN
    FOR v_opp IN
      SELECT o.id, o.contact_id
      FROM public.crm_opportunities o
      WHERE o.salesperson_id = p_agent_id
      ORDER BY o.created_at ASC NULLS LAST, o.id ASC
    LOOP
      v_new_agent := public._pick_least_loaded_sales_agent_excluding(p_agent_id);
      IF v_new_agent IS NULL THEN
        RAISE EXCEPTION 'cannot_delete_sales_agent_no_replacement'
          USING MESSAGE = 'Cannot delete this Sales Agent: no other active Sales Agent is available.';
      END IF;

      IF v_opp.contact_id IS NOT NULL THEN
        PERFORM public._transfer_contact_sales_ownership(
          v_opp.contact_id,
          p_agent_id,
          v_new_agent,
          'sales_agent_deleted',
          'reassigned_opp_on_agent_delete'
        );
      ELSE
        UPDATE public.crm_opportunities o
        SET
          salesperson_id = v_new_agent,
          created_by = coalesce(
            (SELECT nullif(btrim(sa.username), '') FROM public.sales_agents sa WHERE sa.id = v_new_agent),
            o.created_by
          ),
          updated_at = now()
        WHERE o.id = v_opp.id;
      END IF;
      v_opps_reassigned := v_opps_reassigned + 1;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  -- Remaining leads on this agent
  BEGIN
    FOR v_lead IN
      SELECT l.id
      FROM public.leads l
      WHERE l.sales_agent_id = p_agent_id
      ORDER BY l.created_at ASC NULLS LAST, l.id ASC
    LOOP
      v_new_agent := public._pick_least_loaded_sales_agent_excluding(p_agent_id);
      IF v_new_agent IS NULL THEN
        RAISE EXCEPTION 'cannot_delete_sales_agent_no_replacement'
          USING MESSAGE = 'Cannot delete this Sales Agent: no other active Sales Agent is available.';
      END IF;

      BEGIN
        UPDATE public.leads
        SET sales_agent_id = v_new_agent, updated_at = now()
        WHERE id = v_lead.id;
      EXCEPTION
        WHEN undefined_column THEN
          UPDATE public.leads SET sales_agent_id = v_new_agent WHERE id = v_lead.id;
      END;
      v_leads_reassigned := v_leads_reassigned + 1;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'reassigned_contacts', v_contacts_reassigned,
    'reassigned_leads', v_leads_reassigned,
    'reassigned_opportunities', v_opps_reassigned,
    'replacement_required', true
  );
END;
$$;

-- Admin / app RPC for manual reassignment (Application Users, etc.)
CREATE OR REPLACE FUNCTION public.transfer_contact_to_sales_agent(
  p_contact_id uuid,
  p_to_agent_id uuid,
  p_changed_by text DEFAULT 'admin'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from uuid;
BEGIN
  SELECT c.salesperson_id INTO v_from
  FROM public.contacts c
  WHERE c.id = p_contact_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'contact_not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(872314001);

  RETURN public._transfer_contact_sales_ownership(
    p_contact_id,
    v_from,
    p_to_agent_id,
    coalesce(nullif(btrim(p_changed_by), ''), 'admin'),
    'manual_admin_reassignment'
  );
END;
$$;

REVOKE ALL ON FUNCTION public._transfer_contact_sales_ownership(uuid, uuid, uuid, text, text) FROM public;
REVOKE ALL ON FUNCTION public.transfer_contact_to_sales_agent(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public._transfer_contact_sales_ownership(uuid, uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.transfer_contact_to_sales_agent(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reassign_customers_before_sales_agent_delete(uuid) TO service_role;
