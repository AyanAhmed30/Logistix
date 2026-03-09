-- =====================================================
-- Migration: Create Inquiry System Tables
-- Purpose: Enable inquiry workflow between Sales Agents and Accounting
-- Flow: Lead → Inquiry → Quotation → Client
-- =====================================================

-- =====================================================
-- Table: lead_inquiries
-- Purpose: Store inquiry information when sales agent sends from Inquiry Received
-- =====================================================
create table if not exists lead_inquiries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  description text not null default '',
  image_url text,
  link_url text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'quotation_sent', 'completed')),
  sent_to_accounting boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_lead_inquiries_lead_id on lead_inquiries(lead_id);
create index if not exists idx_lead_inquiries_status on lead_inquiries(status);
create index if not exists idx_lead_inquiries_sent_to_accounting on lead_inquiries(sent_to_accounting);

-- Enable Row Level Security
alter table lead_inquiries enable row level security;

create policy "Full access for service role" 
on lead_inquiries 
for all 
using (true) 
with check (true);

-- =====================================================
-- Table: inquiry_quotations
-- Purpose: Store quotations created by accounting for inquiries
-- Multiple quotations can exist per inquiry (revision history)
-- =====================================================
create table if not exists inquiry_quotations (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references lead_inquiries(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
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

create index if not exists idx_inquiry_quotations_inquiry_id on inquiry_quotations(inquiry_id);
create index if not exists idx_inquiry_quotations_lead_id on inquiry_quotations(lead_id);
create index if not exists idx_inquiry_quotations_created_at on inquiry_quotations(created_at desc);

-- Enable Row Level Security
alter table inquiry_quotations enable row level security;

create policy "Full access for service role" 
on inquiry_quotations 
for all 
using (true) 
with check (true);
