-- STEP 043 — Fix optional inquiry description at RPC source
-- Root cause: submit_customer_inquiry / submit_customer_inquiry_draft used
--   v_desc := nullif(trim(...), '')  which stores NULL when Other details is blank.
-- lead_inquiries.description is NOT NULL DEFAULT '', so INSERT/UPDATE fails.
-- Also hardens the normalize trigger to run on every insert/update.
-- Safe to re-run (CREATE OR REPLACE only).

create or replace function public.trg_lead_inquiries_normalize_description()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.description := coalesce(new.description, '');
  return new;
end;
$$;

create or replace trigger trg_lead_inquiries_normalize_description
  before insert or update
  on public.lead_inquiries
  for each row
  execute function public.trg_lead_inquiries_normalize_description();

-- ---------------------------------------------------------------------------
-- submit_customer_inquiry: keep empty Other details as '' (never NULL)
-- ---------------------------------------------------------------------------
create or replace function public.submit_customer_inquiry(
  p_session_token text,
  p_product_name text,
  p_quantity text,
  p_total_weight text,
  p_cbm text,
  p_description text default null,
  p_image_url text default null,
  p_additional_image_urls jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid;
  v_phone text;
  v_user_name text;
  v_contact public.contacts%rowtype;
  v_agent_id uuid;
  v_agent_username text;
  v_lead public.leads%rowtype;
  v_next_version integer;
  v_group_id uuid;
  v_inquiry public.lead_inquiries%rowtype;
  v_customer_id text;
  v_org_id uuid;
  v_product text;
  v_qty text;
  v_weight text;
  v_cbm text;
  v_desc text;
  v_created_by text;
  v_image_url text;
  v_additional jsonb;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);

  select u.phone, trim(both from (u.first_name || ' ' || u.last_name))
  into v_phone, v_user_name
  from public.users u
  where u.id = v_user_id;

  if v_phone is null then
    raise exception 'unauthorized_user' using errcode = '42501';
  end if;

  v_product := trim(coalesce(p_product_name, ''));
  v_qty := trim(coalesce(p_quantity, ''));
  v_weight := trim(coalesce(p_total_weight, ''));
  v_cbm := trim(coalesce(p_cbm, ''));
  v_desc := coalesce(trim(coalesce(p_description, '')), '');
  v_image_url := nullif(trim(coalesce(p_image_url, '')), '');
  v_additional := coalesce(p_additional_image_urls, '[]'::jsonb);
  if jsonb_typeof(v_additional) is distinct from 'array' then
    v_additional := '[]'::jsonb;
  end if;

  if v_product = '' then
    raise exception 'product_name_required';
  end if;
  if v_qty = '' or v_qty !~ '^\d+$' then
    raise exception 'quantity_invalid';
  end if;
  if v_weight = '' or v_weight !~ '^(?:\d+|\d+\.\d+|\d*\.\d+)$' then
    raise exception 'total_weight_invalid';
  end if;
  if v_cbm = '' or v_cbm !~ '^(?:\d+|\d+\.\d+|\d*\.\d+)$' then
    raise exception 'cbm_invalid';
  end if;

  select ct.*
  into v_contact
  from public.contacts ct
  where public.phones_match(ct.phone, v_phone)
     or public.phones_match(ct.mobile, v_phone)
  order by
    case when ct.salesperson_id is not null then 0 else 1 end,
    case
      when ct.created_by is not null
       and exists (
         select 1 from public.sales_agents sa0
         where lower(trim(sa0.username)) = lower(trim(ct.created_by))
       ) then 0
      else 1
    end,
    ct.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'no_matching_contact';
  end if;

  v_created_by := nullif(trim(coalesce(v_contact.created_by, '')), '');
  v_customer_id := nullif(trim(coalesce(v_contact.lead_id_formatted, '')), '');
  v_org_id := v_contact.organization_id;

  if v_contact.salesperson_id is not null then
    select sa.id, sa.username
    into v_agent_id, v_agent_username
    from public.sales_agents sa
    where sa.id = v_contact.salesperson_id
    limit 1;
  end if;

  if v_agent_id is null and v_created_by is not null then
    select sa.id, sa.username
    into v_agent_id, v_agent_username
    from public.sales_agents sa
    where lower(trim(sa.username)) = lower(v_created_by)
    limit 1;
  end if;

  if v_agent_id is null and v_created_by is not null then
    select sa.id, sa.username
    into v_agent_id, v_agent_username
    from public.sales_agents sa
    where sa.email is not null
      and lower(trim(sa.email)) = lower(v_created_by)
    limit 1;
  end if;

  if v_agent_id is null then
    select sa.id, sa.username
    into v_agent_id, v_agent_username
    from public.leads l
    join public.sales_agents sa on sa.id = l.sales_agent_id
    where l.contact_id = v_contact.id
      and l.sales_agent_id is not null
    order by l.updated_at desc nulls last, l.created_at desc nulls last
    limit 1;
  end if;

  if v_agent_id is null then
    select sa.id, sa.username
    into v_agent_id, v_agent_username
    from public.leads l
    join public.sales_agents sa on sa.id = l.sales_agent_id
    where public.phones_match(l.number, v_phone)
      and l.sales_agent_id is not null
    order by l.updated_at desc nulls last, l.created_at desc nulls last
    limit 1;
  end if;

  if v_agent_id is null then
    begin
      select sa.id, sa.username
      into v_agent_id, v_agent_username
      from public.crm_opportunities o
      join public.sales_agents sa on sa.id = o.salesperson_id
      where o.contact_id = v_contact.id
        and o.salesperson_id is not null
      order by o.updated_at desc nulls last, o.created_at desc nulls last
      limit 1;
    exception
      when undefined_table then null;
      when undefined_column then null;
    end;
  end if;

  if v_agent_id is null then
    raise exception 'no_sales_owner';
  end if;

  select l.*
  into v_lead
  from public.leads l
  where l.contact_id = v_contact.id
    and l.sales_agent_id = v_agent_id
  order by l.created_at desc
  limit 1;

  if not found then
    select l.*
    into v_lead
    from public.leads l
    where l.contact_id = v_contact.id
    order by l.created_at desc
    limit 1;
  end if;

  if not found then
    select l.*
    into v_lead
    from public.leads l
    where public.phones_match(l.number, v_phone)
      and l.sales_agent_id = v_agent_id
    order by l.created_at desc
    limit 1;
  end if;

  if not found then
    select l.*
    into v_lead
    from public.leads l
    where public.phones_match(l.number, v_phone)
    order by l.created_at desc
    limit 1;
  end if;

  if not found then
    if v_customer_id is null then
      v_customer_id := upper(left(replace(v_contact.id::text, '-', ''), 8));
      begin
        update public.contacts
        set lead_id_formatted = v_customer_id
        where id = v_contact.id
          and (lead_id_formatted is null or btrim(lead_id_formatted) = '');
      exception
        when others then null;
      end;
    end if;

    insert into public.leads (
      name, number, source, status, sales_agent_id, created_by_sales_agent_id,
      contact_id, organization_id, converted, lead_id_formatted
    )
    values (
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
    returning * into v_lead;
  else
    update public.leads
    set
      contact_id = coalesce(contact_id, v_contact.id),
      sales_agent_id = coalesce(sales_agent_id, v_agent_id),
      organization_id = coalesce(organization_id, v_org_id),
      lead_id_formatted = coalesce(nullif(trim(lead_id_formatted), ''), v_customer_id)
    where id = v_lead.id
    returning * into v_lead;
  end if;

  begin
    update public.contacts
    set
      salesperson_id = coalesce(salesperson_id, v_agent_id),
      created_by = coalesce(nullif(trim(created_by), ''), v_agent_username)
    where id = v_contact.id
      and (salesperson_id is null or created_by is null or btrim(created_by) = '');
  exception
    when others then null;
  end;

  select coalesce(max(li.version_number), 0) + 1
  into v_next_version
  from public.lead_inquiries li
  where li.lead_id = v_lead.id;

  v_group_id := gen_random_uuid();

  insert into public.lead_inquiries (
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
    customer_submitted
  )
  values (
    v_lead.id,
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
    'pending',
    false,
    false,
    'draft',
    null,
    coalesce(v_lead.organization_id, v_org_id),
    'customer_app',
    true
  )
  returning * into v_inquiry;

  begin
    insert into public.inquiry_logs (
      inquiry_id, action, previous_values, new_values, performed_by
    )
    values (
      v_inquiry.id,
      'inquiry_created_draft',
      null,
      jsonb_build_object(
        'product_name', v_product,
        'total_weight', v_weight,
        'cbm', v_cbm,
        'quantity', v_qty,
        'description', v_desc,
        'image_url', v_image_url,
        'additional_image_urls', v_additional,
        'customer_submitted', true
      ),
      'customer_app'
    );
  exception when others then null;
  end;

  begin
    insert into public.lead_activity_logs (
      lead_id, inquiry_id, inquiry_version, action_type, action_label, new_values, performed_by
    )
    values (
      v_lead.id,
      v_inquiry.id,
      v_next_version,
      'inquiry_created_draft',
      'Customer submitted inquiry (mobile app)',
      jsonb_build_object(
        'product_name', v_product,
        'quantity', v_qty,
        'total_weight', v_weight,
        'cbm', v_cbm,
        'image_url', v_image_url,
        'customer_submitted', true
      ),
      'customer_app'
    );
  exception when others then null;
  end;

  if v_agent_username is not null then
    begin
      insert into public.inquiry_lifecycle_notifications (
        lead_id, inquiry_id, confirmation_id,
        sender_role, sender_username, recipient_role, recipient_username,
        event_type, message
      )
      values (
        v_lead.id,
        v_inquiry.id,
        null,
        'customer',
        'customer_app',
        'sales_agent',
        v_agent_username,
        'customer_submitted',
        format(
          'Customer submitted a new inquiry via mobile app for Lead #%s (%s). Review and send to Operations when ready.',
          coalesce(v_lead.lead_id_formatted, 'N/A'),
          v_product
        )
      );
    exception when others then null;
    end;
  end if;

  return jsonb_build_object(
    'inquiry', jsonb_build_object(
      'id', v_inquiry.id,
      'lead_id', v_inquiry.lead_id,
      'lead_number', v_lead.lead_id_formatted,
      'inquiry_number', coalesce(v_inquiry.version_number::text, upper(left(replace(v_inquiry.id::text, '-', ''), 8))),
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
end;
$$;


-- ---------------------------------------------------------------------------
-- submit_customer_inquiry_draft: keep empty Other details as '' (never NULL)
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
  -- IMPORTANT: never NULL — column is NOT NULL DEFAULT ''
  v_desc := coalesce(trim(coalesce(p_description, '')), '');
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

REVOKE ALL ON FUNCTION public.submit_customer_inquiry(text, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_customer_inquiry(text, text, text, text, text, text, text, jsonb) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.submit_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_customer_inquiry_draft(text, uuid, text, text, text, text, text, text, jsonb) TO anon, authenticated;
