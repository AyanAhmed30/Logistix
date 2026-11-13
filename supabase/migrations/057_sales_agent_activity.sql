-- =============================================================================
-- 057 — Sales agent activity logging and daily check-in / end-of-day reports
--
-- What it does
--   1. sales_agent_sessions: one row per Sales Agent login (start, last real
--      activity, active seconds, end time and reason).
--   2. sales_agent_session_events: login, became inactive, active again,
--      manual logout and session expiry, with the server's timestamps.
--   3. sales_agent_day_checkins: the Start Day check-in (one per agent per day).
--   4. daily_work_reports (from 052) gets one column, support_request, for the
--      End Day "support needed from Admin" answer. End Day reports use that
--      existing table.
--   5. inquiry_lifecycle_notifications: four new event types so Admin is
--      notified through the existing bell.
--
-- Safe to run
--   Additive and idempotent. No existing row is changed or deleted. All tables
--   are closed to everything except the service role (the app checks access in
--   its server actions); timestamps are written by the server only.
-- =============================================================================

-- ---------- 1. Login sessions ----------
create table if not exists public.sales_agent_sessions (
  id uuid primary key default gen_random_uuid(),
  sales_agent_id uuid not null references public.sales_agents(id) on delete cascade,
  app_user_id uuid references public.app_users(id) on delete set null,
  username text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  active_seconds integer not null default 0 check (active_seconds >= 0),
  ended_at timestamptz,
  end_reason text check (end_reason in ('logout', 'inactivity')),
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists sales_agent_sessions_agent_start_idx
  on public.sales_agent_sessions (sales_agent_id, started_at desc);
create index if not exists sales_agent_sessions_org_start_idx
  on public.sales_agent_sessions (organization_id, started_at desc);
create index if not exists sales_agent_sessions_open_idx
  on public.sales_agent_sessions (last_activity_at)
  where ended_at is null;

-- ---------- 2. Session events ----------
create table if not exists public.sales_agent_session_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sales_agent_sessions(id) on delete cascade,
  sales_agent_id uuid not null references public.sales_agents(id) on delete cascade,
  event_type text not null
    check (event_type in ('login', 'inactive', 'active', 'logout', 'expired')),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_agent_session_events_agent_time_idx
  on public.sales_agent_session_events (sales_agent_id, occurred_at);
create index if not exists sales_agent_session_events_session_idx
  on public.sales_agent_session_events (session_id, occurred_at);

-- ---------- 3. Start Day check-ins ----------
create table if not exists public.sales_agent_day_checkins (
  id uuid primary key default gen_random_uuid(),
  sales_agent_id uuid not null references public.sales_agents(id) on delete cascade,
  app_user_id uuid references public.app_users(id) on delete set null,
  username text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  -- Working day in Pakistan time.
  work_date date not null,
  submitted_at timestamptz not null default now(),
  internet_ok boolean not null,
  previous_tasks text not null check (previous_tasks in ('yes', 'no', 'partial')),
  has_issue boolean not null default false,
  issue_text text,
  created_at timestamptz not null default now()
);

-- One Start Day per agent per working day.
create unique index if not exists sales_agent_day_checkins_one_per_day
  on public.sales_agent_day_checkins (sales_agent_id, work_date);
create index if not exists sales_agent_day_checkins_org_date_idx
  on public.sales_agent_day_checkins (organization_id, work_date desc);

-- ---------- 4. End Day: support request on the existing report ----------
alter table public.daily_work_reports
  add column if not exists support_request text not null default '';

-- ---------- Access: service role only ----------
alter table public.sales_agent_sessions enable row level security;
alter table public.sales_agent_session_events enable row level security;
alter table public.sales_agent_day_checkins enable row level security;
revoke all on table public.sales_agent_sessions from anon, authenticated;
revoke all on table public.sales_agent_session_events from anon, authenticated;
revoke all on table public.sales_agent_day_checkins from anon, authenticated;
grant all on table public.sales_agent_sessions to service_role;
grant all on table public.sales_agent_session_events to service_role;
grant all on table public.sales_agent_day_checkins to service_role;

-- ---------- 5. Notifications: Admin learns about Start Day / End Day ----------
do $$
declare
  allowed text;
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'inquiry_lifecycle_notifications'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%event_type%'
  loop
    execute format(
      'alter table public.inquiry_lifecycle_notifications drop constraint if exists %I',
      con.conname
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
      'quotation_shipment_info_added_by_sales',
      'leads_assigned',
      'agent_day_started',
      'agent_day_ended',
      'agent_issue_reported',
      'agent_support_requested'
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

notify pgrst, 'reload schema';
