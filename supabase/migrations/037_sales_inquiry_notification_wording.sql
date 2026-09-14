-- 037 — Sales informational wording when a customer submits an Inquiry to Operations.
-- Safe to re-run: CREATE OR REPLACE only. Does not change routing or Ops notifications.

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
