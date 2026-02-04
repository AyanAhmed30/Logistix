-- =====================================================
-- Table: customers
-- Purpose: Store customer information for sales management
-- Related Functionality: Sales tab - Create User, Customer List
-- =====================================================

-- Create customers table
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  phone_number text not null,
  company_name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enable Row Level Security
alter table customers enable row level security;

-- Create a policy to allow Admin Client (Service Role) to do everything
create policy "Full access for service role" 
on customers 
for all 
using (true) 
with check (true);

-- Create index on company_name for faster lookups
create index if not exists idx_customers_company_name on customers(company_name);

-- Create index on created_at for sorting
create index if not exists idx_customers_created_at on customers(created_at desc);
