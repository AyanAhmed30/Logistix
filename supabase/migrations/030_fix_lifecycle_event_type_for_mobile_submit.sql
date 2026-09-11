-- 030 — Fix mobile inquiry submit: lifecycle event_type check
--
-- Symptom:
--   submit_customer_inquiry fails with:
--   new row for relation "inquiry_lifecycle_notifications" violates check constraint
--   "inquiry_lifecycle_notifications_event_type_check"
--
-- Cause:
--   extend_inquiry_lifecycle_notifications.sql adds trigger
--   trg_notify_inquiry_received_from_mobile which inserts event_type = 'inquiry_received'
--   (and sender_role = 'system'). Later migrations (019/020) rebuilt the CHECK constraint
--   without 'inquiry_received', so the trigger aborts the whole submit transaction.
--
-- Fix:
--   1) Rebuild event_type + sender_role checks with the full catalog
--   2) Harden the mobile notify trigger so notification failures never block submit

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
      'inquiry_sent',
      'inquiry_received',
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
      'customer_declined_quotation'
    ])
  ) s;

  if allowed is null or allowed = '' then
    allowed := quote_literal('inquiry_sent');
  end if;

  execute format(
    'alter table public.inquiry_lifecycle_notifications
       add constraint inquiry_lifecycle_notifications_event_type_check
       check (event_type in (%s))',
    allowed
  );
exception
  when undefined_table then null;
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
    select unnest(array[
      'sales_agent',
      'operations',
      'admin',
      'customer',
      'system'
    ])
  ) s;

  if allowed is null or allowed = '' then
    allowed := quote_literal('sales_agent');
  end if;

  execute format(
    'alter table public.inquiry_lifecycle_notifications
       add constraint inquiry_lifecycle_notifications_sender_role_check
       check (sender_role in (%s))',
    allowed
  );
exception
  when undefined_table then null;
end $$;

-- Harden trigger: never abort customer inquiry submit on notification issues
create or replace function public.notify_inquiry_received_from_mobile()
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

  begin
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
    from public.leads l
    left join public.sales_agents sa on sa.id = l.sales_agent_id
    where l.id = new.lead_id;

    if v_agent_username is null or btrim(v_agent_username) = '' then
      return new;
    end if;

    if exists (
      select 1
      from public.inquiry_lifecycle_notifications n
      where n.inquiry_id = new.id
        and n.event_type in ('inquiry_received', 'customer_submitted')
        and n.recipient_username = v_agent_username
    ) then
      return new;
    end if;

    v_summary := coalesce(
      nullif(btrim(coalesce(new.product_name, '')), ''),
      nullif(btrim(coalesce(new.description, '')), ''),
      'Inquiry'
    );
    v_href :=
      '/sales-agent/leads/'
      || new.lead_id::text
      || '?tab=view&inquiryId='
      || new.id::text;

    insert into public.inquiry_lifecycle_notifications (
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
  exception
    when undefined_column then
      begin
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
        ) values (
          new.lead_id,
          new.id,
          null,
          'system',
          'mobile',
          'sales_agent',
          v_agent_username,
          'inquiry_received',
          'A new inquiry has been received from the mobile application.'
        );
      exception
        when others then
          null;
      end;
    when others then
      null;
  end;

  return new;
end;
$$;

drop trigger if exists trg_notify_inquiry_received_from_mobile on public.lead_inquiries;

create trigger trg_notify_inquiry_received_from_mobile
after insert or update of customer_submitted
on public.lead_inquiries
for each row
execute function public.notify_inquiry_received_from_mobile();
