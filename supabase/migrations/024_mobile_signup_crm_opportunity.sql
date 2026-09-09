-- 024 — Auto-create CRM Opportunity for genuinely new mobile customers
-- Prerequisites: 021 (mobile signup creates contacts with source='mobile_app'),
--                crm_opportunities + crm_pipeline_stages
--
-- Rules:
--   * Only on NEW contact insert with source = 'mobile_app' (register_user new-phone path)
--   * Existing phone / contact update path does NOT fire this
--   * Login does NOT create opportunities
--   * At most one mobile_app opportunity per contact (unique index)
--   * Soft-fails: never blocks customer signup

-- Duplicate guard (parallel to contact_auto unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunities_one_mobile_app_per_contact
  ON public.crm_opportunities (organization_id, contact_id)
  WHERE source = 'mobile_app'
    AND contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_mobile_app_contact
  ON public.crm_opportunities (contact_id)
  WHERE source = 'mobile_app'
    AND contact_id IS NOT NULL;

-- Ensure org has at least a "New" pipeline stage (idempotent subset of default stages)
CREATE OR REPLACE FUNCTION public._ensure_crm_new_stage_for_org(p_org_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_id uuid;
BEGIN
  IF p_org_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT s.id
  INTO v_stage_id
  FROM public.crm_pipeline_stages s
  WHERE s.organization_id = p_org_id
    AND lower(btrim(s.name)) = 'new'
  ORDER BY s.sequence ASC NULLS LAST, s.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_stage_id IS NOT NULL THEN
    RETURN v_stage_id;
  END IF;

  -- Any stage as fallback
  SELECT s.id
  INTO v_stage_id
  FROM public.crm_pipeline_stages s
  WHERE s.organization_id = p_org_id
    AND coalesce(s.is_lost, false) = false
  ORDER BY s.sequence ASC NULLS LAST, s.created_at ASC NULLS LAST
  LIMIT 1;

  IF v_stage_id IS NOT NULL THEN
    RETURN v_stage_id;
  END IF;

  -- Seed minimal default boards for this org
  INSERT INTO public.crm_pipeline_stages (
    organization_id, name, sequence, is_won, is_lost, is_folded, updated_at
  )
  SELECT
    p_org_id,
    d.name,
    d.sequence,
    d.is_won,
    d.is_lost,
    false,
    now()
  FROM (
    VALUES
      ('New', 10, false, false),
      ('Qualified', 20, false, false),
      ('Proposition', 30, false, false),
      ('Won', 40, true, false),
      ('Lost', 50, false, true)
  ) AS d(name, sequence, is_won, is_lost)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.crm_pipeline_stages s
    WHERE s.organization_id = p_org_id
      AND lower(s.name) = lower(d.name)
  );

  SELECT s.id
  INTO v_stage_id
  FROM public.crm_pipeline_stages s
  WHERE s.organization_id = p_org_id
    AND lower(btrim(s.name)) = 'new'
  ORDER BY s.sequence ASC NULLS LAST
  LIMIT 1;

  RETURN v_stage_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._ensure_mobile_app_crm_opportunity(
  p_contact_id uuid,
  p_organization_id uuid,
  p_salesperson_id uuid,
  p_contact_name text,
  p_email text,
  p_phone text,
  p_created_by text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_opp_id uuid;
  v_stage_id uuid;
  v_name text;
  v_prob int := 10;
BEGIN
  IF p_contact_id IS NULL OR p_organization_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotent: already created for this contact
  SELECT o.id
  INTO v_opp_id
  FROM public.crm_opportunities o
  WHERE o.organization_id = p_organization_id
    AND o.contact_id = p_contact_id
    AND o.source = 'mobile_app'
  LIMIT 1;

  IF v_opp_id IS NOT NULL THEN
    RETURN v_opp_id;
  END IF;

  v_stage_id := public._ensure_crm_new_stage_for_org(p_organization_id);
  IF v_stage_id IS NULL THEN
    RETURN NULL;
  END IF;

  BEGIN
    SELECT coalesce(s.default_probability, 10)
    INTO v_prob
    FROM public.crm_pipeline_stages s
    WHERE s.id = v_stage_id;
  EXCEPTION
    WHEN undefined_column THEN
      v_prob := 10;
  END;

  v_name := nullif(btrim(coalesce(p_contact_name, '')), '');
  IF v_name IS NULL THEN
    v_name := 'Mobile App Customer';
  END IF;
  v_name := v_name || '''s Opportunity';

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
      updated_at
    ) VALUES (
      p_organization_id,
      v_stage_id,
      v_name,
      p_contact_id,
      0,
      v_prob,
      0,
      p_salesperson_id,
      'mobile_app',
      nullif(btrim(coalesce(p_email, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      nullif(btrim(coalesce(p_phone, '')), ''),
      coalesce(nullif(btrim(coalesce(p_created_by, '')), ''), 'mobile_register'),
      now()
    )
    RETURNING id INTO v_opp_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT o.id
      INTO v_opp_id
      FROM public.crm_opportunities o
      WHERE o.organization_id = p_organization_id
        AND o.contact_id = p_contact_id
        AND o.source = 'mobile_app'
      LIMIT 1;
    WHEN undefined_table THEN
      RETURN NULL;
    WHEN others THEN
      -- Soft-fail: signup must succeed even if CRM insert fails
      RAISE WARNING 'mobile_app opportunity create failed for contact %: %', p_contact_id, SQLERRM;
      RETURN NULL;
  END;

  RETURN v_opp_id;
END;
$$;

REVOKE ALL ON FUNCTION public._ensure_crm_new_stage_for_org(uuid) FROM public;
REVOKE ALL ON FUNCTION public._ensure_mobile_app_crm_opportunity(uuid, uuid, uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public._ensure_crm_new_stage_for_org(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._ensure_mobile_app_crm_opportunity(uuid, uuid, uuid, text, text, text, text) TO service_role;

-- Fire only when a new mobile_app contact is created (genuinely new mobile customer)
CREATE OR REPLACE FUNCTION public.trg_contacts_create_mobile_app_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     AND lower(coalesce(NEW.source, '')) = 'mobile_app'
     AND NEW.organization_id IS NOT NULL
     AND NEW.salesperson_id IS NOT NULL THEN
    PERFORM public._ensure_mobile_app_crm_opportunity(
      NEW.id,
      NEW.organization_id,
      NEW.salesperson_id,
      NEW.name,
      NEW.email,
      coalesce(NEW.phone, NEW.mobile),
      coalesce(NEW.created_by, 'mobile_register')
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contacts_create_mobile_app_opportunity ON public.contacts;
CREATE TRIGGER trg_contacts_create_mobile_app_opportunity
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_contacts_create_mobile_app_opportunity();

COMMENT ON FUNCTION public._ensure_mobile_app_crm_opportunity(uuid, uuid, uuid, text, text, text, text) IS
  'Creates one CRM opportunity (source=mobile_app) for a new mobile customer contact; idempotent.';
