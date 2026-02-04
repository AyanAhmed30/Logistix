-- =====================================================
-- Table: sales_agents
-- Purpose: Store sales agent information
-- Related Functionality: Sales tab - Sales Agent management
-- =====================================================

create table if not exists sales_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone_number text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table sales_agents enable row level security;

-- Create a policy to allow Admin Client (Service Role) to do everything
create policy "Full access for service role" 
on sales_agents 
for all 
using (true) 
with check (true);

-- Create index on email for faster lookups
create index if not exists idx_sales_agents_email on sales_agents(email);

-- Create index on created_at for sorting
create index if not exists idx_sales_agents_created_at on sales_agents(created_at desc);
