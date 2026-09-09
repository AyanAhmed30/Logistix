-- 025 — Reassign customers when a Sales Agent is deleted
-- Prerequisites: 021 (_pick_least_loaded_sales_agent, contact_sales_assignments)
--
-- Before a sales_agents row is removed:
--   * Reassign contacts.salesperson_id to another active agent (least-loaded)
--   * Reassign crm_opportunities.salesperson_id and leads.sales_agent_id
--   * If any assigned records exist and no replacement agent → block delete
-- Prevents ON DELETE SET NULL (contacts) / CASCADE (leads) from orphaning or wiping data.

CREATE OR REPLACE FUNCTION public._pick_least_loaded_sales_agent_excluding(
  p_exclude_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  SELECT sa.id
  INTO v_agent_id
  FROM public.sales_agents sa
  WHERE coalesce(sa.is_active, true) = true
    AND nullif(btrim(coalesce(sa.username, '')), '') IS NOT NULL
    AND (p_exclude_id IS NULL OR sa.id IS DISTINCT FROM p_exclude_id)
  ORDER BY (
    SELECT count(*)::bigint
    FROM public.contacts c
    WHERE c.salesperson_id = sa.id
      AND c.mobile_registered_at IS NOT NULL
      AND coalesce(c.is_active, true) = true
  ) ASC,
  sa.last_mobile_auto_assigned_at ASC NULLS FIRST,
  sa.id ASC
  LIMIT 1;

  RETURN v_agent_id;
END;
$$;

-- Keep original helper as a thin wrapper
CREATE OR REPLACE FUNCTION public._pick_least_loaded_sales_agent()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public._pick_least_loaded_sales_agent_excluding(NULL);
END;
$$;

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
  v_lead record;
  v_opp record;
  v_new_agent uuid;
  v_new_username text;
  v_contacts_reassigned int := 0;
  v_leads_reassigned int := 0;
  v_opps_reassigned int := 0;
  v_pending_contacts int := 0;
  v_pending_leads int := 0;
  v_pending_opps int := 0;
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
    WHEN undefined_table THEN
      v_pending_leads := 0;
  END;

  BEGIN
    SELECT count(*)::int INTO v_pending_opps
    FROM public.crm_opportunities o
    WHERE o.salesperson_id = p_agent_id;
  EXCEPTION
    WHEN undefined_table THEN
      v_pending_opps := 0;
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

  -- Reassign contacts one-by-one so load balancing stays fair across remaining agents
  FOR v_contact IN
    SELECT c.id, c.created_by, c.mobile_registered_at
    FROM public.contacts c
    WHERE c.salesperson_id = p_agent_id
    ORDER BY c.created_at ASC NULLS LAST, c.id ASC
  LOOP
    v_new_agent := public._pick_least_loaded_sales_agent_excluding(p_agent_id);
    IF v_new_agent IS NULL THEN
      RAISE EXCEPTION 'cannot_delete_sales_agent_no_replacement'
        USING MESSAGE = 'Cannot delete this Sales Agent: no other active Sales Agent is available.';
    END IF;

    SELECT sa.username INTO v_new_username
    FROM public.sales_agents sa
    WHERE sa.id = v_new_agent;

    UPDATE public.contacts
    SET
      salesperson_id = v_new_agent,
      created_by = coalesce(nullif(btrim(coalesce(v_new_username, '')), ''), created_by),
      updated_at = now()
    WHERE id = v_contact.id;

    BEGIN
      PERFORM public._record_contact_sales_assignment(
        v_contact.id,
        v_new_agent,
        p_agent_id,
        'automatic',
        'sales_agent_deleted',
        'reassigned_on_agent_delete'
      );
    EXCEPTION
      WHEN undefined_function THEN
        NULL;
      WHEN undefined_table THEN
        NULL;
    END;

    BEGIN
      UPDATE public.crm_opportunities
      SET salesperson_id = v_new_agent, updated_at = now()
      WHERE contact_id = v_contact.id
        AND salesperson_id IS NOT DISTINCT FROM p_agent_id;
    EXCEPTION
      WHEN undefined_table THEN
        NULL;
    END;

    IF v_contact.mobile_registered_at IS NOT NULL THEN
      UPDATE public.sales_agents
      SET last_mobile_auto_assigned_at = now(), updated_at = now()
      WHERE id = v_new_agent;
    END IF;

    v_contacts_reassigned := v_contacts_reassigned + 1;
  END LOOP;

  -- Any remaining opportunities still pointing at the deleted agent
  BEGIN
    FOR v_opp IN
      SELECT o.id
      FROM public.crm_opportunities o
      WHERE o.salesperson_id = p_agent_id
      ORDER BY o.created_at ASC NULLS LAST, o.id ASC
    LOOP
      v_new_agent := public._pick_least_loaded_sales_agent_excluding(p_agent_id);
      IF v_new_agent IS NULL THEN
        RAISE EXCEPTION 'cannot_delete_sales_agent_no_replacement'
          USING MESSAGE = 'Cannot delete this Sales Agent: no other active Sales Agent is available.';
      END IF;

      UPDATE public.crm_opportunities
      SET salesperson_id = v_new_agent, updated_at = now()
      WHERE id = v_opp.id;

      v_opps_reassigned := v_opps_reassigned + 1;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
  END;

  -- Leads must be moved before delete (FK ON DELETE CASCADE would wipe them)
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

      UPDATE public.leads
      SET
        sales_agent_id = v_new_agent,
        updated_at = now()
      WHERE id = v_lead.id;

      v_leads_reassigned := v_leads_reassigned + 1;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
    WHEN undefined_column THEN
      -- older schemas without updated_at on leads
      BEGIN
        UPDATE public.leads
        SET sales_agent_id = public._pick_least_loaded_sales_agent_excluding(p_agent_id)
        WHERE sales_agent_id = p_agent_id
          AND public._pick_least_loaded_sales_agent_excluding(p_agent_id) IS NOT NULL;
      EXCEPTION
        WHEN others THEN
          RAISE;
      END;
  END;

  RETURN jsonb_build_object(
    'reassigned_contacts', v_contacts_reassigned,
    'reassigned_leads', v_leads_reassigned,
    'reassigned_opportunities', v_opps_reassigned,
    'replacement_required', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sales_agents_reassign_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.reassign_customers_before_sales_agent_delete(OLD.id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_agents_reassign_before_delete ON public.sales_agents;
CREATE TRIGGER trg_sales_agents_reassign_before_delete
  BEFORE DELETE ON public.sales_agents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sales_agents_reassign_before_delete();

REVOKE ALL ON FUNCTION public._pick_least_loaded_sales_agent_excluding(uuid) FROM public;
REVOKE ALL ON FUNCTION public.reassign_customers_before_sales_agent_delete(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public._pick_least_loaded_sales_agent_excluding(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reassign_customers_before_sales_agent_delete(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._pick_least_loaded_sales_agent() TO service_role;

COMMENT ON FUNCTION public.reassign_customers_before_sales_agent_delete(uuid) IS
  'Reassigns contacts/leads/opportunities off a Sales Agent before delete using least-loaded balancing among remaining agents.';
