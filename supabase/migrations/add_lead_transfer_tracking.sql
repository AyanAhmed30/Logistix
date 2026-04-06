-- =====================================================
-- Migration: Add lead transfer tracking between sales agents
-- Purpose: Allow sales agents to transfer leads and track sent/received history
-- =====================================================

-- Add ownership metadata fields on leads to distinguish own vs received leads.
alter table leads
add column if not exists created_by_sales_agent_id uuid references sales_agents(id) on delete set null;

alter table leads
add column if not exists transferred_from_sales_agent_id uuid references sales_agents(id) on delete set null;

alter table leads
add column if not exists transferred_at timestamptz;

-- Backfill creator for existing leads.
update leads
set created_by_sales_agent_id = sales_agent_id
where created_by_sales_agent_id is null;

create index if not exists idx_leads_created_by_sales_agent_id
  on leads(created_by_sales_agent_id);

create index if not exists idx_leads_transferred_from_sales_agent_id
  on leads(transferred_from_sales_agent_id);

create index if not exists idx_leads_transferred_at
  on leads(transferred_at desc);

-- Track every transfer event for sent/received history.
create table if not exists lead_transfers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_sales_agent_id uuid not null references sales_agents(id) on delete restrict,
  to_sales_agent_id uuid not null references sales_agents(id) on delete restrict,
  status_before_transfer text not null check (status_before_transfer in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose')),
  lead_id_formatted_snapshot text,
  lead_name_snapshot text not null,
  lead_number_snapshot text not null,
  lead_source_snapshot text not null check (lead_source_snapshot in ('Meta', 'LinkedIn', 'WhatsApp', 'Others')),
  transferred_at timestamptz not null default now(),
  constraint lead_transfers_agents_must_differ check (from_sales_agent_id <> to_sales_agent_id)
);

create index if not exists idx_lead_transfers_from_sales_agent_id
  on lead_transfers(from_sales_agent_id, transferred_at desc);

create index if not exists idx_lead_transfers_to_sales_agent_id
  on lead_transfers(to_sales_agent_id, transferred_at desc);

create index if not exists idx_lead_transfers_lead_id
  on lead_transfers(lead_id, transferred_at desc);

alter table lead_transfers enable row level security;

create policy "Full access for service role"
on lead_transfers
for all
using (true)
with check (true);

-- Allow transfer notifications via inquiry lifecycle notification stream.
alter table inquiry_lifecycle_notifications
drop constraint if exists inquiry_lifecycle_notifications_event_type_check;

alter table inquiry_lifecycle_notifications
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
