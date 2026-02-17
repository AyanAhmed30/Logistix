-- =====================================================
-- Table: leads
-- Purpose: Store lead information created by sales agents
-- Related Functionality: Sales Agent Dashboard - Lead Tab, Admin Dashboard - Sales - Leads Tab
-- =====================================================

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  number text not null,
  source text not null check (source in ('Meta', 'LinkedIn', 'WhatsApp', 'Others')),
  sales_agent_id uuid not null references sales_agents(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table leads enable row level security;

-- Create a policy to allow Admin Client (Service Role) to do everything
create policy "Full access for service role" 
on leads 
for all 
using (true) 
with check (true);

-- Create indexes
create index if not exists idx_leads_sales_agent_id on leads(sales_agent_id);
create index if not exists idx_leads_created_at on leads(created_at desc);
create index if not exists idx_leads_source on leads(source);
