-- =====================================================
-- Migration: Add Customer Conversion Fields
-- Purpose: Enable lead-to-customer conversion with proper ID formatting
-- Related Functionality: Sales Agent Dashboard - Pipeline - Win Board
-- =====================================================

-- Add converted flag to leads table
alter table leads 
add column if not exists converted boolean not null default false;

-- Add index on converted flag
create index if not exists idx_leads_converted on leads(converted);

-- Add sales_agent_id, lead_id, and conversion tracking to customers table
alter table customers 
add column if not exists sales_agent_id uuid references sales_agents(id) on delete set null,
add column if not exists lead_id uuid references leads(id) on delete set null,
add column if not exists converted_at timestamptz,
add column if not exists customer_id_formatted text,
add column if not exists customer_sequence_number integer;

-- Create indexes
create index if not exists idx_customers_sales_agent_id on customers(sales_agent_id);
create index if not exists idx_customers_lead_id on customers(lead_id);
create index if not exists idx_customers_customer_id_formatted on customers(customer_id_formatted);
create index if not exists idx_customers_customer_sequence_number on customers(sales_agent_id, customer_sequence_number);

-- Ensure customer_id_formatted is unique
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'customers_customer_id_formatted_key'
  ) then
    alter table customers add constraint customers_customer_id_formatted_key unique (customer_id_formatted);
  end if;
end $$;
