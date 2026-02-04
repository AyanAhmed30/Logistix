-- =====================================================
-- Sales Agents Feature Setup
-- Purpose: Create all tables needed for Sales Agents functionality
-- Related Functionality: Sales tab - Sales Agent management
-- =====================================================
-- 
-- Run this SQL file in Supabase SQL Editor to set up:
-- 1. Sales Agents table
-- 2. Sales Agent-Customer assignments
-- 3. Sales Agent Serial Number Range assignments
-- =====================================================

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

-- =====================================================
-- Table: sales_agent_customers
-- Purpose: Junction table linking sales agents to customers
-- Related Functionality: Sales tab - Customer allocation to sales agents
-- Related Tables: sales_agents, customers
-- =====================================================
create table if not exists sales_agent_customers (
  sales_agent_id uuid references sales_agents(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  primary key (sales_agent_id, customer_id),
  assigned_at timestamptz default now()
);

-- Create index on sales_agent_id for faster lookups
create index if not exists idx_sales_agent_customers_agent_id on sales_agent_customers(sales_agent_id);

-- Create index on customer_id for faster lookups
create index if not exists idx_sales_agent_customers_customer_id on sales_agent_customers(customer_id);

-- Ensure one customer can only be assigned to one sales agent
create unique index if not exists idx_sales_agent_customers_unique_customer on sales_agent_customers(customer_id);

-- =====================================================
-- Table: sales_agent_serial_ranges
-- Purpose: Store serial number ranges assigned to sales agents
-- Related Functionality: Sales tab - Serial number allocation to sales agents
-- Related Tables: sales_agents
-- =====================================================
create table if not exists sales_agent_serial_ranges (
  id uuid primary key default gen_random_uuid(),
  sales_agent_id uuid not null references sales_agents(id) on delete cascade,
  serial_from text not null,
  serial_to text not null,
  assigned_at timestamptz default now(),
  constraint valid_range check (serial_from <= serial_to)
);

-- Create index on sales_agent_id for faster lookups
create index if not exists idx_sales_agent_serial_ranges_agent_id on sales_agent_serial_ranges(sales_agent_id);

-- Create index on serial ranges for overlap detection
create index if not exists idx_sales_agent_serial_ranges_from on sales_agent_serial_ranges(serial_from);
create index if not exists idx_sales_agent_serial_ranges_to on sales_agent_serial_ranges(serial_to);
