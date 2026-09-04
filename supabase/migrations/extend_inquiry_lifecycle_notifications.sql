-- =====================================================
-- Extend inquiry lifecycle notifications for a persistent,
-- user-specific inbox with deep links and mobile receive events.
-- =====================================================

alter table inquiry_lifecycle_notifications
  add column if not exists title text;

alter table inquiry_lifecycle_notifications
  add column if not exists href text;

alter table inquiry_lifecycle_notifications
  add column if not exists payload jsonb not null default '{}'::jsonb;

-- Rebuild checks from (existing distinct values ∪ new catalog types).
-- A fixed IN (...) list fails on live data that already contains extra event types
-- such as quotation_counter_offer / quotation_sent_to_customer.
do $$
declare
  rec record;
  allowed text;
begin
  update public.inquiry_lifecycle_notifications
  set event_type = btrim(event_type)
  where event_type is distinct from btrim(event_type);

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
      'quotation_sent_to_customer',
      'quotation_counter_offer'
    ])
  ) s;

  execute format(
    'alter table public.inquiry_lifecycle_notifications
       add constraint inquiry_lifecycle_notifications_event_type_check
       check (event_type in (%s))',
    allowed
  );
end $$;

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
      and pg_get_constraintdef(con.oid) ilike '%sender_role%'
  loop
    execute format(
      'alter table public.inquiry_lifecycle_notifications drop constraint if exists %I',
      rec.conname
    );
  end loop;

  select string_agg(quote_literal(val), ', ' order by val)
  into allowed
  from (
    select distinct btrim(sender_role) as val
    from public.inquiry_lifecycle_notifications
    where sender_role is not null
      and btrim(sender_role) <> ''
    union
    select unnest(array['sales_agent', 'operations', 'admin', 'system'])
  ) s;

  execute format(
    'alter table public.inquiry_lifecycle_notifications
       add constraint inquiry_lifecycle_notifications_sender_role_check
       check (sender_role in (%s))',
    allowed
  );
end $$;

create index if not exists idx_inquiry_lifecycle_notifications_inquiry_event
  on inquiry_lifecycle_notifications (inquiry_id, event_type, recipient_username);

create index if not exists idx_inquiry_lifecycle_notifications_unread
  on inquiry_lifecycle_notifications (recipient_username, recipient_role, is_read, created_at desc);

-- Notify the assigned sales agent when a mobile/customer inquiry arrives.
create or replace function notify_inquiry_received_from_mobile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agent_username text;
  v_lead_number text;
  v_customer_name text;
  v_source text;
  v_summary text;
  v_href text;
begin
  if new.customer_submitted is not true then
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.customer_submitted, false) is true then
    return new;
  end if;

  select
    sa.username,
    l.lead_id_formatted,
    l.name,
    l.source
  into
    v_agent_username,
    v_lead_number,
    v_customer_name,
    v_source
  from leads l
  left join sales_agents sa on sa.id = l.sales_agent_id
  where l.id = new.lead_id;

  if v_agent_username is null or btrim(v_agent_username) = '' then
    return new;
  end if;

  if exists (
    select 1
    from inquiry_lifecycle_notifications n
    where n.inquiry_id = new.id
      and n.event_type = 'inquiry_received'
      and n.recipient_username = v_agent_username
  ) then
    return new;
  end if;

  v_summary := coalesce(nullif(btrim(coalesce(new.product_name, '')), ''), nullif(btrim(coalesce(new.description, '')), ''), 'Inquiry');
  v_href := '/sales-agent/leads/' || new.lead_id::text || '?tab=view&inquiryId=' || new.id::text;

  insert into inquiry_lifecycle_notifications (
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
  ) values (
    new.lead_id,
    new.id,
    null,
    'system',
    'mobile',
    'sales_agent',
    v_agent_username,
    'inquiry_received',
    'New Inquiry Received',
    'A new inquiry has been received from the mobile application.',
    v_href,
    jsonb_build_object(
      'leadId', new.lead_id,
      'inquiryId', new.id,
      'inquiryNumber', coalesce(v_lead_number, ''),
      'customerName', coalesce(v_customer_name, ''),
      'source', coalesce(nullif(btrim(coalesce(v_source, '')), ''), 'mobile'),
      'summary', v_summary,
      'origin', 'mobile'
    )
  );

  return new;
end;
$$;

drop trigger if exists trg_notify_inquiry_received_from_mobile on lead_inquiries;

create trigger trg_notify_inquiry_received_from_mobile
after insert or update of customer_submitted
on lead_inquiries
for each row
execute function notify_inquiry_received_from_mobile();
