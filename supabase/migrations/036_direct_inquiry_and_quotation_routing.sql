-- 036 — Customer App inquiry goes directly to Operations.
-- Sales still gets an informational notification. Admin approval still uses
-- existing Operations "approved" notifications; quotation send is handled in app code.
--
-- Prerequisites: 033 (submit_customer_inquiry_draft + notify trigger), 035 (event types)

-- ---------------------------------------------------------------------------
-- When a customer actually submits (not a draft), mark the SAME inquiry row
-- as sent to Operations so it appears in the existing Operations list.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.route_customer_submitted_inquiry_to_operations()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_submitted IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF lower(coalesce(NEW.status, '')) = 'draft' THEN
    RETURN NEW;
  END IF;

  -- Only on first submit. Later calculator / approval updates must not rewrite routing.
  IF TG_OP = 'UPDATE' AND coalesce(OLD.customer_submitted, false) IS TRUE THEN
    RETURN NEW;
  END IF;

  NEW.sent_to_accounting := true;
  BEGIN
    NEW.sent_to_operations := true;
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;
  BEGIN
    NEW.sent_at := coalesce(NEW.sent_at, now());
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
  END;

  IF NEW.approval_status IS NULL
     OR btrim(coalesce(NEW.approval_status, '')) IN ('', 'draft') THEN
    NEW.approval_status := 'sent';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_route_customer_submitted_inquiry_to_operations ON public.lead_inquiries;
CREATE TRIGGER trg_route_customer_submitted_inquiry_to_operations
BEFORE INSERT OR UPDATE ON public.lead_inquiries
FOR EACH ROW
EXECUTE FUNCTION public.route_customer_submitted_inquiry_to_operations();

-- ---------------------------------------------------------------------------
-- Draft submit: same row, now routed to Operations. Return JSON reflects DB.
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
    sent_to_accounting = true,
    sent_to_operations = true,
    sent_at = now(),
    approval_status = 'sent',
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
      'sent_to_accounting', true,
      'created_at', v_inquiry.created_at
    ),
    'sales_agent_username', v_agent_username,
    'message', 'Request submitted. Operations will review your inquiry.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sales: informational customer/lead notification.
-- Operations: existing inquiry_sent notification (same event/title as Sales forward).
-- ---------------------------------------------------------------------------
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
  v_ops_href text;
  v_opportunity_id uuid;
  v_sales_message text;
  v_lead_label text;
  v_ops_username text;
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
  EXCEPTION
    WHEN others THEN
      RETURN NEW;
  END;

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

  v_lead_label := nullif(btrim(coalesce(v_lead_number, '')), '');
  IF v_lead_label IS NOT NULL THEN
    v_lead_label := regexp_replace(v_lead_label, '^#+', '');
    v_lead_label := 'Lead #' || v_lead_label;
  ELSE
    v_lead_label := 'Lead';
  END IF;

  v_sales_message := format(
    '%s - Customer %s has submitted an Inquiry to Operations.',
    v_lead_label,
    coalesce(nullif(btrim(coalesce(v_customer_name, '')), ''), 'Customer')
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

  v_ops_href :=
    '/admin/dashboard?tab=operations&opsTab=leads-inquiry&leadId='
    || NEW.lead_id::text
    || '&inquiryId='
    || NEW.id::text;

  -- Informational Sales notification (does not require Sales to forward).
  IF v_agent_username IS NOT NULL AND btrim(v_agent_username) <> '' THEN
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM public.inquiry_lifecycle_notifications n
        WHERE n.inquiry_id = NEW.id
          AND n.event_type IN ('inquiry_received', 'customer_submitted')
          AND n.recipient_username = v_agent_username
      ) THEN
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
          v_sales_message,
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
      END IF;
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
            'sales_agent',
            'mobile',
            'sales_agent',
            v_agent_username,
            'inquiry_received',
            v_sales_message
          );
        EXCEPTION
          WHEN others THEN
            NULL;
        END;
      WHEN others THEN
        NULL;
    END;
  END IF;

  -- Existing Operations "new inquiry" notification (same event as Sales forward).
  BEGIN
    FOR v_ops_username IN
      SELECT DISTINCT trim(ops.username) AS username
      FROM (
        SELECT ou.username
        FROM public.operations_users ou
        WHERE nullif(trim(ou.username), '') IS NOT NULL
        UNION
        SELECT au.username
        FROM public.app_users au
        WHERE nullif(trim(au.username), '') IS NOT NULL
          AND (
            au.permissions @> '["leads-inquiry"]'::jsonb
            OR (
              au.permissions @> '["operations"]'::jsonb
              AND NOT (
                au.permissions @> '["leads-inquiry"]'::jsonb
                OR au.permissions @> '["management"]'::jsonb
                OR au.permissions @> '["console"]'::jsonb
                OR au.permissions @> '["loading-instruction"]'::jsonb
                OR au.permissions @> '["import-packing-list"]'::jsonb
                OR au.permissions @> '["import-invoice"]'::jsonb
                OR au.permissions @> '["inquiry-confirmation"]'::jsonb
                OR au.permissions @> '["calculator-config"]'::jsonb
              )
            )
          )
      ) ops
    LOOP
      IF v_ops_username IS NULL OR v_ops_username = '' THEN
        CONTINUE;
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.inquiry_lifecycle_notifications n
        WHERE n.inquiry_id = NEW.id
          AND n.event_type = 'inquiry_sent'
          AND lower(n.recipient_username) = lower(v_ops_username)
      ) THEN
        CONTINUE;
      END IF;

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
          'operations',
          v_ops_username,
          'inquiry_sent',
          'New Inquiry Received from Sales',
          format('Inquiry sent by Sales Agent for Lead #%s.', coalesce(v_lead_number, 'N/A')),
          v_ops_href,
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
              'sales_agent',
              'mobile',
              'operations',
              v_ops_username,
              'inquiry_sent',
              format('Inquiry sent by Sales Agent for Lead #%s.', coalesce(v_lead_number, 'N/A'))
            );
          EXCEPTION
            WHEN others THEN
              NULL;
          END;
        WHEN others THEN
          NULL;
      END;
    END LOOP;
  EXCEPTION
    WHEN undefined_table THEN
      NULL;
    WHEN others THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
