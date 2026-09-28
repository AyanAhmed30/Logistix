-- STEP 038 — Quotation acceptance shipment info (tracking + parcel photo)
-- Single source of truth on public.quotations; customer Orders = accepted quotations.
-- Prerequisites: 019 send quotation, 020 negotiation

-- -------- Shipment columns on quotations --------
alter table public.quotations
  add column if not exists shipment_tracking_number text,
  add column if not exists shipment_tracking_added_at timestamptz,
  add column if not exists shipment_parcel_photo_url text,
  add column if not exists shipment_parcel_photo_path text,
  add column if not exists shipment_parcel_photo_uploaded_at timestamptz,
  add column if not exists shipment_info_updated_at timestamptz,
  add column if not exists shipment_info_updated_by text,
  add column if not exists shipment_info_updated_by_role text;

comment on column public.quotations.shipment_tracking_number is
  'Customer or sales-provided parcel tracking number after quotation acceptance.';
comment on column public.quotations.shipment_parcel_photo_url is
  'Public URL of parcel photo uploaded by customer or sales agent.';

create index if not exists quotations_customer_accepted_at_idx
  on public.quotations (customer_accepted_at desc nulls last)
  where customer_accepted_at is not null;

create index if not exists quotations_shipment_updated_idx
  on public.quotations (shipment_info_updated_at desc nulls last)
  where shipment_info_updated_at is not null;

-- -------- Expand quotation_logs actions --------
do $$
begin
  alter table public.quotation_logs
    drop constraint if exists quotation_logs_action_check;
  alter table public.quotation_logs
    add constraint quotation_logs_action_check
    check (
      action in (
        'created',
        'updated',
        'deleted',
        'status_changed',
        'printed',
        'log_note',
        'activity',
        'duplicated',
        'locked',
        'unlocked',
        'emailed',
        'previewed',
        'sent_to_customer',
        'resent_to_customer',
        'customer_negotiation_request',
        'sales_negotiation_counter_draft',
        'sales_negotiation_counter_sent',
        'sales_negotiation_accepted',
        'sales_negotiation_rejected',
        'customer_accepted_quotation',
        'customer_declined_quotation',
        'shipment_info_updated'
      )
    );
exception
  when undefined_table then null;
end $$;

-- -------- Expand lifecycle notification event types --------
do $$
declare
  rec record;
  allowed text;
begin
  for rec in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'inquiry_lifecycle_notifications'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%event_type%'
  loop
    execute format(
      'alter table public.inquiry_lifecycle_notifications drop constraint if exists %I',
      rec.conname
    );
  end loop;

  select string_agg(quote_literal(val), ', ' order by val)
  into allowed
  from (
    select distinct btrim(event_type) as val
    from public.inquiry_lifecycle_notifications
    where event_type is not null
      and btrim(event_type) <> ''
    union
    select unnest(array[
      'inquiry_received',
      'inquiry_sent',
      'sent_for_admin_approval',
      'approved',
      'rejected',
      'lead_transferred',
      'customer_submitted',
      'quotation_sent_to_customer',
      'quotation_negotiation_request',
      'quotation_counter_offer',
      'quotation_customer_accepted',
      'quotation_customer_declined',
      'customer_requested_negotiation',
      'customer_accepted_quotation',
      'customer_declined_quotation',
      'inquiry_flag_raised',
      'quotation_shipment_tracking_added',
      'quotation_shipment_photo_uploaded',
      'quotation_shipment_info_updated',
      'quotation_shipment_info_added_by_sales'
    ])
  ) s;

  if allowed is not null then
    execute format(
      'alter table public.inquiry_lifecycle_notifications
         add constraint inquiry_lifecycle_notifications_event_type_check
         check (event_type in (%s))',
      allowed
    );
  end if;
end $$;

-- -------- Helper: computed shipment status --------
create or replace function public._quotation_shipment_status(
  p_accepted_at timestamptz,
  p_tracking text,
  p_photo_url text,
  p_sent_at timestamptz
)
returns text
language sql
immutable
as $$
  select case
    when p_accepted_at is null and p_sent_at is not null then 'quotation_sent'
    when p_accepted_at is null then 'not_sent'
    when nullif(trim(coalesce(p_tracking, '')), '') is not null
         and nullif(trim(coalesce(p_photo_url, '')), '') is not null
      then 'tracking_and_photo'
    when nullif(trim(coalesce(p_tracking, '')), '') is not null
      then 'tracking_added'
    when nullif(trim(coalesce(p_photo_url, '')), '') is not null
      then 'photo_uploaded'
    else 'accepted_pending'
  end;
$$;

revoke all on function public._quotation_shipment_status(timestamptz, text, text, timestamptz) from public;
grant execute on function public._quotation_shipment_status(timestamptz, text, text, timestamptz) to anon, authenticated, service_role;

-- -------- Extend get_customer_quote with shipment fields --------
create or replace function public.get_customer_quote(
  p_session_token text,
  p_inquiry_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_phone text;
  v_quote public.quotations%rowtype;
  v_history jsonb;
  v_status text;
  v_can_negotiate boolean;
  v_can_accept boolean;
  v_can_decline boolean;
  v_shipment_status text;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);

  select u.phone into v_phone
  from public.users u
  where u.id = v_user_id;

  if v_phone is null then
    raise exception 'unauthorized_user' using errcode = '42501';
  end if;

  v_quote := public._customer_owned_sent_quotation(v_phone, p_inquiry_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_type', e.event_type,
        'actor_role', e.actor_role,
        'actor_name', coalesce(e.actor_username, e.actor_role),
        'previous_amount', e.previous_amount,
        'offered_amount', e.offered_amount,
        'requested_amount', e.requested_amount,
        'message', e.message,
        'created_at', e.created_at
      )
      order by e.created_at asc
    ),
    '[]'::jsonb
  )
  into v_history
  from public.quotation_negotiation_events e
  where e.quotation_id = v_quote.id
    and e.event_type not in ('sales_counter_draft');

  if v_quote.customer_accepted_at is not null or v_quote.negotiation_status = 'accepted' then
    v_status := 'accepted';
  elsif v_quote.customer_declined_at is not null or v_quote.negotiation_status = 'declined' then
    v_status := 'declined';
  elsif v_quote.negotiation_status = 'awaiting_sales' then
    v_status := 'awaiting_sales';
  elsif v_quote.negotiation_status = 'awaiting_customer'
        or v_quote.pending_counter_amount is not null then
    v_status := 'awaiting_customer';
  elsif v_quote.status in ('sales_order', 'cancelled') then
    v_status := 'closed';
  else
    v_status := 'quote_ready';
  end if;

  v_can_negotiate := (
    v_quote.status not in ('sales_order', 'cancelled')
    and not coalesce(v_quote.is_locked, false)
    and v_quote.customer_accepted_at is null
    and v_quote.customer_declined_at is null
    and coalesce(v_quote.negotiation_status, 'none') not in ('accepted', 'declined', 'closed', 'awaiting_sales')
  );

  v_can_accept := (
    v_quote.status not in ('sales_order', 'cancelled')
    and not coalesce(v_quote.is_locked, false)
    and v_quote.customer_accepted_at is null
    and v_quote.customer_declined_at is null
    and coalesce(v_quote.negotiation_status, 'none') not in ('accepted', 'declined', 'closed', 'awaiting_sales')
  );

  -- Decline removed from customer UI; keep false for API consumers.
  v_can_decline := false;

  v_shipment_status := public._quotation_shipment_status(
    v_quote.customer_accepted_at,
    v_quote.shipment_tracking_number,
    v_quote.shipment_parcel_photo_url,
    v_quote.sent_to_customer_at
  );

  return jsonb_build_object(
    'inquiry_id', p_inquiry_id,
    'quotation_id', v_quote.id,
    'quotation_number', v_quote.quotation_number,
    'total_amount', v_quote.total_amount,
    'original_offer_amount', coalesce(v_quote.original_offer_amount, v_quote.total_amount),
    'previous_offer_amount', v_quote.previous_offer_amount,
    'quotation_date', v_quote.quotation_date,
    'expiration_date', v_quote.expiration_date,
    'payment_terms', v_quote.payment_terms,
    'customer_notes', v_quote.customer_notes,
    'pdf_url', v_quote.customer_pdf_url,
    'sent_at', v_quote.sent_to_customer_at,
    'status', v_status,
    'negotiation_status', coalesce(v_quote.negotiation_status, 'none'),
    'pending_request_amount', v_quote.pending_customer_request_amount,
    'pending_request_message', v_quote.pending_customer_request_message,
    'can_negotiate', v_can_negotiate,
    'can_accept', v_can_accept,
    'can_decline', v_can_decline,
    'customer_accepted_at', v_quote.customer_accepted_at,
    'shipment_tracking_number', v_quote.shipment_tracking_number,
    'shipment_tracking_added_at', v_quote.shipment_tracking_added_at,
    'shipment_parcel_photo_url', v_quote.shipment_parcel_photo_url,
    'shipment_parcel_photo_uploaded_at', v_quote.shipment_parcel_photo_uploaded_at,
    'shipment_info_updated_at', v_quote.shipment_info_updated_at,
    'shipment_status', v_shipment_status,
    'can_add_shipment_info', (
      v_quote.customer_accepted_at is not null
      or v_can_accept
    ),
    'history', v_history
  );
end;
$$;

revoke all on function public.get_customer_quote(text, uuid) from public;
grant execute on function public.get_customer_quote(text, uuid) to anon, authenticated;

-- -------- Upsert shipment info (customer); accepts quotation if needed --------
create or replace function public.upsert_customer_shipment_info(
  p_session_token text,
  p_inquiry_id uuid,
  p_tracking_number text default null,
  p_parcel_photo_url text default null,
  p_parcel_photo_path text default null,
  p_accept_without_shipment boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_phone text;
  v_user_name text;
  v_quote public.quotations%rowtype;
  v_tracking text;
  v_photo_url text;
  v_photo_path text;
  v_had_tracking boolean;
  v_had_photo boolean;
  v_accepted_now boolean := false;
  v_event_type text;
  v_message text;
  v_shipment_status text;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);

  select u.phone, trim(both from (u.first_name || ' ' || u.last_name))
  into v_phone, v_user_name
  from public.users u
  where u.id = v_user_id;

  if v_phone is null then
    raise exception 'unauthorized_user' using errcode = '42501';
  end if;

  v_quote := public._customer_owned_sent_quotation(v_phone, p_inquiry_id);

  if v_quote.status = 'cancelled' or coalesce(v_quote.is_locked, false) then
    raise exception 'negotiation_closed';
  end if;

  if v_quote.customer_declined_at is not null or v_quote.negotiation_status = 'declined' then
    raise exception 'negotiation_closed';
  end if;

  if v_quote.negotiation_status = 'awaiting_sales' then
    raise exception 'waiting_for_sales';
  end if;

  v_tracking := nullif(trim(coalesce(p_tracking_number, '')), '');
  v_photo_url := nullif(trim(coalesce(p_parcel_photo_url, '')), '');
  v_photo_path := nullif(trim(coalesce(p_parcel_photo_path, '')), '');

  -- Accept-only path (no shipment info yet)
  if coalesce(p_accept_without_shipment, false)
     and v_tracking is null
     and v_photo_url is null then
    if v_quote.customer_accepted_at is null then
      if v_quote.status = 'sales_order' then
        update public.quotations
        set
          negotiation_status = 'accepted',
          customer_accepted_at = now(),
          updated_at = now()
        where id = v_quote.id;
        v_accepted_now := true;
      else
        perform public.accept_customer_quotation(p_session_token, p_inquiry_id);
        v_accepted_now := true;
      end if;
      v_quote := public._customer_owned_sent_quotation(v_phone, p_inquiry_id);
    end if;

    v_shipment_status := public._quotation_shipment_status(
      v_quote.customer_accepted_at,
      v_quote.shipment_tracking_number,
      v_quote.shipment_parcel_photo_url,
      v_quote.sent_to_customer_at
    );

    return jsonb_build_object(
      'ok', true,
      'quotation_id', v_quote.id,
      'quotation_number', v_quote.quotation_number,
      'accepted', true,
      'accepted_now', v_accepted_now,
      'shipment_status', v_shipment_status,
      'shipment_tracking_number', v_quote.shipment_tracking_number,
      'shipment_parcel_photo_url', v_quote.shipment_parcel_photo_url
    );
  end if;

  if v_tracking is null and v_photo_url is null then
    raise exception 'shipment_info_required';
  end if;

  -- Ensure acceptance first (idempotent). If staff already confirmed to sales_order,
  -- mark customer acceptance on the same row instead of calling accept RPC.
  if v_quote.customer_accepted_at is null then
    if v_quote.status = 'sales_order' then
      update public.quotations
      set
        negotiation_status = 'accepted',
        customer_accepted_at = now(),
        pending_customer_request_amount = null,
        pending_customer_request_message = null,
        pending_customer_request_at = null,
        pending_counter_amount = null,
        pending_counter_message = null,
        pending_counter_at = null,
        pending_counter_by = null,
        updated_at = now()
      where id = v_quote.id;
      v_accepted_now := true;
      v_quote := public._customer_owned_sent_quotation(v_phone, p_inquiry_id);
    else
      perform public.accept_customer_quotation(p_session_token, p_inquiry_id);
      v_accepted_now := true;
      v_quote := public._customer_owned_sent_quotation(v_phone, p_inquiry_id);
    end if;
  end if;

  v_had_tracking := nullif(trim(coalesce(v_quote.shipment_tracking_number, '')), '') is not null;
  v_had_photo := nullif(trim(coalesce(v_quote.shipment_parcel_photo_url, '')), '') is not null;

  update public.quotations
  set
    shipment_tracking_number = coalesce(v_tracking, shipment_tracking_number),
    shipment_tracking_added_at = case
      when v_tracking is not null then now()
      else shipment_tracking_added_at
    end,
    shipment_parcel_photo_url = coalesce(v_photo_url, shipment_parcel_photo_url),
    shipment_parcel_photo_path = coalesce(v_photo_path, shipment_parcel_photo_path),
    shipment_parcel_photo_uploaded_at = case
      when v_photo_url is not null then now()
      else shipment_parcel_photo_uploaded_at
    end,
    shipment_info_updated_at = now(),
    shipment_info_updated_by = coalesce(nullif(v_user_name, ''), 'Customer'),
    shipment_info_updated_by_role = 'customer',
    updated_at = now()
  where id = v_quote.id
  returning * into v_quote;

  insert into public.quotation_logs (
    quotation_id,
    action,
    previous_status,
    new_status,
    performed_by,
    details
  ) values (
    v_quote.id,
    'shipment_info_updated',
    v_quote.status,
    v_quote.status,
    coalesce(nullif(v_user_name, ''), 'Customer'),
    jsonb_build_object(
      'inquiry_id', p_inquiry_id,
      'tracking_provided', v_tracking is not null,
      'photo_provided', v_photo_url is not null,
      'actor_role', 'customer'
    )
  );

  -- Notify sales agent
  begin
    if v_tracking is not null and v_photo_url is not null then
      v_event_type := 'quotation_shipment_info_updated';
      v_message := format(
        'Customer %s submitted tracking number and parcel photo for quotation %s.',
        coalesce(nullif(v_user_name, ''), 'Customer'),
        coalesce(v_quote.quotation_number, '')
      );
    elsif v_tracking is not null then
      v_event_type := 'quotation_shipment_tracking_added';
      v_message := format(
        'Customer %s uploaded a tracking number for quotation %s.',
        coalesce(nullif(v_user_name, ''), 'Customer'),
        coalesce(v_quote.quotation_number, '')
      );
    else
      v_event_type := 'quotation_shipment_photo_uploaded';
      v_message := format(
        'Customer %s uploaded a parcel photo for quotation %s.',
        coalesce(nullif(v_user_name, ''), 'Customer'),
        coalesce(v_quote.quotation_number, '')
      );
    end if;

    insert into public.inquiry_lifecycle_notifications (
      lead_id,
      inquiry_id,
      confirmation_id,
      sender_role,
      sender_username,
      recipient_role,
      recipient_username,
      event_type,
      message
    )
    select
      li.lead_id,
      p_inquiry_id,
      null,
      'customer',
      coalesce(nullif(v_user_name, ''), 'Customer'),
      'sales_agent',
      sa.username,
      v_event_type,
      v_message
    from public.lead_inquiries li
    join public.quotations q on q.id = v_quote.id
    left join public.sales_agents sa on sa.id = q.salesperson_id
    where li.id = p_inquiry_id
      and sa.username is not null;
  exception
    when others then null;
  end;

  v_shipment_status := public._quotation_shipment_status(
    v_quote.customer_accepted_at,
    v_quote.shipment_tracking_number,
    v_quote.shipment_parcel_photo_url,
    v_quote.sent_to_customer_at
  );

  return jsonb_build_object(
    'ok', true,
    'quotation_id', v_quote.id,
    'quotation_number', v_quote.quotation_number,
    'accepted', true,
    'accepted_now', v_accepted_now,
    'had_tracking', v_had_tracking,
    'had_photo', v_had_photo,
    'shipment_status', v_shipment_status,
    'shipment_tracking_number', v_quote.shipment_tracking_number,
    'shipment_parcel_photo_url', v_quote.shipment_parcel_photo_url,
    'shipment_tracking_added_at', v_quote.shipment_tracking_added_at,
    'shipment_parcel_photo_uploaded_at', v_quote.shipment_parcel_photo_uploaded_at
  );
end;
$$;

revoke all on function public.upsert_customer_shipment_info(text, uuid, text, text, text, boolean) from public;
grant execute on function public.upsert_customer_shipment_info(text, uuid, text, text, text, boolean) to anon, authenticated;

-- -------- List customer orders (accepted quotations — no duplicates) --------
create or replace function public.list_customer_orders(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_phone text;
  v_portal jsonb;
  v_inquiry_ids uuid[];
  v_rows jsonb;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);

  select u.phone into v_phone
  from public.users u
  where u.id = v_user_id;

  if v_phone is null then
    raise exception 'unauthorized_user' using errcode = '42501';
  end if;

  v_portal := public._customer_portal_for_user_phone(v_phone);

  select coalesce(array_agg((elem->>'id')::uuid), array[]::uuid[])
  into v_inquiry_ids
  from jsonb_array_elements(coalesce(v_portal->'inquiries', '[]'::jsonb)) elem
  where nullif(elem->>'id', '') is not null;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.accepted_at desc nulls last), '[]'::jsonb)
  into v_rows
  from (
    select distinct on (q.id)
      q.id as order_id,
      q.id as quotation_id,
      q.quotation_number,
      q.linked_inquiry_id as inquiry_id,
      q.customer_name,
      q.product_service,
      q.total_amount,
      q.status as quotation_db_status,
      q.negotiation_status,
      q.sent_to_customer_at as quotation_sent_at,
      q.customer_accepted_at as accepted_at,
      q.shipment_tracking_number,
      q.shipment_tracking_added_at,
      q.shipment_parcel_photo_url,
      q.shipment_parcel_photo_uploaded_at,
      q.shipment_info_updated_at,
      q.shipment_info_updated_by,
      q.shipment_info_updated_by_role,
      sa.name as salesperson_name,
      public._quotation_shipment_status(
        q.customer_accepted_at,
        q.shipment_tracking_number,
        q.shipment_parcel_photo_url,
        q.sent_to_customer_at
      ) as shipment_status,
      q.updated_at,
      q.created_at
    from public.quotations q
    left join public.sales_agents sa on sa.id = q.salesperson_id
    where q.customer_accepted_at is not null
      and q.linked_inquiry_id = any (v_inquiry_ids)
    order by q.id, q.customer_accepted_at desc
  ) r;

  return jsonb_build_object(
    'ok', true,
    'orders', v_rows
  );
end;
$$;

revoke all on function public.list_customer_orders(text) from public;
grant execute on function public.list_customer_orders(text) to anon, authenticated;

-- -------- Get single customer order by quotation id --------
create or replace function public.get_customer_order(
  p_session_token text,
  p_quotation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_phone text;
  v_portal jsonb;
  v_inquiry_ids uuid[];
  v_row record;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);

  select u.phone into v_phone
  from public.users u
  where u.id = v_user_id;

  if v_phone is null then
    raise exception 'unauthorized_user' using errcode = '42501';
  end if;

  v_portal := public._customer_portal_for_user_phone(v_phone);

  select coalesce(array_agg((elem->>'id')::uuid), array[]::uuid[])
  into v_inquiry_ids
  from jsonb_array_elements(coalesce(v_portal->'inquiries', '[]'::jsonb)) elem
  where nullif(elem->>'id', '') is not null;

  select
    q.id as order_id,
    q.id as quotation_id,
    q.quotation_number,
    q.linked_inquiry_id as inquiry_id,
    q.customer_name,
    q.product_service,
    q.total_amount,
    q.customer_pdf_url as pdf_url,
    q.status as quotation_db_status,
    q.negotiation_status,
    q.sent_to_customer_at as quotation_sent_at,
    q.customer_accepted_at as accepted_at,
    q.shipment_tracking_number,
    q.shipment_tracking_added_at,
    q.shipment_parcel_photo_url,
    q.shipment_parcel_photo_uploaded_at,
    q.shipment_info_updated_at,
    q.shipment_info_updated_by,
    q.shipment_info_updated_by_role,
    sa.name as salesperson_name,
    public._quotation_shipment_status(
      q.customer_accepted_at,
      q.shipment_tracking_number,
      q.shipment_parcel_photo_url,
      q.sent_to_customer_at
    ) as shipment_status,
    q.updated_at,
    q.created_at
  into v_row
  from public.quotations q
  left join public.sales_agents sa on sa.id = q.salesperson_id
  where q.id = p_quotation_id
    and q.customer_accepted_at is not null
    and q.linked_inquiry_id = any (v_inquiry_ids);

  if not found then
    raise exception 'order_not_found' using errcode = '42501';
  end if;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.get_customer_order(text, uuid) from public;
grant execute on function public.get_customer_order(text, uuid) to anon, authenticated;

notify pgrst, 'reload schema';
