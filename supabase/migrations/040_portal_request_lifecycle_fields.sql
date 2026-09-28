-- STEP 040 — Portal inquiry fields for Requests lifecycle filters
-- Adds shipment tracking / parcel photo / acceptance onto customer portal payload
-- so Requests can classify: Pending (draft|sent|quotation) vs Finalized.
-- Prerequisites: 033 drafts portal, 038 shipment columns on quotations

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
      cq.quote_sent_at,
      cq.customer_accepted_at,
      cq.shipment_tracking_number,
      cq.shipment_parcel_photo_url
    FROM public.lead_inquiries li
    JOIN matched_leads ml ON ml.id = li.lead_id
    LEFT JOIN LATERAL (
      SELECT
        q.id AS quotation_id,
        q.quotation_number,
        q.total_amount AS quote_total,
        q.sent_to_customer_at AS quote_sent_at,
        q.customer_accepted_at,
        q.shipment_tracking_number,
        q.shipment_parcel_photo_url
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
            'customer_accepted_at', mi.customer_accepted_at,
            'shipment_tracking_number', mi.shipment_tracking_number,
            'shipment_parcel_photo_url', mi.shipment_parcel_photo_url,
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
