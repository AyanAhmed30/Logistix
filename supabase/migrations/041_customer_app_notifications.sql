-- STEP 041 — Customer app notifications (persisted, deep-linked, deduped)
-- Targets public.users (mobile customers). Staff CRM notifications stay on
-- inquiry_lifecycle_notifications. Safe to re-run (IF NOT EXISTS / CREATE OR REPLACE).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.customer_app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  lead_id uuid null references public.leads(id) on delete set null,
  inquiry_id uuid null references public.lead_inquiries(id) on delete set null,
  quotation_id uuid null,
  event_type text not null,
  title text not null,
  message text not null,
  href text not null,
  dedupe_key text not null,
  is_read boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint customer_app_notifications_dedupe_key_key unique (dedupe_key)
);

create index if not exists customer_app_notifications_user_created_idx
  on public.customer_app_notifications (user_id, created_at desc);

create index if not exists customer_app_notifications_user_unread_idx
  on public.customer_app_notifications (user_id, is_read, created_at desc)
  where is_read = false;

alter table public.customer_app_notifications enable row level security;

-- No direct client table access; session RPCs only.
revoke all on table public.customer_app_notifications from public;
revoke all on table public.customer_app_notifications from anon, authenticated;
grant all on table public.customer_app_notifications to service_role;

-- Create policy only if missing (avoids DROP, which Supabase flags as destructive).
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_app_notifications'
      and policyname = 'customer_app_notifications_service'
  ) then
    create policy customer_app_notifications_service
      on public.customer_app_notifications
      for all
      using (true)
      with check (true);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Resolve mobile users for a lead (phone match on lead / customer / contact)
-- ---------------------------------------------------------------------------
create or replace function public._customer_user_ids_for_lead(p_lead_id uuid)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_lead_id is null then
    return;
  end if;

  return query
  select distinct u.id
  from public.users u
  where exists (
    select 1
    from public.leads l
    where l.id = p_lead_id
      and public.phones_match(l.number, u.phone)
  )
  or exists (
    select 1
    from public.customers c
    where c.lead_id = p_lead_id
      and public.phones_match(c.phone_number, u.phone)
  )
  or exists (
    select 1
    from public.leads l
    join public.contacts ct on ct.id = l.contact_id
    where l.id = p_lead_id
      and (
        public.phones_match(ct.phone, u.phone)
        or public.phones_match(ct.mobile, u.phone)
      )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Insert helper (dedupe via unique key; never throws to callers)
-- ---------------------------------------------------------------------------
create or replace function public._notify_customer_app(
  p_lead_id uuid,
  p_inquiry_id uuid,
  p_quotation_id uuid,
  p_event_type text,
  p_title text,
  p_message text,
  p_href text,
  p_dedupe_key text,
  p_payload jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer := 0;
  v_user_id uuid;
begin
  if nullif(trim(coalesce(p_event_type, '')), '') is null then
    return 0;
  end if;
  if nullif(trim(coalesce(p_dedupe_key, '')), '') is null then
    return 0;
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then
    return 0;
  end if;
  if nullif(trim(coalesce(p_message, '')), '') is null then
    return 0;
  end if;
  if nullif(trim(coalesce(p_href, '')), '') is null then
    return 0;
  end if;

  for v_user_id in
    select u.user_id from public._customer_user_ids_for_lead(p_lead_id) u
  loop
    begin
      insert into public.customer_app_notifications (
        user_id,
        lead_id,
        inquiry_id,
        quotation_id,
        event_type,
        title,
        message,
        href,
        dedupe_key,
        payload
      ) values (
        v_user_id,
        p_lead_id,
        p_inquiry_id,
        p_quotation_id,
        trim(p_event_type),
        trim(p_title),
        trim(p_message),
        trim(p_href),
        trim(p_dedupe_key) || ':' || v_user_id::text,
        coalesce(p_payload, '{}'::jsonb)
      );
      v_count := v_count + 1;
    exception
      when unique_violation then
        null;
      when others then
        null;
    end;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Customer RPCs (session token)
-- ---------------------------------------------------------------------------
create or replace function public.list_customer_notifications(
  p_session_token text,
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_limit integer;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);
  if v_user_id is null then
    raise exception 'invalid_session';
  end if;

  v_limit := greatest(1, least(coalesce(p_limit, 50), 100));

  return coalesce(
    (
      select jsonb_agg(to_jsonb(x) order by x.created_at desc)
      from (
        select
          n.id,
          n.event_type,
          n.title,
          n.message,
          n.href,
          n.is_read,
          n.inquiry_id,
          n.quotation_id,
          n.lead_id,
          n.payload,
          n.created_at
        from public.customer_app_notifications n
        where n.user_id = v_user_id
        order by n.created_at desc
        limit v_limit
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_customer_unread_notification_count(
  p_session_token text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_count integer;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);
  if v_user_id is null then
    raise exception 'invalid_session';
  end if;

  select count(*)::integer into v_count
  from public.customer_app_notifications n
  where n.user_id = v_user_id
    and n.is_read = false;

  return coalesce(v_count, 0);
end;
$$;

create or replace function public.mark_customer_notification_read(
  p_session_token text,
  p_notification_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);
  if v_user_id is null then
    raise exception 'invalid_session';
  end if;

  update public.customer_app_notifications n
  set is_read = true
  where n.id = p_notification_id
    and n.user_id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.mark_all_customer_notifications_read(
  p_session_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_updated integer;
begin
  v_user_id := public._resolve_session_user_id(p_session_token);
  if v_user_id is null then
    raise exception 'invalid_session';
  end if;

  update public.customer_app_notifications n
  set is_read = true
  where n.user_id = v_user_id
    and n.is_read = false;

  get diagnostics v_updated = row_count;
  return jsonb_build_object('ok', true, 'updated', v_updated);
end;
$$;

revoke all on function public.list_customer_notifications(text, integer) from public;
revoke all on function public.get_customer_unread_notification_count(text) from public;
revoke all on function public.mark_customer_notification_read(text, uuid) from public;
revoke all on function public.mark_all_customer_notifications_read(text) from public;

grant execute on function public.list_customer_notifications(text, integer) to anon, authenticated;
grant execute on function public.get_customer_unread_notification_count(text) to anon, authenticated;
grant execute on function public.mark_customer_notification_read(text, uuid) to anon, authenticated;
grant execute on function public.mark_all_customer_notifications_read(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1) Inquiry submitted by customer
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_inquiry_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_was_submitted boolean;
  v_now_submitted boolean;
begin
  v_was_submitted := coalesce(TG_OP = 'UPDATE' and OLD.customer_submitted, false);
  v_now_submitted := coalesce(NEW.customer_submitted, false)
    or (
      lower(coalesce(NEW.status, '')) <> 'draft'
      and coalesce(NEW.customer_submitted, false)
    );

  if not v_now_submitted then
    return NEW;
  end if;

  -- Fire when newly submitted (insert submitted, or draft → submitted)
  if TG_OP = 'INSERT' and v_now_submitted then
    null;
  elsif TG_OP = 'UPDATE' and v_now_submitted and not v_was_submitted then
    null;
  elsif TG_OP = 'UPDATE'
    and lower(coalesce(OLD.status, '')) = 'draft'
    and lower(coalesce(NEW.status, '')) <> 'draft'
    and coalesce(NEW.customer_submitted, false)
  then
    null;
  else
    return NEW;
  end if;

  perform public._notify_customer_app(
    NEW.lead_id,
    NEW.id,
    null,
    'inquiry_submitted',
    'Inquiry submitted',
    'Your inquiry has been submitted successfully. Our team will review it and update you shortly.',
    '/(tabs)/inquiries/' || NEW.id::text,
    'inquiry_submitted:' || NEW.id::text,
    jsonb_build_object('product_name', NEW.product_name)
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

create or replace trigger trg_customer_notify_inquiry_submitted
  after insert or update of customer_submitted, status
  on public.lead_inquiries
  for each row
  execute function public.trg_customer_notify_inquiry_submitted();

-- ---------------------------------------------------------------------------
-- 2) Operations → Admin (from staff lifecycle notification)
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_ops_to_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.event_type is distinct from 'sent_for_admin_approval' then
    return NEW;
  end if;

  perform public._notify_customer_app(
    NEW.lead_id,
    NEW.inquiry_id,
    null,
    'inquiry_with_admin',
    'Inquiry in progress',
    'Your inquiry is now being processed by our team. We’ll keep you updated on the next steps.',
    case
      when NEW.inquiry_id is not null then '/(tabs)/inquiries/' || NEW.inquiry_id::text
      else '/(tabs)/inquiries'
    end,
    'inquiry_with_admin:' || coalesce(NEW.inquiry_id::text, NEW.confirmation_id::text, NEW.id::text),
    jsonb_build_object('confirmation_id', NEW.confirmation_id)
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

create or replace trigger trg_customer_notify_ops_to_admin
  after insert
  on public.inquiry_lifecycle_notifications
  for each row
  execute function public.trg_customer_notify_ops_to_admin();

-- ---------------------------------------------------------------------------
-- 3) Quotation sent / resent to customer
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_quotation_sent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_inquiry_id uuid;
  v_href text;
  v_dedupe text;
begin
  if NEW.sent_to_customer_at is null then
    return NEW;
  end if;

  if TG_OP = 'UPDATE'
    and OLD.sent_to_customer_at is not null
    and OLD.sent_to_customer_at is not distinct from NEW.sent_to_customer_at
  then
    return NEW;
  end if;

  v_inquiry_id := NEW.linked_inquiry_id;
  if v_inquiry_id is not null then
    select li.lead_id into v_lead_id
    from public.lead_inquiries li
    where li.id = v_inquiry_id;
  end if;

  if v_lead_id is null then
    return NEW;
  end if;

  v_href := case
    when v_inquiry_id is not null then '/(tabs)/inquiries/' || v_inquiry_id::text || '/quote'
    else '/(tabs)/inquiries'
  end;

  v_dedupe := 'quotation_sent:' || NEW.id::text || ':' || NEW.sent_to_customer_at::text;

  perform public._notify_customer_app(
    v_lead_id,
    v_inquiry_id,
    NEW.id,
    'quotation_sent',
    'Quotation ready',
    'Your quotation is ready. Tap to review the details.',
    v_href,
    v_dedupe,
    jsonb_build_object(
      'quotation_number', NEW.quotation_number,
      'total_amount', NEW.total_amount
    )
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

create or replace trigger trg_customer_notify_quotation_sent
  after insert or update of sent_to_customer_at
  on public.quotations
  for each row
  execute function public.trg_customer_notify_quotation_sent();

-- ---------------------------------------------------------------------------
-- 4–6) Tracking / photo / warehouse (sales-side shipment updates)
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_shipment_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead_id uuid;
  v_inquiry_id uuid;
  v_order_href text;
  v_docs_href text;
  v_had_tracking boolean;
  v_has_tracking boolean;
  v_had_photo boolean;
  v_has_photo boolean;
  v_actor text;
begin
  if NEW.customer_accepted_at is null then
    return NEW;
  end if;

  v_inquiry_id := NEW.linked_inquiry_id;
  if v_inquiry_id is not null then
    select li.lead_id into v_lead_id
    from public.lead_inquiries li
    where li.id = v_inquiry_id;
  end if;
  if v_lead_id is null then
    return NEW;
  end if;

  v_actor := lower(coalesce(NEW.shipment_info_updated_by_role, ''));
  -- Only notify when sales (or system/staff) updates — not when customer uploads.
  if v_actor = 'customer' then
    return NEW;
  end if;

  v_had_tracking := nullif(trim(coalesce(OLD.shipment_tracking_number, '')), '') is not null;
  v_has_tracking := nullif(trim(coalesce(NEW.shipment_tracking_number, '')), '') is not null;
  v_had_photo := nullif(trim(coalesce(OLD.shipment_parcel_photo_url, '')), '') is not null;
  v_has_photo := nullif(trim(coalesce(NEW.shipment_parcel_photo_url, '')), '') is not null;

  v_order_href := '/(tabs)/orders/' || NEW.id::text;
  v_docs_href := case
    when v_inquiry_id is not null then
      '/(tabs)/profile/documents/' || v_inquiry_id::text || '?source=inquiry'
    else
      '/(tabs)/profile/documents/' || NEW.id::text || '?source=order'
  end;

  -- Tracking newly available or changed by sales
  if v_has_tracking and (
    not v_had_tracking
    or coalesce(OLD.shipment_tracking_number, '') is distinct from coalesce(NEW.shipment_tracking_number, '')
  ) then
    perform public._notify_customer_app(
      v_lead_id,
      v_inquiry_id,
      NEW.id,
      'tracking_available',
      'Tracking available',
      'Your shipment tracking information is now available. Tap to view your order status.',
      v_order_href,
      'tracking_available:' || NEW.id::text || ':' || left(coalesce(NEW.shipment_tracking_number, ''), 80),
      jsonb_build_object('tracking_number', NEW.shipment_tracking_number)
    );
  end if;

  -- Parcel photo newly available
  if v_has_photo and not v_had_photo then
    perform public._notify_customer_app(
      v_lead_id,
      v_inquiry_id,
      NEW.id,
      'shipment_photo_added',
      'Shipment photos added',
      'New shipment photos have been added to your order. Tap to view them.',
      v_docs_href,
      'shipment_photo_added:' || NEW.id::text,
      jsonb_build_object('photo_url', NEW.shipment_parcel_photo_url)
    );
  end if;

  -- Warehouse: first time both tracking + photo are present
  if v_has_tracking and v_has_photo and (not v_had_tracking or not v_had_photo) then
    perform public._notify_customer_app(
      v_lead_id,
      v_inquiry_id,
      NEW.id,
      'warehouse_received',
      'Received at warehouse',
      'Your order has been received at our warehouse and is now being processed.',
      v_order_href,
      'warehouse_received:' || NEW.id::text,
      jsonb_build_object(
        'tracking_number', NEW.shipment_tracking_number,
        'has_photo', true
      )
    );
  end if;

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

create or replace trigger trg_customer_notify_shipment_updates
  after update of
    shipment_tracking_number,
    shipment_parcel_photo_url,
    shipment_info_updated_by_role,
    customer_accepted_at
  on public.quotations
  for each row
  execute function public.trg_customer_notify_shipment_updates();

-- ---------------------------------------------------------------------------
-- 7) Rate approved → customer (optional status clarity)
-- ---------------------------------------------------------------------------
create or replace function public.trg_customer_notify_rate_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if NEW.event_type is distinct from 'approved' then
    return NEW;
  end if;

  perform public._notify_customer_app(
    NEW.lead_id,
    NEW.inquiry_id,
    null,
    'rate_approved',
    'Request confirmed',
    'Your request has been confirmed by our team. A quotation will follow shortly.',
    case
      when NEW.inquiry_id is not null then '/(tabs)/inquiries/' || NEW.inquiry_id::text
      else '/(tabs)/inquiries'
    end,
    'rate_approved:' || coalesce(NEW.inquiry_id::text, NEW.confirmation_id::text, NEW.id::text),
    '{}'::jsonb
  );

  return NEW;
exception
  when others then
    return NEW;
end;
$$;

create or replace trigger trg_customer_notify_rate_approved
  after insert
  on public.inquiry_lifecycle_notifications
  for each row
  execute function public.trg_customer_notify_rate_approved();
