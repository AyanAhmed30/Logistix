-- =====================================================
-- Safe Migration: Add Sales Agent Codes and Customer Codes
-- Removes ONLY sales agent serial number functionality from Sales Tab
-- Order/Carton serial numbers remain COMPLETELY UNCHANGED
-- =====================================================

-- STEP 1: Add code column to sales_agents table
alter table sales_agents 
add column if not exists code text;

-- Make code unique if not already
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'sales_agents_code_key'
  ) then
    alter table sales_agents add constraint sales_agents_code_key unique (code);
  end if;
end $$;

-- Create index on code for faster lookups
create index if not exists idx_sales_agents_code on sales_agents(code);

-- STEP 2: Add customer_code column to customers table
alter table customers 
add column if not exists customer_code text;

-- Create index on customer_code
create index if not exists idx_customers_customer_code on customers(customer_code);

-- STEP 3: Add sequential_number column to customers
alter table customers 
add column if not exists sequential_number integer;

-- Create index on sequential_number
create index if not exists idx_customers_sequential_number on customers(sequential_number);

-- STEP 4: Assign codes to existing sales agents (starting from 101)
do $$
declare
  agent_record record;
  agent_code integer := 101;
begin
  for agent_record in 
    select id from sales_agents 
    where code is null 
    order by created_at asc
  loop
    update sales_agents 
    set code = agent_code::text 
    where id = agent_record.id;
    agent_code := agent_code + 1;
  end loop;
end $$;

-- STEP 5: Remove sales agent serial number functionality ONLY
-- This only affects the Sales Tab serial number assignment feature
-- Order serial numbers (carton_serial_number) are NOT affected

-- Drop function if exists
drop function if exists check_serial_range_overlap(text, text, uuid);

-- Drop indexes if they exist
drop index if exists idx_sales_agent_serial_ranges_to;
drop index if exists idx_sales_agent_serial_ranges_from;
drop index if exists idx_sales_agent_serial_ranges_agent_id;

-- Drop table if it exists (this is the sales agent serial range feature from Sales Tab)
drop table if exists sales_agent_serial_ranges cascade;

-- Migration Complete
-- Order serial numbers (carton_serial_number, next_carton_serial) remain UNCHANGED
