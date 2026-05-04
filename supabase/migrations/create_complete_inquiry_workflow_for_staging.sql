-- =====================================================
-- Complete Inquiry Workflow Schema for Staging / Testing
-- Purpose:
--   One-file setup for the complete inquiry workflow:
--   Sales Agent Lead -> Lead Inquiry -> Operations Confirmation
--   -> Admin Approval/Rejection -> Sales Agent Status/Rate View.
--
-- Notes:
--   - Safe to run multiple times.
--   - This includes the required lead/sales-agent prerequisites because
--     inquiry tables depend on leads, and leads depend on sales_agents.
--   - This does not create the whole ERP schema. It is focused on the
--     inquiry workflow only.
-- =====================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Inquiry image/document uploads use the `inquiry-images` storage bucket.
-- Supabase projects include the `storage` schema by default.
insert into storage.buckets (id, name, public)
values ('inquiry-images', 'inquiry-images', true)
on conflict (id) do update
set public = excluded.public;

-- =====================================================
-- Auth prerequisites used by the portals
-- =====================================================

create table if not exists public.app_users (
  id uuid default gen_random_uuid() primary key,
  username text unique not null,
  password text not null,
  role text not null default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_app_users_username on public.app_users(username);
create index if not exists idx_app_users_role on public.app_users(role);

alter table public.app_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'app_users'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.app_users for all using (true) with check (true)';
  end if;
end $$;

create table if not exists public.operations_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  password text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_operations_users_username on public.operations_users(username);

-- =====================================================
-- Sales Agents prerequisite
-- =====================================================

create table if not exists public.sales_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone_number text,
  username text,
  password text,
  permissions jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sales_agents_username_key'
      and conrelid = 'public.sales_agents'::regclass
  ) then
    alter table public.sales_agents
      add constraint sales_agents_username_key unique (username);
  end if;
end $$;

create index if not exists idx_sales_agents_email on public.sales_agents(email);
create index if not exists idx_sales_agents_username on public.sales_agents(username);
create index if not exists idx_sales_agents_created_at on public.sales_agents(created_at desc);
create index if not exists idx_sales_agents_permissions on public.sales_agents using gin(permissions);

alter table public.sales_agents enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'sales_agents'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.sales_agents for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Leads prerequisite + pipeline support
-- =====================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_id_formatted text,
  name text not null default '',
  number text not null,
  source text not null check (source in ('Meta', 'LinkedIn', 'WhatsApp', 'Others')),
  status text not null default 'Leads',
  sales_agent_id uuid not null references public.sales_agents(id) on delete cascade,
  created_by_sales_agent_id uuid references public.sales_agents(id) on delete set null,
  transferred_from_sales_agent_id uuid references public.sales_agents(id) on delete set null,
  transferred_at timestamptz,
  converted boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_lead_id_formatted_key'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_lead_id_formatted_key unique (lead_id_formatted);
  end if;
end $$;

alter table public.leads
  drop constraint if exists leads_status_check;

alter table public.leads
  add constraint leads_status_check
  check (status in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose'));

update public.leads
set status = 'Leads'
where status is null
   or status = ''
   or status not in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose');

update public.leads
set created_by_sales_agent_id = sales_agent_id
where created_by_sales_agent_id is null;

create index if not exists idx_leads_sales_agent_id on public.leads(sales_agent_id);
create index if not exists idx_leads_created_by_sales_agent_id on public.leads(created_by_sales_agent_id);
create index if not exists idx_leads_transferred_from_sales_agent_id on public.leads(transferred_from_sales_agent_id);
create index if not exists idx_leads_transferred_at on public.leads(transferred_at desc);
create index if not exists idx_leads_created_at on public.leads(created_at desc);
create index if not exists idx_leads_source on public.leads(source);
create index if not exists idx_leads_status on public.leads(status);
create index if not exists idx_leads_lead_id_formatted on public.leads(lead_id_formatted);
create index if not exists idx_leads_search_name_trgm on public.leads using gin (name gin_trgm_ops);
create index if not exists idx_leads_search_number_trgm on public.leads using gin (number gin_trgm_ops);
create index if not exists idx_leads_search_source_trgm on public.leads using gin (source gin_trgm_ops);
create index if not exists idx_leads_search_formatted_trgm on public.leads using gin (lead_id_formatted gin_trgm_ops);

alter table public.leads enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'leads'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.leads for all using (true) with check (true)';
  end if;
end $$;

-- Lead comments
create table if not exists public.lead_comments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  comment text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_lead_comments_lead_id on public.lead_comments(lead_id);
create index if not exists idx_lead_comments_created_at on public.lead_comments(created_at desc);

alter table public.lead_comments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_comments'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.lead_comments for all using (true) with check (true)';
  end if;
end $$;

-- Lead transfer history
create table if not exists public.lead_transfers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  from_sales_agent_id uuid not null references public.sales_agents(id) on delete restrict,
  to_sales_agent_id uuid not null references public.sales_agents(id) on delete restrict,
  status_before_transfer text not null check (status_before_transfer in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose')),
  lead_id_formatted_snapshot text,
  lead_name_snapshot text not null,
  lead_number_snapshot text not null,
  lead_source_snapshot text not null check (lead_source_snapshot in ('Meta', 'LinkedIn', 'WhatsApp', 'Others')),
  transferred_at timestamptz not null default now(),
  constraint lead_transfers_agents_must_differ check (from_sales_agent_id <> to_sales_agent_id)
);

create index if not exists idx_lead_transfers_from_sales_agent_id on public.lead_transfers(from_sales_agent_id, transferred_at desc);
create index if not exists idx_lead_transfers_to_sales_agent_id on public.lead_transfers(to_sales_agent_id, transferred_at desc);
create index if not exists idx_lead_transfers_lead_id on public.lead_transfers(lead_id, transferred_at desc);

alter table public.lead_transfers enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_transfers'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.lead_transfers for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Lead Inquiries
-- =====================================================

create table if not exists public.lead_inquiries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  inquiry_group_id uuid default gen_random_uuid(),
  version_number integer not null default 1,
  is_current_version boolean not null default true,
  description text not null default '',
  image_url text,
  additional_image_urls jsonb not null default '[]'::jsonb,
  link_url text,
  product_name text default '',
  total_weight text default '',
  cbm text default '',
  quantity text default '',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'quotation_sent', 'completed')),
  sent_to_accounting boolean not null default false,
  sent_to_operations boolean not null default false,
  sent_at timestamptz,
  approval_status text not null default 'draft',
  approved_at timestamptz null,
  calculator_values jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.lead_inquiries
  add column if not exists inquiry_group_id uuid default gen_random_uuid(),
  add column if not exists version_number integer not null default 1,
  add column if not exists is_current_version boolean not null default true,
  add column if not exists additional_image_urls jsonb not null default '[]'::jsonb,
  add column if not exists product_name text default '',
  add column if not exists total_weight text default '',
  add column if not exists cbm text default '',
  add column if not exists quantity text default '',
  add column if not exists sent_to_operations boolean not null default false,
  add column if not exists approval_status text,
  add column if not exists approved_at timestamptz null,
  add column if not exists calculator_values jsonb not null default '{}'::jsonb;

alter table public.lead_inquiries
  alter column approval_status set default 'draft';

update public.lead_inquiries
set approval_status = coalesce(approval_status, 'draft')
where approval_status is null;

alter table public.lead_inquiries
  alter column approval_status set not null;

alter table public.lead_inquiries
  drop constraint if exists lead_inquiries_approval_status_check;

alter table public.lead_inquiries
  add constraint lead_inquiries_approval_status_check
  check (approval_status in ('draft', 'sent', 'approved', 'rejected'));

update public.lead_inquiries
set sent_to_operations = true
where sent_to_accounting = true;

update public.lead_inquiries
set approval_status = case
  when sent_to_accounting = false then 'draft'
  when approval_status = 'approved' then 'approved'
  when approval_status = 'rejected' then 'rejected'
  else 'sent'
end,
approved_at = case
  when approval_status = 'approved' then approved_at
  else null
end
where
  approval_status is distinct from (
    case
      when sent_to_accounting = false then 'draft'
      when approval_status = 'approved' then 'approved'
      when approval_status = 'rejected' then 'rejected'
      else 'sent'
    end
  )
  or (
    approval_status <> 'approved'
    and approved_at is not null
  );

create index if not exists idx_lead_inquiries_lead_id on public.lead_inquiries(lead_id);
create index if not exists idx_lead_inquiries_status on public.lead_inquiries(status);
create index if not exists idx_lead_inquiries_sent_to_accounting on public.lead_inquiries(sent_to_accounting);
create index if not exists idx_lead_inquiries_approval_status on public.lead_inquiries(lead_id, approval_status, approved_at desc);
create index if not exists idx_lead_inquiries_group_version on public.lead_inquiries(lead_id, inquiry_group_id, version_number desc);
create index if not exists idx_lead_inquiries_current_version on public.lead_inquiries(lead_id, is_current_version, updated_at desc);
create index if not exists idx_lead_inquiries_ops_feed on public.lead_inquiries(sent_to_accounting, sent_at desc, id);
create index if not exists idx_lead_inquiries_search_product_name_trgm on public.lead_inquiries using gin (product_name gin_trgm_ops);
create index if not exists idx_lead_inquiries_search_description_trgm on public.lead_inquiries using gin (description gin_trgm_ops);

alter table public.lead_inquiries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_inquiries'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.lead_inquiries for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Inquiry Logs
-- =====================================================

create table if not exists public.inquiry_logs (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.lead_inquiries(id) on delete cascade,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  performed_by text not null,
  performed_at timestamptz default now()
);

create index if not exists idx_inquiry_logs_inquiry_performed
  on public.inquiry_logs(inquiry_id, performed_at desc);

-- =====================================================
-- Inquiry Quotations
-- =====================================================

create table if not exists public.inquiry_quotations (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.lead_inquiries(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  quotation_number text not null,
  customer_name text not null,
  product_service text not null,
  quantity numeric(10, 2) not null default 0,
  unit_price numeric(10, 2) not null default 0,
  total_amount numeric(10, 2) not null default 0,
  notes text,
  created_by text not null,
  sent_to_client boolean not null default false,
  sent_to_client_at timestamptz,
  sent_to_agent boolean not null default false,
  sent_to_agent_at timestamptz,
  version integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_inquiry_quotations_inquiry_id on public.inquiry_quotations(inquiry_id);
create index if not exists idx_inquiry_quotations_lead_id on public.inquiry_quotations(lead_id);
create index if not exists idx_inquiry_quotations_created_at on public.inquiry_quotations(created_at desc);

alter table public.inquiry_quotations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiry_quotations'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.inquiry_quotations for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Inquiry Confirmations
-- =====================================================

create table if not exists public.inquiry_confirmations (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references public.lead_inquiries(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  lead_number text not null,
  product_name text not null default '',
  total_weight text default '',
  cbm text default '',
  quantity text default '',
  hs_code text default '',
  calculator_values jsonb not null default '{}'::jsonb,
  original_image_url text,
  additional_image_1_url text,
  additional_image_2_url text,
  sales_additional_image_urls jsonb not null default '[]'::jsonb,
  rejection_reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by text not null default '',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.inquiry_confirmations
  add column if not exists hs_code text default '',
  add column if not exists calculator_values jsonb not null default '{}'::jsonb,
  add column if not exists sales_additional_image_urls jsonb not null default '[]'::jsonb,
  add column if not exists rejection_reason text;

create index if not exists idx_inquiry_confirmations_inquiry_id on public.inquiry_confirmations(inquiry_id);
create index if not exists idx_inquiry_confirmations_lead_id on public.inquiry_confirmations(lead_id);
create index if not exists idx_inquiry_confirmations_status on public.inquiry_confirmations(status);
create index if not exists idx_inquiry_confirmations_lead_number on public.inquiry_confirmations(lead_number);
create index if not exists idx_inquiry_confirmations_inquiry_created on public.inquiry_confirmations(inquiry_id, created_at desc);

alter table public.inquiry_confirmations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiry_confirmations'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.inquiry_confirmations for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Lead Activity Logs
-- =====================================================

create table if not exists public.lead_activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  inquiry_id uuid null references public.lead_inquiries(id) on delete set null,
  inquiry_version integer null,
  action_type text not null check (
    action_type in (
      'lead_created',
      'lead_updated',
      'inquiry_created_draft',
      'inquiry_edited',
      'inquiry_sent',
      'inquiry_resent',
      'inquiry_viewed',
      'inquiry_status_changed'
    )
  ),
  action_label text not null,
  metadata jsonb null,
  previous_values jsonb null,
  new_values jsonb null,
  performed_by text not null,
  performed_at timestamptz not null default now()
);

create index if not exists idx_lead_activity_logs_lead_performed on public.lead_activity_logs(lead_id, performed_at desc);
create index if not exists idx_lead_activity_logs_inquiry on public.lead_activity_logs(inquiry_id, performed_at desc);

alter table public.lead_activity_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_activity_logs'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.lead_activity_logs for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Inquiry Calculator Shared Config
-- =====================================================

create table if not exists public.inquiry_calculator_config (
  id text primary key,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.inquiry_calculator_config (id, values)
values ('shared', '{}'::jsonb)
on conflict (id) do nothing;

-- =====================================================
-- Lead Chat
-- =====================================================

create table if not exists public.lead_chat_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  message text not null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_chat_messages_lead_id_created_at
  on public.lead_chat_messages(lead_id, created_at asc);

alter table public.lead_chat_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_chat_messages'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.lead_chat_messages for all using (true) with check (true)';
  end if;
end $$;

create table if not exists public.lead_chat_notifications (
  id uuid primary key default gen_random_uuid(),
  chat_message_id uuid not null references public.lead_chat_messages(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_chat_notifications_recipient
  on public.lead_chat_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table public.lead_chat_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_chat_notifications'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.lead_chat_notifications for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Inquiry Lifecycle Notifications
-- =====================================================

create table if not exists public.inquiry_lifecycle_notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  inquiry_id uuid null references public.lead_inquiries(id) on delete set null,
  confirmation_id uuid null references public.inquiry_confirmations(id) on delete set null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  event_type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.inquiry_lifecycle_notifications
  drop constraint if exists inquiry_lifecycle_notifications_event_type_check;

alter table public.inquiry_lifecycle_notifications
  add constraint inquiry_lifecycle_notifications_event_type_check
  check (
    event_type in (
      'inquiry_sent',
      'sent_for_admin_approval',
      'approved',
      'rejected',
      'lead_transferred'
    )
  );

create index if not exists idx_inquiry_lifecycle_notifications_recipient
  on public.inquiry_lifecycle_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table public.inquiry_lifecycle_notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiry_lifecycle_notifications'
      and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on public.inquiry_lifecycle_notifications for all using (true) with check (true)';
  end if;
end $$;

-- =====================================================
-- Final backfills
-- =====================================================

update public.sales_agents
set permissions = '[]'::jsonb
where permissions is null;

-- This is intentionally not creating auth users, operations users,
-- contacts, quotations, invoices, or order/carton tables.
-- Run the full project migrations if the full ERP system is needed.

