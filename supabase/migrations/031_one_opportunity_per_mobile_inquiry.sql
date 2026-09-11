  -- 031 — One CRM Opportunity per mobile inquiry, auto-Qualified
  -- Prerequisites: 024/027 (mobile signup opportunity), 016/018 (submit_customer_inquiry),
  --                crm_inquiry_opportunity_link.sql (lead_inquiries.crm_opportunity_id)
  --
  -- Signup still creates one placeholder opportunity on the New board (source=mobile_app).
  -- Each customer-submitted inquiry then gets its own opportunity on Qualified:
  --   * first inquiry reuses/moves the New placeholder
  --   * later inquiries insert additional Qualified cards (source=mobile_inquiry)
  -- Never groups multiple inquiries under one opportunity.

  ALTER TABLE public.crm_opportunities
    ADD COLUMN IF NOT EXISTS lead_inquiry_id uuid;

  DO $$
  BEGIN
    ALTER TABLE public.crm_opportunities
      ADD CONSTRAINT crm_opportunities_lead_inquiry_id_fkey
      FOREIGN KEY (lead_inquiry_id)
      REFERENCES public.lead_inquiries(id)
      ON DELETE SET NULL;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table THEN NULL;
  END $$;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunities_one_inquiry
    ON public.crm_opportunities (lead_inquiry_id)
    WHERE lead_inquiry_id IS NOT NULL;

  CREATE INDEX IF NOT EXISTS idx_crm_opportunities_mobile_inquiry_contact
    ON public.crm_opportunities (contact_id)
    WHERE source = 'mobile_inquiry'
      AND contact_id IS NOT NULL;

  -- Qualified stage helper (mirrors _ensure_crm_new_stage_for_org)
  CREATE OR REPLACE FUNCTION public._ensure_crm_qualified_stage_for_org(p_org_id uuid)
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

    PERFORM public._ensure_crm_new_stage_for_org(p_org_id);

    SELECT s.id
    INTO v_stage_id
    FROM public.crm_pipeline_stages s
    WHERE s.organization_id = p_org_id
      AND lower(btrim(s.name)) = 'qualified'
    ORDER BY s.sequence ASC NULLS LAST, s.created_at ASC NULLS LAST
    LIMIT 1;

    RETURN v_stage_id;
  END;
  $$;

  CREATE OR REPLACE FUNCTION public._opportunity_name_for_inquiry(
    p_product_name text,
    p_contact_name text,
    p_fallback text DEFAULT 'Mobile Inquiry'
  )
  RETURNS text
  LANGUAGE plpgsql
  IMMUTABLE
  AS $$
  DECLARE
    v_name text;
  BEGIN
    v_name := nullif(btrim(coalesce(p_product_name, '')), '');
    IF v_name IS NULL THEN
      v_name := nullif(btrim(coalesce(p_contact_name, '')), '');
      IF v_name IS NOT NULL THEN
        v_name := v_name || ' inquiry';
      ELSE
        v_name := p_fallback;
      END IF;
    END IF;
    IF char_length(v_name) > 180 THEN
      v_name := left(v_name, 177) || '...';
    END IF;
    RETURN v_name;
  END;
  $$;

  -- Bind a customer-submitted inquiry to its own Qualified opportunity.
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
      li.created_by
    INTO v_inquiry
    FROM public.lead_inquiries li
    WHERE li.id = p_inquiry_id;

    IF NOT FOUND THEN
      RETURN NULL;
    END IF;

    IF coalesce(v_inquiry.customer_submitted, false) IS NOT TRUE
      AND lower(coalesce(v_inquiry.created_by, '')) <> 'customer_app' THEN
      RETURN v_inquiry.crm_opportunity_id;
    END IF;

    -- Already bound to an opportunity that points at this inquiry
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

    -- First inquiry: reuse the signup New-board placeholder (no inquiry bound yet)
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

    -- Keep a lead bridge pointer if empty (shared lead across this customer's inquiries)
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
    IF NEW.customer_submitted IS TRUE
      OR lower(coalesce(NEW.created_by, '')) = 'customer_app' THEN
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

  DROP TRIGGER IF EXISTS trg_lead_inquiries_mobile_opportunity ON public.lead_inquiries;
  CREATE TRIGGER trg_lead_inquiries_mobile_opportunity
  AFTER INSERT OR UPDATE OF customer_submitted, product_name
  ON public.lead_inquiries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_lead_inquiries_mobile_opportunity();

  REVOKE ALL ON FUNCTION public._ensure_crm_qualified_stage_for_org(uuid) FROM public;
  REVOKE ALL ON FUNCTION public._ensure_crm_opportunity_for_mobile_inquiry(uuid) FROM public;
  GRANT EXECUTE ON FUNCTION public._ensure_crm_qualified_stage_for_org(uuid) TO service_role;
  GRANT EXECUTE ON FUNCTION public._ensure_crm_opportunity_for_mobile_inquiry(uuid) TO service_role;

  -- Backfill: split existing customer inquiries onto their own opportunities
  DO $$
  DECLARE
    rec record;
  BEGIN
    FOR rec IN
      SELECT li.id
      FROM public.lead_inquiries li
      WHERE coalesce(li.customer_submitted, false) = true
        OR lower(coalesce(li.created_by, '')) = 'customer_app'
      ORDER BY li.created_at ASC NULLS LAST, li.id ASC
    LOOP
      BEGIN
        PERFORM public._ensure_crm_opportunity_for_mobile_inquiry(rec.id);
      EXCEPTION
        WHEN others THEN
          RAISE WARNING 'backfill inquiry opportunity failed for %: %', rec.id, SQLERRM;
      END;
    END LOOP;
  END $$;
