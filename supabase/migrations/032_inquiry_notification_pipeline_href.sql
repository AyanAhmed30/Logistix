-- 032 — Mobile inquiry notifications open My Pipeline → Opportunity → Inquiry
-- Prerequisites: 030 (notify_inquiry_received_from_mobile), 031 (one opportunity per inquiry)
--
-- Stored href used to point at /sales-agent/leads/... (legacy). The web app then
-- resolved inquiry_received to /crm/inquiries/:id (All Inquiries). Notifications
-- now carry opportunityId and href:
--   /crm/opportunities/:opportunityId/inquiry?tab=view&inquiryId=:inquiryId

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

DROP TRIGGER IF EXISTS trg_notify_inquiry_received_from_mobile ON public.lead_inquiries;

CREATE TRIGGER trg_notify_inquiry_received_from_mobile
AFTER INSERT OR UPDATE OF customer_submitted
ON public.lead_inquiries
FOR EACH ROW
EXECUTE FUNCTION public.notify_inquiry_received_from_mobile();

-- If the opportunity row is linked after the notify trigger, patch href/payload.
CREATE OR REPLACE FUNCTION public.sync_inquiry_received_notification_opportunity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inquiry_id uuid;
  v_href text;
BEGIN
  v_inquiry_id := NEW.lead_inquiry_id;
  IF v_inquiry_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_href :=
    '/crm/opportunities/'
    || NEW.id::text
    || '/inquiry?tab=view&inquiryId='
    || v_inquiry_id::text;

  BEGIN
    UPDATE public.inquiry_lifecycle_notifications n
    SET
      href = v_href,
      payload = coalesce(n.payload, '{}'::jsonb)
        || jsonb_build_object(
          'opportunityId', NEW.id,
          'inquiryId', v_inquiry_id
        )
    WHERE n.inquiry_id = v_inquiry_id
      AND n.event_type IN ('inquiry_received', 'customer_submitted');
  EXCEPTION
    WHEN undefined_column THEN
      NULL;
    WHEN undefined_table THEN
      NULL;
    WHEN others THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_inquiry_received_notification_opportunity
  ON public.crm_opportunities;

CREATE TRIGGER trg_sync_inquiry_received_notification_opportunity
AFTER INSERT OR UPDATE OF lead_inquiry_id
ON public.crm_opportunities
FOR EACH ROW
EXECUTE FUNCTION public.sync_inquiry_received_notification_opportunity();

-- Backfill existing inquiry notifications to the pipeline opportunity route.
DO $$
BEGIN
  UPDATE public.inquiry_lifecycle_notifications n
  SET
    href =
      '/crm/opportunities/'
      || o.id::text
      || '/inquiry?tab=view&inquiryId='
      || n.inquiry_id::text,
    payload = coalesce(n.payload, '{}'::jsonb)
      || jsonb_build_object(
        'opportunityId', o.id,
        'inquiryId', n.inquiry_id
      )
  FROM public.crm_opportunities o
  WHERE o.lead_inquiry_id = n.inquiry_id
    AND n.inquiry_id IS NOT NULL
    AND n.event_type IN ('inquiry_received', 'customer_submitted');
EXCEPTION
  WHEN undefined_column THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;

DO $$
BEGIN
  UPDATE public.inquiry_lifecycle_notifications n
  SET
    href =
      '/crm/opportunities/'
      || i.crm_opportunity_id::text
      || '/inquiry?tab=view&inquiryId='
      || n.inquiry_id::text,
    payload = coalesce(n.payload, '{}'::jsonb)
      || jsonb_build_object(
        'opportunityId', i.crm_opportunity_id,
        'inquiryId', n.inquiry_id
      )
  FROM public.lead_inquiries i
  WHERE i.id = n.inquiry_id
    AND i.crm_opportunity_id IS NOT NULL
    AND n.inquiry_id IS NOT NULL
    AND n.event_type IN ('inquiry_received', 'customer_submitted')
    AND coalesce(n.payload->>'opportunityId', '') = '';
EXCEPTION
  WHEN undefined_column THEN
    NULL;
  WHEN undefined_table THEN
    NULL;
END $$;
