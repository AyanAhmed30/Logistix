-- =====================================================
-- Migration: Modify Sales Agent Functionality
-- Purpose: Add sales agent codes, customer codes, and remove SALES AGENT serial number functionality
-- Note: Order/Carton serial number functionality (carton_serial_number) remains UNCHANGED
-- Related Functionality: Sales Agent module with sequential customer numbering
-- =====================================================

-- =====================================================
-- STEP 1: Add code column to sales_agents table
-- =====================================================
alter table sales_agents 
add column if not exists code text unique;

-- Create index on code for faster lookups
create index if not exists idx_sales_agents_code on sales_agents(code);

-- =====================================================
-- STEP 2: Add customer_code and sequential_number columns to customers table
-- =====================================================
-- Add customer_code column to customers table
alter table customers 
add column if not exists customer_code text;

-- Create index on customer_code for faster lookups
create index if not exists idx_customers_customer_code on customers(customer_code);

-- Add sequential_number column to customers for tracking sequence per sales agent
alter table customers 
add column if not exists sequential_number integer;

-- Create index on sequential_number
create index if not exists idx_customers_sequential_number on customers(sequential_number);

-- =====================================================
-- STEP 3: Update existing sales agents with codes (if any exist)
-- This will assign codes starting from 101 based on creation order
-- =====================================================
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

-- =====================================================
-- STEP 4: Remove SALES AGENT serial number functionality ONLY
-- Drop the sales_agent_serial_ranges table and related objects
-- NOTE: This does NOT affect order/carton serial numbers (carton_serial_number)
-- =====================================================

-- Drop the function if it exists (only for sales agent serial ranges)
drop function if exists check_serial_range_overlap(text, text, uuid);

-- Drop indexes on sales_agent_serial_ranges table
drop index if exists idx_sales_agent_serial_ranges_to;
drop index if exists idx_sales_agent_serial_ranges_from;
drop index if exists idx_sales_agent_serial_ranges_agent_id;

-- Drop the sales_agent_serial_ranges table
-- This removes ONLY sales agent serial number range functionality
-- Order serial numbers (carton_serial_number, next_carton_serial function) remain UNCHANGED
drop table if exists sales_agent_serial_ranges cascade;

-- =====================================================
-- Migration Complete
-- =====================================================
-- After running this migration:
-- 1. Sales agents will have unique codes (101, 102, 103...)
-- 2. Customers can have customer_code (e.g., 10101, 10102...) and sequential_number
-- 3. Sales agent serial number functionality is removed (sales_agent_serial_ranges table)
-- 4. Order/Carton serial number functionality REMAINS INTACT (carton_serial_number, next_carton_serial function)
-- =====================================================
