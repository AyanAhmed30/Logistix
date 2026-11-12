-- =============================================================================
-- 056 — Lead Distribution
--
-- What it does
--   1. New table public.lead_distribution_leads: leads uploaded by Admin from
--      Excel/CSV, waiting to be assigned to a Sales Agent. When a lead is
--      assigned, the app creates (or reuses) the contact and its CRM opportunity
--      in the "New" stage, and records them here.
--   2. inquiry_lifecycle_notifications: allows one notification that is not tied
--      to a single legacy lead ("Admin assigned 40 new leads to you"):
--        - lead_id becomes optional (existing rows are untouched),
--        - event type 'leads_assigned' is added to the allowed list.
--
-- Safe to run
--   Additive only and idempotent: it can be run more than once. No existing
--   rows are changed or deleted. The event-type list is rebuilt from the values
--   already in the table plus the known catalog, the same way migration 038 did.
-- =============================================================================

-- ---------- 1. Staging table for uploaded leads ----------
create table if not exists public.lead_distribution_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  batch_id uuid not null,
  file_name text,
  row_number integer,

  name text not null,
  phone text,
  -- Last 10 digits of the phone, used to find duplicates.
  phone_key text,
  email text,
  company_name text,
  country text,
  city text,
  -- Any other columns from the file, as { "Column": "value" }.
  extra jsonb not null default '{}'::jsonb,

  status text not null default 'unassigned'
    check (status in ('unassigned', 'assigned')),
  assigned_sales_agent_id uuid references public.sales_agents(id) on delete set null,
  assigned_at timestamptz,
  assigned_by text,
  contact_id uuid references public.contacts(id) on delete set null,
  opportunity_id uuid references public.crm_opportunities(id) on delete set null,

  imported_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_distribution_leads_org_status_idx
  on public.lead_distribution_leads (organization_id, status, created_at desc);
create index if not exists lead_distribution_leads_org_agent_idx
  on public.lead_distribution_leads (organization_id, assigned_sales_agent_id);
create index if not exists lead_distribution_leads_contact_idx
  on public.lead_distribution_leads (contact_id);

-- The same phone can be uploaded only once per company.
create unique index if not exists lead_distribution_leads_org_phone_key_uniq
  on public.lead_distribution_leads (organization_id, phone_key)
  where phone_key is not null;

alter table public.lead_distribution_leads enable row level security;
revoke all on table public.lead_distribution_leads from anon, authenticated;
grant select, insert, update, delete on table public.lead_distribution_leads to service_role;

-- ---------- 2. Notifications: allow "leads assigned" ----------
alter table public.inquiry_lifecycle_notifications
  alter column lead_id drop not null;

do $$
declare
  allowed text;
  con record;
begin
  -- Drop the current event-type check (its name may vary between databases).
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
      'alter table public.inquiry_lifecycle_notifications drop constraint %I',
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
      'leads_assigned'
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
