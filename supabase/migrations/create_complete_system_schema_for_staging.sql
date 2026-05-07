-- =====================================================
-- Complete Logistix System Schema for Staging / Testing
-- Generated from supabase/schema.sql plus all migration files.
-- Run this on a fresh Supabase project to create the full testing schema.
-- IMPORTANT: This creates schema only, not production data.
-- =====================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- Inquiry image/document uploads use this Supabase Storage bucket.
-- Supabase projects include the `storage` schema by default.
insert into storage.buckets (id, name, public)
values ('inquiry-images', 'inquiry-images', true)
on conflict (id) do update
set public = excluded.public;



-- =====================================================
-- Source: supabase\schema.sql
-- =====================================================

-- =====================================================
-- Main Schema File
-- Purpose: Complete database schema for Logistix application
-- Usage: Run this file in Supabase SQL Editor to set up all tables, functions, and policies
-- 
-- Note: Individual table/function files are available in:
--   - tables/ folder for table definitions
--   - functions/ folder for database functions
--   - policies/ folder for RLS policies
--   - migrations/ folder for migration scripts
-- =====================================================

-- =====================================================
-- Table: orders
-- Purpose: Store order information
-- Related Functionality: Order Management, Order Tracking
-- =====================================================
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  shipping_mark text not null,
  destination_country text not null,
  total_cartons integer not null,
  item_description text,
  created_at timestamptz default now()
);

create index if not exists idx_orders_username on orders(username);
create index if not exists idx_orders_created_at on orders(created_at desc);

-- =====================================================
-- Table: cartons
-- Purpose: Store carton details for each order
-- Related Functionality: Order Management, Order Tracking
-- =====================================================
create table if not exists cartons (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  carton_serial_number text unique not null,
  weight numeric,
  length numeric,
  width numeric,
  height numeric,
  dimension_unit text,
  carton_index integer not null,
  item_description text,
  destination_country text,
  sub_order_index integer,
  carton_in_sub_order integer,
  created_at timestamptz default now()
);

create index if not exists idx_cartons_order_id on cartons(order_id);
create index if not exists idx_cartons_serial_number on cartons(carton_serial_number);

-- =====================================================
-- Table: carton_scans
-- Purpose: Track when a carton sticker barcode is scanned
-- Related Functionality: User Dashboard - Scanned Stickers
-- =====================================================
create table if not exists carton_scans (
  id uuid primary key default gen_random_uuid(),
  carton_id uuid not null references cartons(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  username text not null,
  carton_serial_number text not null,
  scanned_at timestamptz default now()
);

create index if not exists idx_carton_scans_username on carton_scans(username);
create index if not exists idx_carton_scans_carton_serial on carton_scans(carton_serial_number);

-- =====================================================
-- Table: admin_invoices
-- Purpose: Store proforma invoices created from the admin dashboard
-- Related Functionality: Admin Portal - Invoice tab
-- =====================================================
create table if not exists admin_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  invoice_date date not null,
  due_date date not null,
  source text,
  description text,
  quantity text,
  unit_price text,
  taxes text,
  amount text,
  untaxed_amount text,
  total text,
  payment_communication text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_admin_invoices_created_at on admin_invoices(created_at desc);
create index if not exists idx_admin_invoices_invoice_number on admin_invoices(invoice_number);

-- =====================================================
-- Table: serial_counter
-- Purpose: Track serial number generation for cartons
-- Related Functionality: Order Creation, Carton Serial Number Generation
-- =====================================================
create table if not exists serial_counter (
  id integer primary key,
  last_serial_number bigint not null
);

insert into serial_counter (id, last_serial_number)
values (1, 0)
on conflict (id) do nothing;

-- =====================================================
-- Function: next_carton_serial()
-- Purpose: Generate next sequential carton serial number
-- Related Functionality: Order Creation, Carton Serial Number Generation
-- Related Table: serial_counter
-- =====================================================
create or replace function next_carton_serial()
returns bigint
language plpgsql
as $$
declare
  next_val bigint;
begin
  update serial_counter
  set last_serial_number = last_serial_number + 1
  where id = 1
  returning last_serial_number into next_val;

  return next_val;
end;
$$;

-- =====================================================
-- Table: app_users
-- Purpose: Store application user accounts (admin and regular users)
-- Related Functionality: Authentication, User Management
-- =====================================================
create table if not exists public.app_users (
  id uuid default gen_random_uuid() primary key,
  username text unique not null,
  password text not null,
  role text not null default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.app_users enable row level security;

create index if not exists idx_app_users_username on app_users(username);
create index if not exists idx_app_users_role on app_users(role);

-- =====================================================
-- Policy: Full access for service role
-- Purpose: Allow Admin Client (Service Role) full access to app_users
-- Related Table: app_users
-- Related Functionality: User Management, Authentication
-- =====================================================
create policy "Full access for service role" 
on public.app_users 
for all 
using (true) 
with check (true);

-- =====================================================
-- Table: consoles
-- Purpose: Store console/container information
-- Related Functionality: Console Management, Loading Instructions
-- =====================================================
create table if not exists consoles (
  id uuid primary key default gen_random_uuid(),
  console_number text not null unique,
  container_number text not null,
  date date not null,
  bl_number text not null,
  carrier text not null,
  so text not null,
  total_cartons integer not null default 0,
  total_cbm numeric(10, 3) not null default 0,
  max_cbm numeric(10, 3) not null default 68,
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_consoles_console_number on consoles(console_number);
create index if not exists idx_consoles_status on consoles(status);
create index if not exists idx_consoles_created_at on consoles(created_at desc);

-- =====================================================
-- Table: console_orders
-- Purpose: Junction table linking consoles to orders
-- Related Functionality: Console Management, Order Assignment
-- =====================================================
create table if not exists console_orders (
  console_id uuid references consoles(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  primary key (console_id, order_id),
  assigned_at timestamptz default now()
);

create index if not exists idx_console_orders_console_id on console_orders(console_id);
create index if not exists idx_console_orders_order_id on console_orders(order_id);

-- =====================================================
-- Table: customers
-- Purpose: Store customer information for sales management
-- Related Functionality: Sales tab - Create User, Customer List
-- =====================================================
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

alter table customers enable row level security;

create policy "Full access for service role" 
on customers 
for all 
using (true) 
with check (true);

create index if not exists idx_customers_company_name on customers(company_name);
create index if not exists idx_customers_created_at on customers(created_at desc);

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

alter table sales_agents enable row level security;

create policy "Full access for service role" 
on sales_agents 
for all 
using (true) 
with check (true);

create index if not exists idx_sales_agents_email on sales_agents(email);
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

create index if not exists idx_sales_agent_customers_agent_id on sales_agent_customers(sales_agent_id);
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

create index if not exists idx_sales_agent_serial_ranges_agent_id on sales_agent_serial_ranges(sales_agent_id);
create index if not exists idx_sales_agent_serial_ranges_from on sales_agent_serial_ranges(serial_from);
create index if not exists idx_sales_agent_serial_ranges_to on sales_agent_serial_ranges(serial_to);

-- =====================================================
-- Table: quotations
-- Purpose: Store sales quotations with three-stage workflow
-- Related Functionality: Sales Management - Quotation Module
-- =====================================================
create table if not exists quotations (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  product_service text not null,
  quantity numeric(10, 2) not null,
  unit_price numeric(10, 2) not null,
  total_amount numeric(10, 2) not null,
  status text not null default 'quotation' check (status in ('quotation', 'quotation_sent', 'sales_order')),
  created_by text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_quotations_status on quotations(status);
create index if not exists idx_quotations_created_at on quotations(created_at desc);
create index if not exists idx_quotations_created_by on quotations(created_by);

-- =====================================================
-- Table: quotation_logs
-- Purpose: Track all actions and status changes for quotations
-- Related Functionality: Sales Management - Activity History
-- =====================================================
create table if not exists quotation_logs (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'deleted', 'status_changed', 'printed')),
  previous_status text,
  new_status text,
  performed_by text not null,
  performed_at timestamptz default now(),
  details jsonb
);

create index if not exists idx_quotation_logs_quotation_id on quotation_logs(quotation_id);
create index if not exists idx_quotation_logs_performed_at on quotation_logs(performed_at desc);
create index if not exists idx_quotation_logs_performed_by on quotation_logs(performed_by);

-- =====================================================
-- Table: invoices
-- Purpose: Store invoices created from sales orders
-- Related Functionality: Sales Management - Invoice Module
-- =====================================================
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  invoice_number text not null unique,
  customer_name text not null,
  product_service text not null,
  quantity numeric(10, 2) not null,
  unit_price numeric(10, 2) not null,
  total_amount numeric(10, 2) not null,
  invoice_date date not null,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'partial')),
  invoice_status text not null default 'draft' check (invoice_status in ('draft', 'posted', 'paid')),
  created_by text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_invoices_quotation_id on invoices(quotation_id);
create index if not exists idx_invoices_status on invoices(invoice_status);
create index if not exists idx_invoices_invoice_number on invoices(invoice_number);
create index if not exists idx_invoices_created_at on invoices(created_at desc);
create index if not exists idx_invoices_created_by on invoices(created_by);

-- =====================================================
-- Table: invoice_logs
-- Purpose: Track all actions and status changes for invoices
-- Related Functionality: Sales Management - Invoice Activity History
-- =====================================================
create table if not exists invoice_logs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'deleted', 'status_changed', 'payment_registered', 'printed')),
  previous_status text,
  new_status text,
  performed_by text not null,
  performed_at timestamptz default now(),
  details jsonb
);

create index if not exists idx_invoice_logs_invoice_id on invoice_logs(invoice_id);
create index if not exists idx_invoice_logs_performed_at on invoice_logs(performed_at desc);
create index if not exists idx_invoice_logs_performed_by on invoice_logs(performed_by);




-- =====================================================
-- Source: supabase\migrations\create_operations_users.sql
-- =====================================================

-- Create operations_users table for Operations team members
CREATE TABLE IF NOT EXISTS operations_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast login lookups
CREATE INDEX IF NOT EXISTS idx_operations_users_username ON operations_users(username);




-- =====================================================
-- Source: supabase\migrations\modify_sales_agent_functionality_safe.sql
-- =====================================================

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




-- =====================================================
-- Source: supabase\migrations\modify_sales_agent_functionality.sql
-- =====================================================

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




-- =====================================================
-- Source: supabase\migrations\add_sales_agent_auth_fields.sql
-- =====================================================

-- =====================================================
-- Migration: Add username and password to sales_agents
-- Purpose: Enable sales agent authentication
-- =====================================================

-- Add username column (unique, not null)
alter table sales_agents 
add column if not exists username text;

-- Add password column (not null)
alter table sales_agents 
add column if not exists password text;

-- Make username unique
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'sales_agents_username_key'
  ) then
    alter table sales_agents add constraint sales_agents_username_key unique (username);
  end if;
end $$;

-- Create index on username for faster lookups
create index if not exists idx_sales_agents_username on sales_agents(username);

-- Make email and phone_number nullable (they're no longer required)
alter table sales_agents 
alter column email drop not null;

alter table sales_agents 
alter column phone_number drop not null;




-- =====================================================
-- Source: supabase\migrations\add_sales_agent_permissions.sql
-- =====================================================

-- =====================================================
-- Migration: Add permissions column to sales_agents
-- Purpose: Store additional module access permissions for sales agents
-- =====================================================

-- Add permissions column as JSONB to store array of permission keys
alter table sales_agents 
add column if not exists permissions jsonb default '[]'::jsonb;

-- Create index on permissions for faster queries
create index if not exists idx_sales_agents_permissions on sales_agents using gin(permissions);

-- Update existing sales agents to have empty permissions array
update sales_agents
set permissions = '[]'::jsonb
where permissions is null;




-- =====================================================
-- Source: supabase\migrations\create_leads_table.sql
-- =====================================================

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




-- =====================================================
-- Source: supabase\migrations\add_lead_status_and_comments.sql
-- =====================================================

-- =====================================================
-- Migration: Add status field to leads and create lead_comments table
-- Purpose: Enable Kanban board functionality with status tracking and comments
-- Related Functionality: Sales Agent Dashboard - Pipeline Tab
-- =====================================================

-- Add status column to leads table
alter table leads 
add column if not exists status text not null default 'Leads' 
check (status in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win'));

-- Create index on status for faster queries
create index if not exists idx_leads_status on leads(status);

-- =====================================================
-- Table: lead_comments
-- Purpose: Store comments for leads with timestamps
-- Related Functionality: Sales Agent Dashboard - Pipeline Tab - Comments
-- =====================================================

create table if not exists lead_comments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  comment text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes
create index if not exists idx_lead_comments_lead_id on lead_comments(lead_id);
create index if not exists idx_lead_comments_created_at on lead_comments(created_at desc);

-- Enable Row Level Security
alter table lead_comments enable row level security;

-- Create a policy to allow Admin Client (Service Role) to do everything
create policy "Full access for service role" 
on lead_comments 
for all 
using (true) 
with check (true);




-- =====================================================
-- Source: supabase\migrations\replace_code_with_random_lead_id.sql
-- =====================================================

-- =====================================================
-- Migration: Replace Sales Agent Code system with Random 6-digit Lead IDs
-- 1. Add lead_id_formatted to leads table
-- 2. Make sales_agents.code optional (no longer required)
-- 3. Backfill existing leads with random 6-digit unique IDs
-- 4. Update customer_id_formatted for converted leads to match
-- =====================================================

-- STEP 1: Add lead_id_formatted column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_id_formatted TEXT;

-- Create unique index
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_lead_id_formatted_key'
  ) THEN
    ALTER TABLE leads ADD CONSTRAINT leads_lead_id_formatted_key UNIQUE (lead_id_formatted);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_lead_id_formatted ON leads(lead_id_formatted);

-- STEP 2: Drop the NOT NULL / unique constraint on sales_agents.code if it exists
-- (allow code to be NULL for new agents created without a code)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sales_agents_code_key'
  ) THEN
    ALTER TABLE sales_agents DROP CONSTRAINT sales_agents_code_key;
  END IF;
END $$;

-- STEP 3: Assign random 6-digit unique IDs to existing leads that don't have one
DO $$
DECLARE
  lead_record RECORD;
  new_id TEXT;
  id_exists BOOLEAN;
BEGIN
  FOR lead_record IN
    SELECT id FROM leads WHERE lead_id_formatted IS NULL ORDER BY created_at ASC
  LOOP
    LOOP
      -- Generate a random 6-digit number (100000â€“999999)
      new_id := LPAD((100000 + floor(random() * 900000))::TEXT, 6, '0');
      -- Check uniqueness
      SELECT EXISTS(SELECT 1 FROM leads WHERE lead_id_formatted = new_id) INTO id_exists;
      EXIT WHEN NOT id_exists;
    END LOOP;

    UPDATE leads SET lead_id_formatted = new_id WHERE id = lead_record.id;
  END LOOP;
END $$;

-- STEP 4: Update customer_id_formatted for converted leads
-- Guard this block because customers.lead_id is added in a later migration.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'lead_id'
  ) THEN
    EXECUTE $sql$
      UPDATE customers c
      SET customer_id_formatted = l.lead_id_formatted
      FROM leads l
      WHERE c.lead_id = l.id
        AND l.lead_id_formatted IS NOT NULL
    $sql$;
  END IF;
END $$;




-- =====================================================
-- Source: supabase\migrations\add_followup_lose_status.sql
-- =====================================================

-- =====================================================
-- Migration: Add 'Follow up' and 'Lose' statuses to leads table
-- Purpose: Enable new pipeline boards for Follow up and Lose statuses
-- Related Functionality: Sales Agent Dashboard - Pipeline Tab
-- =====================================================

-- Step 1: Drop the existing check constraint
ALTER TABLE leads 
DROP CONSTRAINT IF EXISTS leads_status_check;

-- Step 2: Add the new check constraint with 'Follow up' and 'Lose' statuses
ALTER TABLE leads 
ADD CONSTRAINT leads_status_check 
CHECK (status IN ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose'));

-- =====================================================
-- Verification query (optional - run to verify)
-- =====================================================
-- SELECT 
--     conname AS constraint_name,
--     pg_get_constraintdef(oid) AS constraint_definition
-- FROM pg_constraint
-- WHERE conrelid = 'leads'::regclass
-- AND conname = 'leads_status_check';




-- =====================================================
-- Source: supabase\migrations\fix_existing_leads_status.sql
-- =====================================================

-- =====================================================
-- Migration: Fix Existing Leads Status
-- Purpose: Set default status for existing leads that don't have a status
-- Related Functionality: Fix constraint violation errors for existing leads
-- =====================================================

-- Update any leads that don't have a status to 'Leads' (default)
update leads 
set status = 'Leads' 
where status is null or status = '';

-- Ensure all leads have a valid status
-- This handles any edge cases where status might be empty string
update leads 
set status = 'Leads' 
where status not in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win');




-- =====================================================
-- Source: supabase\migrations\add_customer_conversion_fields.sql
-- =====================================================

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




-- =====================================================
-- Source: supabase\migrations\create_inquiry_system.sql
-- =====================================================

-- =====================================================
-- Migration: Create Inquiry System Tables
-- Purpose: Enable inquiry workflow between Sales Agents and Accounting
-- Flow: Lead â†’ Inquiry â†’ Quotation â†’ Client
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




-- =====================================================
-- Source: supabase\migrations\update_inquiry_form_fields.sql
-- =====================================================

-- =====================================================
-- Migration: Update inquiry form fields for detailed product inquiries
-- Purpose: Replace generic description/link fields with structured product fields
-- Adds: product_name, total_weight, cbm, quantity, sent_to_operations
-- =====================================================

-- Add product inquiry detail columns
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS product_name TEXT DEFAULT '';
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS total_weight TEXT DEFAULT '';
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS cbm TEXT DEFAULT '';
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS quantity TEXT DEFAULT '';

-- Track whether inquiry was sent to operations department
ALTER TABLE lead_inquiries ADD COLUMN IF NOT EXISTS sent_to_operations BOOLEAN NOT NULL DEFAULT false;

-- For existing inquiries that were already sent to accounting, also mark as sent to operations
UPDATE lead_inquiries SET sent_to_operations = true WHERE sent_to_accounting = true;




-- =====================================================
-- Source: supabase\migrations\add_additional_image_urls_to_lead_inquiries.sql
-- =====================================================

alter table lead_inquiries
add column if not exists additional_image_urls jsonb not null default '[]'::jsonb;




-- =====================================================
-- Source: supabase\migrations\add_calculator_values_to_lead_inquiries.sql
-- =====================================================

-- Persist calculator configuration per inquiry so Admin and Operations share values.
alter table lead_inquiries
add column if not exists calculator_values jsonb not null default '{}'::jsonb;




-- =====================================================
-- Source: supabase\migrations\add_simple_inquiry_approval_status.sql
-- =====================================================

-- =====================================================
-- Migration: Simple Inquiry Approval Status
-- Purpose: Make approved inquiry visibility explicit for Sales Agent
-- =====================================================

alter table public.lead_inquiries
  add column if not exists approval_status text not null default 'sent'
    check (approval_status in ('sent', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz null;

create index if not exists idx_lead_inquiries_approval_status
  on public.lead_inquiries(lead_id, approval_status, approved_at desc);




-- =====================================================
-- Source: supabase\migrations\normalize_inquiry_approval_statuses.sql
-- =====================================================

-- =====================================================
-- Migration: Normalize Inquiry Approval Statuses
-- Purpose: Support draft/sent/approved/rejected status-based stats
-- =====================================================

alter table public.lead_inquiries
  add column if not exists approval_status text,
  add column if not exists approved_at timestamptz null;

alter table public.lead_inquiries
  alter column approval_status set default 'draft';

update public.lead_inquiries
set approval_status = coalesce(approval_status, 'draft')
where approval_status is null;

alter table public.lead_inquiries
  alter column approval_status set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'lead_inquiries_approval_status_check'
      and conrelid = 'public.lead_inquiries'::regclass
  ) then
    alter table public.lead_inquiries
      drop constraint lead_inquiries_approval_status_check;
  end if;
end
$$;

alter table public.lead_inquiries
  add constraint lead_inquiries_approval_status_check
  check (approval_status in ('draft', 'sent', 'approved', 'rejected'));

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




-- =====================================================
-- Source: supabase\migrations\update_quotation_module.sql
-- =====================================================

-- =====================================================
-- Migration: Update Quotation Module for Odoo-like functionality
-- Adds quotation_number, expiration_date, payment_terms, taxes columns
-- Creates inquiry_logs table for tracking inquiry edits
-- =====================================================

-- Add new columns to quotations table
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS quotation_number TEXT;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS payment_terms TEXT DEFAULT 'Immediate';
ALTER TABLE quotations ADD COLUMN IF NOT EXISTS taxes NUMERIC(5,2) DEFAULT 0;

-- Auto-assign quotation numbers to existing rows that don't have one
DO $$
DECLARE
  r RECORD;
  counter INT := 1;
BEGIN
  FOR r IN SELECT id FROM quotations WHERE quotation_number IS NULL ORDER BY created_at ASC
  LOOP
    UPDATE quotations SET quotation_number = 'S' || LPAD(counter::TEXT, 5, '0') WHERE id = r.id;
    counter := counter + 1;
  END LOOP;
END $$;

-- Create inquiry_logs table for tracking inquiry edits
CREATE TABLE IF NOT EXISTS inquiry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES lead_inquiries(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_values JSONB,
  new_values JSONB,
  performed_by TEXT NOT NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);




-- =====================================================
-- Source: supabase\migrations\add_uom_to_quotations.sql
-- =====================================================

-- =====================================================
-- Migration: Add UOM (Unit of Measurement) to quotations
-- =====================================================

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS uom TEXT DEFAULT 'pcs / u';




-- =====================================================
-- Source: supabase\migrations\create_inquiry_confirmations.sql
-- =====================================================

-- =====================================================
-- Migration: Create Inquiry Confirmations table
-- Purpose: Allow Operations to submit filled inquiry forms
--          for Admin approval/rejection
-- Flow: Operations fills Lead Management Form â†’ Sends for Confirmation
--        â†’ Admin Approves or Rejects â†’ Status updates in Operations
-- =====================================================

CREATE TABLE IF NOT EXISTS inquiry_confirmations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES lead_inquiries(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  lead_number TEXT NOT NULL,            -- The 6-digit lead_id_formatted entered
  product_name TEXT NOT NULL DEFAULT '',
  total_weight TEXT DEFAULT '',
  cbm TEXT DEFAULT '',
  quantity TEXT DEFAULT '',
  original_image_url TEXT,              -- Read-only image from original inquiry
  additional_image_1_url TEXT,          -- First additional uploaded image
  additional_image_2_url TEXT,          -- Second additional uploaded image
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  submitted_by TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_inquiry_id ON inquiry_confirmations(inquiry_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_lead_id ON inquiry_confirmations(lead_id);
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_status ON inquiry_confirmations(status);
CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_lead_number ON inquiry_confirmations(lead_number);

-- Enable RLS
ALTER TABLE inquiry_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Full access for service role"
ON inquiry_confirmations
FOR ALL
USING (true)
WITH CHECK (true);




-- =====================================================
-- Source: supabase\migrations\add_hs_code_and_calculator_to_inquiry_confirmations.sql
-- =====================================================

alter table inquiry_confirmations
add column if not exists hs_code text default '';

alter table inquiry_confirmations
add column if not exists calculator_values jsonb not null default '{}'::jsonb;




-- =====================================================
-- Source: supabase\migrations\add_rejection_reason_and_sales_images_to_inquiry_confirmations.sql
-- =====================================================

alter table public.inquiry_confirmations
add column if not exists rejection_reason text;

alter table public.inquiry_confirmations
add column if not exists sales_additional_image_urls jsonb not null default '[]'::jsonb;




-- =====================================================
-- Source: supabase\migrations\add_lead_activity_logs_and_inquiry_versioning.sql
-- =====================================================

-- =====================================================
-- Migration: Lead Activity Logs + Inquiry Versioning
-- Purpose: Odoo-like traceability for lead + inquiry lifecycle
-- =====================================================

alter table public.lead_inquiries
  add column if not exists inquiry_group_id uuid default gen_random_uuid(),
  add column if not exists version_number integer not null default 1,
  add column if not exists is_current_version boolean not null default true;

create index if not exists idx_lead_inquiries_group_version
  on public.lead_inquiries(lead_id, inquiry_group_id, version_number desc);

create index if not exists idx_lead_inquiries_current_version
  on public.lead_inquiries(lead_id, is_current_version, updated_at desc);

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

create index if not exists idx_lead_activity_logs_lead_performed
  on public.lead_activity_logs(lead_id, performed_at desc);

create index if not exists idx_lead_activity_logs_inquiry
  on public.lead_activity_logs(inquiry_id, performed_at desc);

alter table public.lead_activity_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_activity_logs'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.lead_activity_logs
      for all
      using (true)
      with check (true);
  end if;
end
$$;




-- =====================================================
-- Source: supabase\migrations\create_inquiry_calculator_config.sql
-- =====================================================

create table if not exists inquiry_calculator_config (
  id text primary key,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into inquiry_calculator_config (id, values)
values ('shared', '{}'::jsonb)
on conflict (id) do nothing;




-- =====================================================
-- Source: supabase\migrations\create_lead_chat_messages.sql
-- =====================================================

-- =====================================================
-- Migration: Create Lead Chat Messages
-- Purpose: Enable lead-specific communication between Sales and Operations
-- =====================================================

create table if not exists lead_chat_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  message text not null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_chat_messages_lead_id_created_at
  on lead_chat_messages(lead_id, created_at asc);

alter table lead_chat_messages enable row level security;

create policy "Full access for service role"
on lead_chat_messages
for all
using (true)
with check (true);




-- =====================================================
-- Source: supabase\migrations\create_lead_chat_notifications.sql
-- =====================================================

-- =====================================================
-- Migration: Create Lead Chat Notifications
-- Purpose: Notification tracking for Sales <-> Operations chat events
-- =====================================================

create table if not exists lead_chat_notifications (
  id uuid primary key default gen_random_uuid(),
  chat_message_id uuid not null references lead_chat_messages(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_chat_notifications_recipient
  on lead_chat_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table lead_chat_notifications enable row level security;

create policy "Full access for service role"
on lead_chat_notifications
for all
using (true)
with check (true);




-- =====================================================
-- Source: supabase\migrations\create_inquiry_lifecycle_notifications.sql
-- =====================================================

-- =====================================================
-- Migration: Create Inquiry Lifecycle Notifications
-- Purpose: Notify Sales/Operations for key inquiry workflow events
-- =====================================================

create table if not exists inquiry_lifecycle_notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  inquiry_id uuid null references lead_inquiries(id) on delete set null,
  confirmation_id uuid null references inquiry_confirmations(id) on delete set null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  event_type text not null check (event_type in ('inquiry_sent', 'sent_for_admin_approval', 'approved', 'rejected')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_inquiry_lifecycle_notifications_recipient
  on inquiry_lifecycle_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table inquiry_lifecycle_notifications enable row level security;

create policy "Full access for service role"
on inquiry_lifecycle_notifications
for all
using (true)
with check (true);




-- =====================================================
-- Source: supabase\migrations\add_lead_transfer_tracking.sql
-- =====================================================

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




-- =====================================================
-- Source: supabase\migrations\optimize_operations_inquiry_loading.sql
-- =====================================================

-- Performance hardening for Operations Inquiry loading path.
-- Safe, idempotent indexes targeted at the high-traffic query patterns.

create extension if not exists pg_trgm;

create index if not exists idx_lead_inquiries_ops_feed
  on public.lead_inquiries (sent_to_accounting, sent_at desc, id);

create index if not exists idx_lead_inquiries_lead_id
  on public.lead_inquiries (lead_id);

create index if not exists idx_inquiry_confirmations_inquiry_created
  on public.inquiry_confirmations (inquiry_id, created_at desc);

create index if not exists idx_lead_inquiries_search_product_name_trgm
  on public.lead_inquiries using gin (product_name gin_trgm_ops);

create index if not exists idx_lead_inquiries_search_description_trgm
  on public.lead_inquiries using gin (description gin_trgm_ops);

create index if not exists idx_leads_search_name_trgm
  on public.leads using gin (name gin_trgm_ops);

create index if not exists idx_leads_search_number_trgm
  on public.leads using gin (number gin_trgm_ops);

create index if not exists idx_leads_search_source_trgm
  on public.leads using gin (source gin_trgm_ops);

create index if not exists idx_leads_search_formatted_trgm
  on public.leads using gin (lead_id_formatted gin_trgm_ops);




-- =====================================================
-- Source: supabase\migrations\create_contacts_module.sql
-- =====================================================

-- =====================================================
-- CONTACTS MODULE â€” Complete Schema (Odoo-style)
-- Purpose:
--   Full contacts directory supporting:
--     - Individual / Company toggle
--     - Structured address (street, street2, city, state, zip, country)
--     - Tags (many-to-many)
--     - Child / related contacts (parent_id self-reference)
--     - Sales & Purchase configuration
--     - Accounting configuration
--     - Notes
--     - Chatter activity log (created / updated / note / message / activity)
--
-- How to apply:
--   Run in Supabase SQL Editor (New query -> paste -> Run).
--   Safe to run multiple times (idempotent).
-- =====================================================

-- -----------------------------------------------------
-- 1. Main contacts table
-- -----------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),

  -- Hierarchy (parent company <-> related contact)
  parent_id uuid references public.contacts(id) on delete cascade,
  contact_kind text not null default 'contact'
    check (contact_kind in ('contact', 'invoice', 'delivery', 'other')),

  -- Identity
  company_type text not null default 'person'
    check (company_type in ('person', 'company')),
  name text not null,
  company_name text,
  job_position text,
  title text,
  image_url text,

  -- Contact information
  email text,
  phone text,
  mobile text,
  website text,

  -- Structured address
  street text,
  street2 text,
  city text,
  state text,
  zip text,
  country text,

  -- Business identity
  tax_id text,
  company_ref text,
  industry text,

  -- Sales & Purchase configuration
  salesperson_id uuid references public.sales_agents(id) on delete set null,
  payment_terms text,
  pricelist text,
  delivery_method text,
  customer_rank integer not null default 0,
  vendor_rank integer not null default 0,
  sales_payment_method text,
  incoterm text,
  incoterm_location text,
  group_rfq text default 'On Order',
  buyer text,
  purchase_payment_terms text,
  purchase_payment_method text,
  receipt_reminder boolean not null default false,

  -- Accounting configuration
  receivable_account text,
  payable_account text,
  tax_settings text,
  fiscal_position text,

  -- Notes
  notes text,

  -- Metadata
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contacts_name_not_blank check (btrim(name) <> '')
);

create index if not exists idx_contacts_name         on public.contacts (lower(name));
create index if not exists idx_contacts_email        on public.contacts (lower(email));
create index if not exists idx_contacts_parent_id    on public.contacts (parent_id);
create index if not exists idx_contacts_company_type on public.contacts (company_type);
create index if not exists idx_contacts_created_at   on public.contacts (created_at desc);

alter table public.contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contacts'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contacts for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 2. Tags catalogue
-- -----------------------------------------------------
create table if not exists public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8b5cf6',
  created_at timestamptz not null default now(),
  constraint contact_tags_name_not_blank check (btrim(name) <> '')
);

alter table public.contact_tags enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_tags'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contact_tags for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 3. Many-to-many: contacts <-> tags
-- -----------------------------------------------------
create table if not exists public.contact_tag_links (
  contact_id uuid not null references public.contacts(id)     on delete cascade,
  tag_id     uuid not null references public.contact_tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create index if not exists idx_contact_tag_links_contact on public.contact_tag_links (contact_id);
create index if not exists idx_contact_tag_links_tag     on public.contact_tag_links (tag_id);

alter table public.contact_tag_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_tag_links'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contact_tag_links for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 4. Chatter / activity log
-- -----------------------------------------------------
create table if not exists public.contact_activity_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  action_type text not null
    check (action_type in ('created', 'updated', 'note', 'message', 'activity', 'tag', 'child_added')),
  body text,
  performed_by text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_activity_logs_contact on public.contact_activity_logs (contact_id);
create index if not exists idx_contact_activity_logs_created on public.contact_activity_logs (created_at desc);

alter table public.contact_activity_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_activity_logs'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contact_activity_logs for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 5. Auto-update `updated_at` on every UPDATE
-- -----------------------------------------------------
create or replace function public.set_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_contacts_set_updated_at'
      and tgrelid = 'public.contacts'::regclass
  ) then
    execute $trg$
      create trigger trg_contacts_set_updated_at
        before update on public.contacts
        for each row execute function public.set_contacts_updated_at()
    $trg$;
  end if;
end $$;

-- -----------------------------------------------------
-- Done.
-- If the app still shows "Could not find the table 'public.contacts'",
-- reload the PostgREST schema cache in Supabase:
--   Dashboard -> Database -> API Docs -> "Reload schema"
-- or just wait ~10 seconds and refresh the app.
-- -----------------------------------------------------




-- =====================================================
-- Source: supabase\migrations\add_contacts_sales_purchase_fields.sql
-- =====================================================

-- =====================================================
-- Contacts module: additional Sales & Purchase fields
-- Adds the fields required by the Odoo-style
-- Sales & Purchase tab:
--   SALES:    Payment Method, Incoterm, Incoterm Location
--   PURCHASE: Group RFQ, Buyer, Payment Terms, Payment Method,
--             Receipt Reminder
-- Safe to run multiple times (uses "if not exists").
-- =====================================================

alter table public.contacts
  add column if not exists sales_payment_method text,
  add column if not exists incoterm text,
  add column if not exists incoterm_location text,
  add column if not exists group_rfq text default 'On Order',
  add column if not exists buyer text,
  add column if not exists purchase_payment_terms text,
  add column if not exists purchase_payment_method text,
  add column if not exists receipt_reminder boolean not null default false;




-- =====================================================
-- Source: supabase\migrations\integrate_quotations_contacts.sql
-- =====================================================

-- =====================================================
-- Integrate Quotations module with Contacts module.
--
-- - Adds `contact_id` on quotations (FK -> contacts.id)
-- - Keeps the legacy `customer_name` + `partner_id` columns
--   so existing data / flows stay intact.
-- - Backfill: when a quotation's customer_name matches
--   exactly one active contact name, link it automatically.
--
-- Safe to run multiple times.
-- =====================================================

-- 1. Add the column + index
alter table public.quotations
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists idx_quotations_contact_id
  on public.quotations(contact_id);

-- 2. Best-effort backfill for historic rows with a unique name match
with unique_contact as (
  select lower(trim(name)) as normalized_name,
         min(id::text)::uuid as contact_id
  from public.contacts
  group by lower(trim(name))
  having count(*) = 1
)
update public.quotations q
set contact_id = u.contact_id
from unique_contact u
where q.contact_id is null
  and lower(trim(q.customer_name)) = u.normalized_name;




-- =====================================================
-- Source: supabase\migrations\create_partners_table.sql
-- =====================================================

create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_type text not null check (partner_type in ('customer', 'vendor', 'agent', 'both')),
  email text,
  phone text,
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partners_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists idx_partners_name_type_unique
  on partners (lower(name), partner_type);

create index if not exists idx_partners_status_type
  on partners (status, partner_type, name);

alter table partners enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partners'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on partners
      for all
      using (true)
      with check (true)
    $policy$;
  end if;
end
$$;

insert into partners (name, partner_type, email, phone, address, status)
select 'Ali Traders', 'customer', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('Ali Traders') and partner_type = 'customer'
);

insert into partners (name, partner_type, email, phone, address, status)
select 'ABC Supplies', 'vendor', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('ABC Supplies') and partner_type = 'vendor'
);

insert into partners (name, partner_type, email, phone, address, status)
select 'XYZ Logistics', 'agent', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('XYZ Logistics') and partner_type = 'agent'
);

insert into partners (name, partner_type, email, phone, address, status)
select 'Global Traders', 'both', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('Global Traders') and partner_type = 'both'
);




-- =====================================================
-- Source: supabase\migrations\create_chart_of_accounts.sql
-- =====================================================

create table if not exists chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense', 'view')),
  parent_id uuid references chart_of_accounts(id) on delete restrict,
  allow_reconciliation boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chart_of_accounts_name_not_blank check (btrim(name) <> ''),
  constraint chart_of_accounts_code_not_blank check (btrim(code) <> ''),
  constraint chart_of_accounts_view_reconciliation check (
    type <> 'view' or allow_reconciliation = false
  )
);

create index if not exists idx_chart_of_accounts_parent_id
  on chart_of_accounts(parent_id);

create index if not exists idx_chart_of_accounts_active_code
  on chart_of_accounts(is_active, code);

alter table chart_of_accounts enable row level security;

drop policy if exists "Full access for service role" on chart_of_accounts;

create policy "Full access for service role"
on chart_of_accounts
for all
using (true)
with check (true);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Assets', '1000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '1000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Liabilities', '2000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '2000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Equity', '3000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '3000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Income', '4000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '4000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Expenses', '5000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '5000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Cash', '1100', 'asset', id, false, true
from chart_of_accounts
where code = '1000'
  and not exists (
    select 1 from chart_of_accounts where code = '1100'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Bank', '1200', 'asset', id, false, true
from chart_of_accounts
where code = '1000'
  and not exists (
    select 1 from chart_of_accounts where code = '1200'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Accounts Receivable', '1300', 'asset', id, true, true
from chart_of_accounts
where code = '1000'
  and not exists (
    select 1 from chart_of_accounts where code = '1300'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Accounts Payable', '2100', 'liability', id, true, true
from chart_of_accounts
where code = '2000'
  and not exists (
    select 1 from chart_of_accounts where code = '2100'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Revenue', '4100', 'income', id, false, true
from chart_of_accounts
where code = '4000'
  and not exists (
    select 1 from chart_of_accounts where code = '4100'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'General Expense', '5100', 'expense', id, false, true
from chart_of_accounts
where code = '5000'
  and not exists (
    select 1 from chart_of_accounts where code = '5100'
  );




-- =====================================================
-- Source: supabase\migrations\enhance_coa_logistics_accounts.sql
-- =====================================================

-- Safe COA enhancement for logistics accounting.
-- Rules followed:
-- - No delete
-- - No rename
-- - No type changes on existing rows
-- - Only add missing accounts
-- - Safely deactivate dummy/test accounts

-- ----------------------------------------
-- Parent anchors (fallback-safe)
-- ----------------------------------------
-- Income parent: prefer 4000 (Income group), fallback NULL
-- Expense parent: prefer 5000 (Expenses group), fallback NULL
-- Asset parent: prefer 1000 (Assets group), fallback NULL

-- ----------------------------------------
-- Revenue accounts (income)
-- ----------------------------------------
insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Freight Revenue',
  '4001',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4001'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Freight Revenue')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Customs Clearance Revenue',
  '4002',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4002'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Customs Clearance Revenue')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Delivery Revenue',
  '4003',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4003'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Delivery Revenue')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'DDP Service Revenue',
  '4004',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4004'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('DDP Service Revenue')
);

-- ----------------------------------------
-- Cost accounts (expense)
-- ----------------------------------------
insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Freight Cost',
  '5001',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5001'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Freight Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Customs Duty Cost',
  '5002',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5002'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Customs Duty Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Clearance Cost',
  '5003',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5003'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Clearance Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Delivery Cost',
  '5004',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5004'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Delivery Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Warehouse Cost',
  '5005',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5005'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Warehouse Cost')
);

-- ----------------------------------------
-- Supporting asset accounts
-- ----------------------------------------
insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Prepaid Freight',
  '1203',
  'asset',
  (select id from public.chart_of_accounts where code = '1000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '1203'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Prepaid Freight')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Prepaid Duty',
  '1204',
  'asset',
  (select id from public.chart_of_accounts where code = '1000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '1204'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Prepaid Duty')
);

-- ----------------------------------------
-- Safe cleanup: deactivate known dummy/test accounts
-- ----------------------------------------
update public.chart_of_accounts
set is_active = false,
    updated_at = now()
where is_active = true
  and (
    lower(name) = 'my account'
    or lower(name) = 'testing purpose'
  );




-- =====================================================
-- Source: supabase\migrations\create_journals.sql
-- =====================================================

create table if not exists journals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('sales', 'purchase', 'bank', 'cash', 'general')),
  default_debit_account_id uuid references chart_of_accounts(id) on delete restrict,
  default_credit_account_id uuid references chart_of_accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journals_name_not_blank check (btrim(name) <> ''),
  constraint journals_code_not_blank check (btrim(code) <> '')
);

create unique index if not exists idx_journals_name_unique
  on journals (lower(name));

create index if not exists idx_journals_type_active
  on journals(type, is_active, code);

alter table journals enable row level security;

drop policy if exists "Full access for service role" on journals;

create policy "Full access for service role"
on journals
for all
using (true)
with check (true);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Sales Journal',
  'SJ',
  'sales',
  (select id from chart_of_accounts where code = '1300' limit 1),
  (select id from chart_of_accounts where code = '4100' limit 1),
  true
where not exists (
  select 1 from journals where code = 'SJ'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Purchase Journal',
  'PJ',
  'purchase',
  (select id from chart_of_accounts where code = '5100' limit 1),
  (select id from chart_of_accounts where code = '2100' limit 1),
  true
where not exists (
  select 1 from journals where code = 'PJ'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Bank Journal',
  'BNK',
  'bank',
  (select id from chart_of_accounts where code = '1200' limit 1),
  (select id from chart_of_accounts where code = '1200' limit 1),
  true
where not exists (
  select 1 from journals where code = 'BNK'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Cash Journal',
  'CSH',
  'cash',
  (select id from chart_of_accounts where code = '1100' limit 1),
  (select id from chart_of_accounts where code = '1100' limit 1),
  true
where not exists (
  select 1 from journals where code = 'CSH'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'General Journal',
  'GEN',
  'general',
  null,
  null,
  true
where not exists (
  select 1 from journals where code = 'GEN'
);




-- =====================================================
-- Source: supabase\migrations\create_journal_entries.sql
-- =====================================================

create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  entry_date date not null,
  journal_id uuid not null references journals(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  total_debit numeric(15,2) not null default 0,
  total_credit numeric(15,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_reference_not_blank check (btrim(reference) <> ''),
  constraint journal_entries_total_debit_non_negative check (total_debit >= 0),
  constraint journal_entries_total_credit_non_negative check (total_credit >= 0)
);

create table if not exists journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  line_order integer not null default 1,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  partner_reference text null,
  description text not null default '',
  debit_amount numeric(15,2) not null default 0,
  credit_amount numeric(15,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entry_lines_order_positive check (line_order > 0),
  constraint journal_entry_lines_debit_non_negative check (debit_amount >= 0),
  constraint journal_entry_lines_credit_non_negative check (credit_amount >= 0),
  constraint journal_entry_lines_one_side_only check (
    not (debit_amount > 0 and credit_amount > 0)
  ),
  constraint journal_entry_lines_non_zero check (
    debit_amount > 0 or credit_amount > 0
  )
);

create index if not exists idx_journal_entries_journal_date
  on journal_entries(journal_id, entry_date desc, created_at desc);

create index if not exists idx_journal_entries_status
  on journal_entries(status, entry_date desc, created_at desc);

create index if not exists idx_journal_entry_lines_entry_order
  on journal_entry_lines(journal_entry_id, line_order);

alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;

drop policy if exists "Full access for service role" on journal_entries;
drop policy if exists "Full access for service role" on journal_entry_lines;

create policy "Full access for service role"
on journal_entries
for all
using (true)
with check (true);

create policy "Full access for service role"
on journal_entry_lines
for all
using (true)
with check (true);




-- =====================================================
-- Source: supabase\migrations\extend_financial_flow.sql
-- =====================================================

alter table invoices
  add column if not exists partner_id uuid references partners(id) on delete restrict,
  add column if not exists due_date date,
  add column if not exists posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists outstanding_amount numeric(12,2) not null default 0;

update invoices
set due_date = coalesce(due_date, invoice_date)
where due_date is null;

update invoices
set paid_amount = case
  when invoice_status = 'paid' then total_amount
  else 0
end
where paid_amount is null or paid_amount = 0;

update invoices
set outstanding_amount = greatest(total_amount - paid_amount, 0)
where outstanding_amount is null or outstanding_amount = 0;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'invoices'
      and constraint_name = 'invoices_invoice_status_check'
  ) then
    alter table invoices drop constraint invoices_invoice_status_check;
  end if;
end
$$;

alter table invoices
  add constraint invoices_invoice_status_check
  check (invoice_status in ('draft', 'confirmed', 'posted', 'paid', 'cancelled'));

create index if not exists idx_invoices_partner_id
  on invoices(partner_id);

create index if not exists idx_invoices_outstanding
  on invoices(invoice_status, outstanding_amount);

create table if not exists vendor_bills (
  id uuid primary key default gen_random_uuid(),
  vendor_partner_id uuid not null references partners(id) on delete restrict,
  bill_number text not null unique,
  bill_date date not null,
  due_date date not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  status text not null default 'draft' check (status in ('draft', 'posted', 'paid')),
  expense_account_id uuid references chart_of_accounts(id) on delete restrict,
  payable_account_id uuid references chart_of_accounts(id) on delete restrict,
  posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  outstanding_amount numeric(12,2) not null default 0 check (outstanding_amount >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_bills_partner_status
  on vendor_bills(vendor_partner_id, status, due_date);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique,
  partner_id uuid not null references partners(id) on delete restrict,
  payment_type text not null check (payment_type in ('inbound', 'outbound')),
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  journal_id uuid not null references journals(id) on delete restrict,
  receivable_account_id uuid references chart_of_accounts(id) on delete restrict,
  payable_account_id uuid references chart_of_accounts(id) on delete restrict,
  liquidity_account_id uuid not null references chart_of_accounts(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'posted')),
  posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  allocated_amount numeric(12,2) not null default 0 check (allocated_amount >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_partner_status
  on payments(partner_id, payment_type, status, payment_date);

create table if not exists payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete restrict,
  vendor_bill_id uuid references vendor_bills(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint payment_allocations_target_check check (
    (invoice_id is not null and vendor_bill_id is null)
    or (invoice_id is null and vendor_bill_id is not null)
  )
);

create index if not exists idx_payment_allocations_payment_id
  on payment_allocations(payment_id);

create index if not exists idx_payment_allocations_invoice_id
  on payment_allocations(invoice_id);

create index if not exists idx_payment_allocations_vendor_bill_id
  on payment_allocations(vendor_bill_id);

alter table vendor_bills enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vendor_bills' and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on vendor_bills for all using (true) with check (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payments' and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on payments for all using (true) with check (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payment_allocations' and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on payment_allocations for all using (true) with check (true)';
  end if;
end
$$;




-- =====================================================
-- Source: supabase\migrations\harden_accounting_integrity.sql
-- =====================================================

alter table quotations
  add column if not exists partner_id uuid references partners(id) on delete restrict;

create index if not exists idx_quotations_partner_id
  on quotations(partner_id);

with unique_customer_partner as (
  select lower(name) as normalized_name, min(id::text)::uuid as partner_id
  from partners
  where status = 'active'
    and partner_type in ('customer', 'both')
  group by lower(name)
  having count(*) = 1
)
update quotations q
set partner_id = u.partner_id
from unique_customer_partner u
where q.partner_id is null
  and lower(q.customer_name) = u.normalized_name;

do $$
declare
  _constraint_name text;
begin
  for _constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'invoices'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%invoice_status%'
  loop
    execute format('alter table public.invoices drop constraint if exists %I', _constraint_name);
  end loop;
end
$$;

alter table invoices
  add constraint invoices_invoice_status_check
  check (invoice_status in ('draft', 'confirmed', 'posted', 'paid', 'cancelled'));

create or replace function public.reconcile_payment_allocations(
  p_payment_id uuid,
  p_allocations jsonb,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row payments%rowtype;
  alloc jsonb;
  alloc_amount numeric(12,2);
  alloc_invoice_id uuid;
  alloc_vendor_bill_id uuid;
  requested_total numeric(12,2) := 0;
  invoice_row invoices%rowtype;
  bill_row vendor_bills%rowtype;
  payment_ar_account_id uuid;
  invoice_ar_account_id uuid;
  payment_ap_account_id uuid;
  bill_ap_account_id uuid;
begin
  if p_payment_id is null then
    raise exception 'Payment id is required.';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'At least one allocation is required.';
  end if;

  select *
  into payment_row
  from payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.';
  end if;
  if payment_row.status <> 'posted' then
    raise exception 'Only posted payments can be reconciled.';
  end if;
  if payment_row.posted_journal_entry_id is null then
    raise exception 'Posted payment must have journal entry reference.';
  end if;

  for alloc in
    select value
    from jsonb_array_elements(p_allocations)
  loop
    alloc_amount := round(coalesce((alloc ->> 'amount')::numeric, 0), 2);
    alloc_invoice_id := nullif(alloc ->> 'invoice_id', '')::uuid;
    alloc_vendor_bill_id := nullif(alloc ->> 'vendor_bill_id', '')::uuid;

    if alloc_amount <= 0 then
      raise exception 'Allocation amount must be greater than zero.';
    end if;
    if (alloc_invoice_id is null and alloc_vendor_bill_id is null)
      or (alloc_invoice_id is not null and alloc_vendor_bill_id is not null) then
      raise exception 'Each allocation must target exactly one document.';
    end if;

    requested_total := requested_total + alloc_amount;
  end loop;

  if requested_total <= 0 then
    raise exception 'Allocation amount must be greater than zero.';
  end if;
  if payment_row.allocated_amount + requested_total > payment_row.amount then
    raise exception 'Cannot reconcile more than remaining payment amount.';
  end if;

  for alloc in
    select value
    from jsonb_array_elements(p_allocations)
  loop
    alloc_amount := round(coalesce((alloc ->> 'amount')::numeric, 0), 2);
    alloc_invoice_id := nullif(alloc ->> 'invoice_id', '')::uuid;
    alloc_vendor_bill_id := nullif(alloc ->> 'vendor_bill_id', '')::uuid;

    if alloc_invoice_id is not null then
      if payment_row.payment_type <> 'inbound' then
        raise exception 'Inbound payment is required for invoice reconciliation.';
      end if;

      select *
      into invoice_row
      from invoices
      where id = alloc_invoice_id
      for update;
      if not found then
        raise exception 'Invoice not found.';
      end if;
      if invoice_row.partner_id <> payment_row.partner_id then
        raise exception 'Payment and invoice partners must match.';
      end if;
      if invoice_row.invoice_status not in ('posted', 'paid') then
        raise exception 'Only posted/paid invoices can be reconciled.';
      end if;
      if invoice_row.posted_journal_entry_id is null then
        raise exception 'Invoice must have posted journal entry.';
      end if;
      if alloc_amount > invoice_row.outstanding_amount then
        raise exception 'Allocation exceeds invoice outstanding amount.';
      end if;

      select jel.account_id
      into payment_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.credit_amount > 0
      order by jel.line_order
      limit 1;

      select jel.account_id
      into invoice_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = invoice_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.debit_amount > 0
      order by jel.line_order
      limit 1;

      if payment_ar_account_id is null or invoice_ar_account_id is null then
        raise exception 'Unable to verify receivable accounts for reconciliation.';
      end if;
      if payment_ar_account_id <> invoice_ar_account_id then
        raise exception 'Receivable account mismatch between payment and invoice.';
      end if;

      insert into payment_allocations (payment_id, invoice_id, vendor_bill_id, amount, created_by)
      values (payment_row.id, invoice_row.id, null, alloc_amount, p_actor);

      update invoices
      set paid_amount = round(paid_amount + alloc_amount, 2),
          outstanding_amount = round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2),
          invoice_status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            else 'posted'
          end,
          payment_status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            when round(paid_amount + alloc_amount, 2) > 0 then 'partial'
            else 'unpaid'
          end,
          updated_at = now()
      where id = invoice_row.id;

    else
      if payment_row.payment_type <> 'outbound' then
        raise exception 'Outbound payment is required for vendor bill reconciliation.';
      end if;

      select *
      into bill_row
      from vendor_bills
      where id = alloc_vendor_bill_id
      for update;
      if not found then
        raise exception 'Vendor bill not found.';
      end if;
      if bill_row.vendor_partner_id <> payment_row.partner_id then
        raise exception 'Payment and vendor bill partners must match.';
      end if;
      if bill_row.status not in ('posted', 'paid') then
        raise exception 'Only posted/paid vendor bills can be reconciled.';
      end if;
      if bill_row.posted_journal_entry_id is null then
        raise exception 'Vendor bill must have posted journal entry.';
      end if;
      if alloc_amount > bill_row.outstanding_amount then
        raise exception 'Allocation exceeds vendor bill outstanding amount.';
      end if;

      select jel.account_id
      into payment_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.debit_amount > 0
      order by jel.line_order
      limit 1;

      select jel.account_id
      into bill_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = bill_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.credit_amount > 0
      order by jel.line_order
      limit 1;

      if payment_ap_account_id is null or bill_ap_account_id is null then
        raise exception 'Unable to verify payable accounts for reconciliation.';
      end if;
      if payment_ap_account_id <> bill_ap_account_id then
        raise exception 'Payable account mismatch between payment and vendor bill.';
      end if;

      insert into payment_allocations (payment_id, invoice_id, vendor_bill_id, amount, created_by)
      values (payment_row.id, null, bill_row.id, alloc_amount, p_actor);

      update vendor_bills
      set paid_amount = round(paid_amount + alloc_amount, 2),
          outstanding_amount = round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2),
          status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            else 'posted'
          end,
          updated_at = now()
      where id = bill_row.id;
    end if;
  end loop;

  update payments
  set allocated_amount = round(allocated_amount + requested_total, 2),
      updated_at = now()
  where id = payment_row.id;
end
$$;

grant execute on function public.reconcile_payment_allocations(uuid, jsonb, text) to service_role;




-- =====================================================
-- Source: supabase\migrations\harden_journal_immutability_and_reversal.sql
-- =====================================================

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and constraint_name = 'journal_entries_status_check'
  ) then
    alter table journal_entries drop constraint journal_entries_status_check;
  end if;
end
$$;

alter table journal_entries
  add column if not exists posted_at timestamptz,
  add column if not exists posting_reference text unique,
  add column if not exists reversed boolean not null default false,
  add column if not exists is_reversal boolean not null default false,
  add column if not exists original_entry_id uuid references journal_entries(id) on delete restrict;

-- Backward compatibility: old implementations used "cancelled".
-- Convert to "reversed" before adding the stricter status constraint.
update journal_entries
set status = 'reversed',
    reversed = true,
    updated_at = now()
where status = 'cancelled';

alter table journal_entries
  add constraint journal_entries_status_check
  check (status in ('draft', 'posted', 'reversed'));

create index if not exists idx_journal_entries_original_entry_id
  on journal_entries(original_entry_id);

create index if not exists idx_journal_entries_posting_reference
  on journal_entries(posting_reference);

create or replace function public.block_posted_journal_entry_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_posted_entry_update', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'Posted entries cannot be modified. Use reversal.';
  end if;
  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'Posted entries cannot be modified. Use reversal.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists trg_block_posted_journal_entry_mutation on public.journal_entries;
create trigger trg_block_posted_journal_entry_mutation
before update or delete on public.journal_entries
for each row
execute function public.block_posted_journal_entry_mutation();

create or replace function public.post_journal_entry_strict(p_entry_id uuid)
returns table(id uuid, status text, posting_reference text, posted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row journal_entries%rowtype;
  totals record;
  _posting_reference text;
begin
  select *
  into entry_row
  from journal_entries
  where journal_entries.id = p_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if entry_row.status <> 'draft' then
    raise exception 'Only draft entries can be posted.';
  end if;

  select
    count(*) as line_count,
    coalesce(sum(debit_amount), 0)::numeric(15,2) as total_debit,
    coalesce(sum(credit_amount), 0)::numeric(15,2) as total_credit,
    count(*) filter (where debit_amount > 0) as debit_lines,
    count(*) filter (where credit_amount > 0) as credit_lines,
    count(*) filter (where debit_amount < 0 or credit_amount < 0) as negative_lines
  into totals
  from journal_entry_lines
  where journal_entry_id = p_entry_id;

  if totals.line_count < 2 then
    raise exception 'Journal entry must have at least two lines';
  end if;
  if totals.negative_lines > 0 then
    raise exception 'Invalid negative values in entry';
  end if;
  if totals.debit_lines = 0 or totals.credit_lines = 0 then
    raise exception 'Entry must contain both debit and credit lines';
  end if;
  if totals.total_debit <> totals.total_credit then
    raise exception 'Total debit and credit must be equal';
  end if;

  _posting_reference := 'POST-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  while exists (select 1 from journal_entries where posting_reference = _posting_reference) loop
    _posting_reference := 'POST-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  end loop;

  perform set_config('app.allow_posted_entry_update', '1', true);

  update journal_entries
  set status = 'posted',
      total_debit = totals.total_debit,
      total_credit = totals.total_credit,
      posted_at = now(),
      posting_reference = _posting_reference,
      updated_at = now()
  where journal_entries.id = p_entry_id;

  perform set_config('app.allow_posted_entry_update', '0', true);

  return query
  select je.id, je.status, je.posting_reference, je.posted_at
  from journal_entries je
  where je.id = p_entry_id;
end
$$;

create or replace function public.reverse_journal_entry_strict(p_original_entry_id uuid)
returns table(original_entry_id uuid, reversal_entry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  original_row journal_entries%rowtype;
  reversal_id uuid;
  _posting_reference text;
begin
  select *
  into original_row
  from journal_entries
  where journal_entries.id = p_original_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if original_row.status <> 'posted' then
    raise exception 'Only posted entries can be reversed.';
  end if;

  if original_row.reversed then
    raise exception 'Journal entry is already reversed.';
  end if;

  _posting_reference := 'REV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  while exists (select 1 from journal_entries where posting_reference = _posting_reference) loop
    _posting_reference := 'REV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  end loop;

  insert into journal_entries (
    reference,
    entry_date,
    journal_id,
    status,
    total_debit,
    total_credit,
    posted_at,
    posting_reference,
    reversed,
    is_reversal,
    original_entry_id,
    updated_at
  )
  values (
    original_row.reference || ' (REV)',
    current_date,
    original_row.journal_id,
    'posted',
    original_row.total_credit,
    original_row.total_debit,
    now(),
    _posting_reference,
    false,
    true,
    original_row.id,
    now()
  )
  returning id into reversal_id;

  insert into journal_entry_lines (
    journal_entry_id,
    line_order,
    account_id,
    partner_reference,
    description,
    debit_amount,
    credit_amount,
    updated_at
  )
  select
    reversal_id,
    line_order,
    account_id,
    partner_reference,
    coalesce(description, '') || ' (REV)',
    credit_amount,
    debit_amount,
    now()
  from journal_entry_lines
  where journal_entry_id = original_row.id
  order by line_order;

  perform set_config('app.allow_posted_entry_update', '1', true);

  update journal_entries
  set reversed = true,
      status = 'reversed',
      updated_at = now()
  where journal_entries.id = original_row.id;

  perform set_config('app.allow_posted_entry_update', '0', true);

  return query
  select original_row.id, reversal_id;
end
$$;

grant execute on function public.post_journal_entry_strict(uuid) to service_role;
grant execute on function public.reverse_journal_entry_strict(uuid) to service_role;




-- =====================================================
-- Source: supabase\migrations\add_safe_accounting_integrity_links.sql
-- =====================================================

-- Safe, backward-compatible accounting hardening patch.
-- Scope:
-- 1) partner_id linkage on journal_entry_lines (keep partner_reference)
-- 2) posting integrity constraints for invoices/vendor_bills/payments
-- 3) minimal business-level reversal linkage fields

-- =====================================================
-- TASK 1: Strong partner linkage in journal_entry_lines
-- =====================================================

alter table public.journal_entry_lines
  add column if not exists partner_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_partner_id_fkey'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_partner_id_fkey
      foreign key (partner_id)
      references public.partners(id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_partner_id_fkey;
  exception
    when others then
      raise notice 'journal_entry_lines_partner_id_fkey left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_journal_entry_lines_partner_id
  on public.journal_entry_lines(partner_id);

-- Optional safe backfill from partner_reference (format: "<type>:<name>")
-- Backfill only when a single unambiguous active partner match exists.
with parsed as (
  select
    jel.id as line_id,
    lower(btrim(split_part(jel.partner_reference, ':', 1))) as ref_type,
    lower(btrim(substr(jel.partner_reference, strpos(jel.partner_reference, ':') + 1))) as ref_name
  from public.journal_entry_lines jel
  where jel.partner_id is null
    and jel.partner_reference is not null
    and strpos(jel.partner_reference, ':') > 0
),
candidate_matches as (
  select
    p.line_id,
    pr.id as partner_id,
    row_number() over (
      partition by p.line_id
      order by
        case
          when p.ref_type = 'customer' and pr.partner_type = 'customer' then 1
          when p.ref_type = 'customer' and pr.partner_type = 'both' then 2
          when p.ref_type = 'vendor' and pr.partner_type = 'vendor' then 1
          when p.ref_type = 'vendor' and pr.partner_type = 'both' then 2
          when p.ref_type = 'agent' and pr.partner_type = 'agent' then 1
          else 99
        end,
        pr.id
    ) as rn,
    count(*) over (partition by p.line_id) as candidate_count
  from parsed p
  join public.partners pr
    on lower(pr.name) = p.ref_name
   and pr.status = 'active'
   and (
     (p.ref_type = 'customer' and pr.partner_type in ('customer', 'both'))
     or (p.ref_type = 'vendor' and pr.partner_type in ('vendor', 'both'))
     or (p.ref_type = 'agent' and pr.partner_type = 'agent')
   )
),
resolved as (
  select line_id, partner_id
  from candidate_matches
  where candidate_count = 1
    and rn = 1
)
update public.journal_entry_lines jel
set partner_id = r.partner_id
from resolved r
where jel.id = r.line_id
  and jel.partner_id is null;

-- =====================================================
-- TASK 2: DB-level posting integrity constraints
-- =====================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_posted_requires_journal_entry'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_posted_requires_journal_entry
      check (
        invoice_status not in ('posted', 'paid')
        or posted_journal_entry_id is not null
      )
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.invoices
      validate constraint invoices_posted_requires_journal_entry;
  exception
    when others then
      raise notice 'invoices_posted_requires_journal_entry left NOT VALID: %', SQLERRM;
  end;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vendor_bills_posted_requires_journal_entry'
      and conrelid = 'public.vendor_bills'::regclass
  ) then
    alter table public.vendor_bills
      add constraint vendor_bills_posted_requires_journal_entry
      check (
        status not in ('posted', 'paid')
        or posted_journal_entry_id is not null
      )
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.vendor_bills
      validate constraint vendor_bills_posted_requires_journal_entry;
  exception
    when others then
      raise notice 'vendor_bills_posted_requires_journal_entry left NOT VALID: %', SQLERRM;
  end;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_posted_requires_journal_entry'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_posted_requires_journal_entry
      check (
        status <> 'posted'
        or posted_journal_entry_id is not null
      )
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.payments
      validate constraint payments_posted_requires_journal_entry;
  exception
    when others then
      raise notice 'payments_posted_requires_journal_entry left NOT VALID: %', SQLERRM;
  end;
end
$$;

-- =====================================================
-- TASK 3: Minimal reversal linkage fields
-- =====================================================

alter table public.invoices
  add column if not exists original_invoice_id uuid null,
  add column if not exists reversed_invoice_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_original_invoice_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_original_invoice_id_fkey
      foreign key (original_invoice_id)
      references public.invoices(id)
      on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_reversed_invoice_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_reversed_invoice_id_fkey
      foreign key (reversed_invoice_id)
      references public.invoices(id)
      on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.invoices
      validate constraint invoices_original_invoice_id_fkey;
  exception
    when others then
      raise notice 'invoices_original_invoice_id_fkey left NOT VALID: %', SQLERRM;
  end;

  begin
    alter table public.invoices
      validate constraint invoices_reversed_invoice_id_fkey;
  exception
    when others then
      raise notice 'invoices_reversed_invoice_id_fkey left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_invoices_original_invoice_id
  on public.invoices(original_invoice_id);

create index if not exists idx_invoices_reversed_invoice_id
  on public.invoices(reversed_invoice_id);

alter table public.payments
  add column if not exists reversed_payment_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_reversed_payment_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_reversed_payment_id_fkey
      foreign key (reversed_payment_id)
      references public.payments(id)
      on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.payments
      validate constraint payments_reversed_payment_id_fkey;
  exception
    when others then
      raise notice 'payments_reversed_payment_id_fkey left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_payments_reversed_payment_id
  on public.payments(reversed_payment_id);




-- =====================================================
-- Source: supabase\migrations\implement_multi_currency_accounting_engine.sql
-- =====================================================

-- Multi-currency accounting engine hardening
-- Scope:
-- 1) Currency master + exchange rates
-- 2) Journal line currency-level integrity
-- 3) DB helper functions for rates/conversion
-- 4) Base-currency safety in mapped event posting

-- =====================================================
-- 1) Currency master
-- =====================================================
create table if not exists public.currencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  symbol text not null default '',
  is_base boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currencies_code_uppercase check (code = upper(code))
);

create unique index if not exists uq_currencies_single_base
  on public.currencies (is_base)
  where is_base = true;

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency_id uuid not null references public.currencies(id) on delete cascade,
  rate_date date not null,
  rate_to_base numeric(18,8) not null check (rate_to_base > 0),
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exchange_rates_unique_per_day unique (currency_id, rate_date)
);

create index if not exists idx_exchange_rates_currency_date
  on public.exchange_rates(currency_id, rate_date desc);

insert into public.currencies (code, name, symbol, is_base, is_active)
values
  ('PKR', 'Pakistani Rupee', 'Rs', true, true),
  ('USD', 'US Dollar', '$', false, true),
  ('RMB', 'Chinese Yuan', 'Â¥', false, true),
  ('AED', 'UAE Dirham', 'Ø¯.Ø¥', false, true)
on conflict (code) do update
set is_active = excluded.is_active,
    updated_at = now();

-- =====================================================
-- 2) Journal line currency integrity
-- =====================================================
alter table public.journal_entry_lines
  add column if not exists currency_id uuid null references public.currencies(id) on delete restrict,
  add column if not exists base_currency_amount numeric(15,2),
  add column if not exists foreign_currency text,
  add column if not exists foreign_amount numeric(15,2),
  add column if not exists exchange_rate numeric(18,8);

update public.journal_entry_lines
set base_currency_amount = greatest(debit_amount, credit_amount)
where base_currency_amount is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_base_currency_amount_non_negative'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_base_currency_amount_non_negative
      check (base_currency_amount is not null and base_currency_amount >= 0) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_foreign_requirements_check'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_foreign_requirements_check
      check (
        (
          foreign_currency is null
          and foreign_amount is null
          and exchange_rate is null
          and currency_id is null
        )
        or
        (
          foreign_currency is not null
          and foreign_amount is not null
          and foreign_amount > 0
          and exchange_rate is not null
          and exchange_rate > 0
        )
      ) not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_base_currency_amount_non_negative;
  exception
    when others then
      raise notice 'journal_entry_lines_base_currency_amount_non_negative left NOT VALID: %', SQLERRM;
  end;

  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_foreign_requirements_check;
  exception
    when others then
      raise notice 'journal_entry_lines_foreign_requirements_check left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_journal_entry_lines_currency_id
  on public.journal_entry_lines(currency_id);

-- =====================================================
-- 3) Rate helper functions
-- =====================================================
create or replace function public.get_exchange_rate(
  p_currency_code text,
  p_rate_date date default current_date
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  _base_code text;
  _code text;
  _rate numeric(18,8);
begin
  _code := upper(coalesce(p_currency_code, ''));
  if _code = '' then
    raise exception 'Currency code is required.';
  end if;

  select code
  into _base_code
  from public.currencies
  where is_base = true
  limit 1;

  if _base_code is null then
    raise exception 'Base currency is not configured.';
  end if;

  if _code = _base_code then
    return 1;
  end if;

  select er.rate_to_base
  into _rate
  from public.exchange_rates er
  join public.currencies c on c.id = er.currency_id
  where c.code = _code
    and c.is_active = true
    and er.rate_date <= coalesce(p_rate_date, current_date)
  order by er.rate_date desc
  limit 1;

  if _rate is null then
    raise exception 'Exchange rate not found for % on or before %.', _code, coalesce(p_rate_date, current_date);
  end if;

  return _rate;
end
$$;

create or replace function public.convert_to_base(
  p_foreign_amount numeric,
  p_rate_to_base numeric
)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_foreign_amount is null or p_foreign_amount <= 0 then
    raise exception 'Foreign amount must be greater than zero.';
  end if;
  if p_rate_to_base is null or p_rate_to_base <= 0 then
    raise exception 'Exchange rate must be greater than zero.';
  end if;
  return round(p_foreign_amount * p_rate_to_base, 2);
end
$$;

grant execute on function public.get_exchange_rate(text, date) to service_role;
grant execute on function public.convert_to_base(numeric, numeric) to service_role;

-- =====================================================
-- 4) Strengthen mapped event posting (base balance check)
-- =====================================================
create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_type text not null,
  reference_id text not null,
  idempotency_key text not null unique,
  source_module text not null,
  processed boolean not null default false,
  processed_at timestamptz null,
  journal_entry_id uuid null references public.journal_entries(id) on delete set null,
  processing_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_logs_lookup
  on public.event_logs(event_type, reference_id, processed);

create or replace function public.process_mapped_journal_event(
  p_event_id uuid,
  p_event_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_source_module text,
  p_created_by_module text,
  p_source_type text,
  p_source_id text,
  p_entry_date date,
  p_journal_id uuid,
  p_reference text,
  p_lines jsonb
)
returns table(processed boolean, journal_entry_id uuid, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_log event_logs%rowtype;
  _entry_id uuid;
  _line_count integer;
  _base_debit numeric(15,2);
  _base_credit numeric(15,2);
begin
  select *
  into existing_log
  from event_logs
  where idempotency_key = p_idempotency_key
  for update;

  if found and existing_log.processed then
    return query select true, existing_log.journal_entry_id, 'Duplicate event skipped';
    return;
  end if;

  if found and not existing_log.processed then
    update event_logs
    set event_id = p_event_id,
        event_type = p_event_type,
        reference_id = p_reference_id,
        source_module = p_source_module,
        updated_at = now(),
        processing_error = null
    where id = existing_log.id;
  else
    insert into event_logs(event_id, event_type, reference_id, idempotency_key, source_module, processed, created_at, updated_at)
    values (p_event_id, p_event_type, p_reference_id, p_idempotency_key, p_source_module, false, now(), now());
  end if;

  _line_count := coalesce(jsonb_array_length(p_lines), 0);
  if _line_count < 2 then
    raise exception 'Journal entry must have at least two lines';
  end if;

  select
    round(coalesce(sum(case when coalesce((line ->> 'debit_amount')::numeric, 0) > 0
                       then coalesce((line ->> 'base_currency_amount')::numeric, greatest(coalesce((line ->> 'debit_amount')::numeric, 0), coalesce((line ->> 'credit_amount')::numeric, 0)))
                       else 0 end), 0), 2),
    round(coalesce(sum(case when coalesce((line ->> 'credit_amount')::numeric, 0) > 0
                       then coalesce((line ->> 'base_currency_amount')::numeric, greatest(coalesce((line ->> 'debit_amount')::numeric, 0), coalesce((line ->> 'credit_amount')::numeric, 0)))
                       else 0 end), 0), 2)
  into _base_debit, _base_credit
  from jsonb_array_elements(p_lines) as line;

  if _base_debit <= 0 or _base_credit <= 0 or _base_debit <> _base_credit then
    raise exception 'Journal entry must be balanced in base currency.';
  end if;

  insert into journal_entries (
    reference,
    entry_date,
    journal_id,
    status,
    total_debit,
    total_credit,
    source_type,
    source_id,
    created_by_module,
    event_id,
    updated_at
  )
  values (
    p_reference,
    p_entry_date,
    p_journal_id,
    'draft',
    0,
    0,
    p_source_type,
    p_source_id,
    p_created_by_module,
    p_event_id,
    now()
  )
  returning id into _entry_id;

  insert into journal_entry_lines (
    journal_entry_id,
    line_order,
    account_id,
    partner_reference,
    description,
    debit_amount,
    credit_amount,
    shipment_reference,
    base_currency_amount,
    foreign_currency,
    foreign_amount,
    exchange_rate,
    tax_code,
    tax_amount,
    updated_at
  )
  select
    _entry_id,
    row_number() over (),
    (line ->> 'account_id')::uuid,
    nullif(line ->> 'partner_reference', ''),
    coalesce(line ->> 'description', ''),
    coalesce((line ->> 'debit_amount')::numeric, 0),
    coalesce((line ->> 'credit_amount')::numeric, 0),
    nullif(line ->> 'shipment_reference', ''),
    coalesce((line ->> 'base_currency_amount')::numeric, greatest(coalesce((line ->> 'debit_amount')::numeric, 0), coalesce((line ->> 'credit_amount')::numeric, 0))),
    nullif(line ->> 'foreign_currency', ''),
    coalesce((line ->> 'foreign_amount')::numeric, null),
    coalesce((line ->> 'exchange_rate')::numeric, null),
    nullif(line ->> 'tax_code', ''),
    coalesce((line ->> 'tax_amount')::numeric, 0),
    now()
  from jsonb_array_elements(p_lines) as line;

  perform * from post_journal_entry_strict(_entry_id);

  update event_logs
  set processed = true,
      processed_at = now(),
      journal_entry_id = _entry_id,
      updated_at = now(),
      processing_error = null
  where idempotency_key = p_idempotency_key;

  return query select true, _entry_id, 'Processed';
exception
  when others then
    update event_logs
    set processed = false,
        processing_error = SQLERRM,
        updated_at = now()
    where idempotency_key = p_idempotency_key;
    raise;
end
$$;




-- =====================================================
-- Source: supabase\migrations\integrate_event_driven_accounting_architecture.sql
-- =====================================================

create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_type text not null,
  reference_id text not null,
  idempotency_key text not null unique,
  source_module text not null,
  processed boolean not null default false,
  processed_at timestamptz null,
  journal_entry_id uuid null references public.journal_entries(id) on delete set null,
  processing_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_logs_lookup
  on public.event_logs(event_type, reference_id, processed);

alter table public.journal_entries
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists created_by_module text,
  add column if not exists event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_event_id_unique'
      and conrelid = 'public.journal_entries'::regclass
  ) then
    alter table public.journal_entries
      add constraint journal_entries_event_id_unique unique (event_id);
  end if;
end
$$;

alter table public.journal_entry_lines
  add column if not exists shipment_reference text,
  add column if not exists base_currency_amount numeric(15,2),
  add column if not exists foreign_currency text,
  add column if not exists foreign_amount numeric(15,2),
  add column if not exists exchange_rate numeric(18,8),
  add column if not exists tax_code text,
  add column if not exists tax_amount numeric(15,2) not null default 0;

create index if not exists idx_journal_entries_source
  on public.journal_entries(source_type, source_id);

create index if not exists idx_journal_entry_lines_shipment_reference
  on public.journal_entry_lines(shipment_reference);

create table if not exists public.shipment_cost_sheets (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  cost_type text not null check (cost_type in ('freight', 'duty', 'clearance', 'warehouse')),
  vendor_partner_id uuid not null references public.partners(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  currency text not null default 'PKR',
  status text not null default 'draft' check (status in ('draft', 'billed')),
  source_bill_id uuid null references public.vendor_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipment_cost_sheets_shipment
  on public.shipment_cost_sheets(shipment_id, status);

create table if not exists public.customer_charge_sheets (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  charge_type text not null,
  amount numeric(15,2) not null check (amount > 0),
  currency text not null default 'PKR',
  status text not null default 'draft' check (status in ('draft', 'invoiced')),
  source_invoice_id uuid null references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_charge_sheets_shipment
  on public.customer_charge_sheets(shipment_id, status);

create table if not exists public.tradeflow_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_partner_id uuid not null references public.partners(id) on delete restrict,
  shipment_id text null,
  transaction_type text not null check (transaction_type in ('purchase', 'delivery', 'repayment')),
  amount numeric(15,2) not null check (amount > 0),
  outstanding_amount numeric(15,2) not null check (outstanding_amount >= 0),
  due_date date null,
  status text not null default 'open' check (status in ('open', 'overdue', 'closed')),
  source_reference text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tradeflow_credit_ledger_customer
  on public.tradeflow_credit_ledger(customer_partner_id, status, due_date);

alter table public.event_logs enable row level security;
alter table public.shipment_cost_sheets enable row level security;
alter table public.customer_charge_sheets enable row level security;
alter table public.tradeflow_credit_ledger enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_logs'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.event_logs
      for all
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_cost_sheets'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.shipment_cost_sheets
      for all
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_charge_sheets'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.customer_charge_sheets
      for all
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tradeflow_credit_ledger'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.tradeflow_credit_ledger
      for all
      using (true)
      with check (true);
  end if;
end
$$;

create or replace function public.process_mapped_journal_event(
  p_event_id uuid,
  p_event_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_source_module text,
  p_created_by_module text,
  p_source_type text,
  p_source_id text,
  p_entry_date date,
  p_journal_id uuid,
  p_reference text,
  p_lines jsonb
)
returns table(processed boolean, journal_entry_id uuid, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_log event_logs%rowtype;
  _entry_id uuid;
  _line_count integer;
begin
  select *
  into existing_log
  from event_logs
  where idempotency_key = p_idempotency_key
  for update;

  if found and existing_log.processed then
    return query select true, existing_log.journal_entry_id, 'Duplicate event skipped';
    return;
  end if;

  if found and not existing_log.processed then
    update event_logs
    set event_id = p_event_id,
        event_type = p_event_type,
        reference_id = p_reference_id,
        source_module = p_source_module,
        updated_at = now(),
        processing_error = null
    where id = existing_log.id;
  else
    insert into event_logs(event_id, event_type, reference_id, idempotency_key, source_module, processed, created_at, updated_at)
    values (p_event_id, p_event_type, p_reference_id, p_idempotency_key, p_source_module, false, now(), now());
  end if;

  _line_count := coalesce(jsonb_array_length(p_lines), 0);
  if _line_count < 2 then
    raise exception 'Journal entry must have at least two lines';
  end if;

  insert into journal_entries (
    reference,
    entry_date,
    journal_id,
    status,
    total_debit,
    total_credit,
    source_type,
    source_id,
    created_by_module,
    event_id,
    updated_at
  )
  values (
    p_reference,
    p_entry_date,
    p_journal_id,
    'draft',
    0,
    0,
    p_source_type,
    p_source_id,
    p_created_by_module,
    p_event_id,
    now()
  )
  returning id into _entry_id;

  insert into journal_entry_lines (
    journal_entry_id,
    line_order,
    account_id,
    partner_reference,
    description,
    debit_amount,
    credit_amount,
    shipment_reference,
    base_currency_amount,
    foreign_currency,
    foreign_amount,
    exchange_rate,
    tax_code,
    tax_amount,
    updated_at
  )
  select
    _entry_id,
    row_number() over (),
    (line ->> 'account_id')::uuid,
    nullif(line ->> 'partner_reference', ''),
    coalesce(line ->> 'description', ''),
    coalesce((line ->> 'debit_amount')::numeric, 0),
    coalesce((line ->> 'credit_amount')::numeric, 0),
    nullif(line ->> 'shipment_reference', ''),
    coalesce((line ->> 'base_currency_amount')::numeric, null),
    nullif(line ->> 'foreign_currency', ''),
    coalesce((line ->> 'foreign_amount')::numeric, null),
    coalesce((line ->> 'exchange_rate')::numeric, null),
    nullif(line ->> 'tax_code', ''),
    coalesce((line ->> 'tax_amount')::numeric, 0),
    now()
  from jsonb_array_elements(p_lines) as line;

  perform * from post_journal_entry_strict(_entry_id);

  update event_logs
  set processed = true,
      processed_at = now(),
      journal_entry_id = _entry_id,
      updated_at = now(),
      processing_error = null
  where idempotency_key = p_idempotency_key;

  return query select true, _entry_id, 'Processed';
exception
  when others then
    update event_logs
    set processed = false,
        processing_error = SQLERRM,
        updated_at = now()
    where idempotency_key = p_idempotency_key;
    raise;
end
$$;

grant execute on function public.process_mapped_journal_event(
  uuid, text, text, text, text, text, text, text, date, uuid, text, jsonb
) to service_role;




-- =====================================================
-- Source: supabase\migrations\implement_tax_and_withholding_engine.sql
-- =====================================================

-- Configurable tax and withholding engine
-- Scope:
-- 1) Tax master
-- 2) Tax application audit tables
-- 3) Minimal constraints for flexible global usage

create table if not exists public.taxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('sales_tax', 'purchase_tax', 'withholding_tax')),
  rate_type text not null check (rate_type in ('percentage', 'fixed')),
  rate_value numeric(15,6) not null check (rate_value >= 0),
  is_inclusive boolean not null default false,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_taxes_type_active
  on public.taxes(type, is_active);

create table if not exists public.tax_applications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('invoice', 'vendor_bill', 'payment')),
  source_id text not null,
  source_line_key text not null,
  tax_id uuid not null references public.taxes(id) on delete restrict,
  currency_code text null,
  exchange_rate numeric(18,8) null,
  base_amount numeric(15,2) not null check (base_amount >= 0),
  tax_amount numeric(15,2) not null check (tax_amount >= 0),
  gross_amount numeric(15,2) not null check (gross_amount >= 0),
  foreign_base_amount numeric(15,2) null,
  foreign_tax_amount numeric(15,2) null,
  foreign_gross_amount numeric(15,2) null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tax_applications_source
  on public.tax_applications(source_type, source_id);

create index if not exists idx_tax_applications_tax
  on public.tax_applications(tax_id);

create table if not exists public.withholding_applications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('payment', 'vendor_bill')),
  source_id text not null,
  withholding_tax_id uuid not null references public.taxes(id) on delete restrict,
  base_amount numeric(15,2) not null check (base_amount >= 0),
  withheld_amount numeric(15,2) not null check (withheld_amount >= 0),
  currency_code text null,
  exchange_rate numeric(18,8) null,
  foreign_base_amount numeric(15,2) null,
  foreign_withheld_amount numeric(15,2) null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_withholding_applications_source
  on public.withholding_applications(source_type, source_id);




-- =====================================================
-- Source: supabase\migrations\implement_line_level_reconciliation_engine.sql
-- =====================================================

-- Production-grade line-level reconciliation engine
-- Scope:
-- 1) Extend journal_entry_lines for line-level reconciliation tracking
-- 2) Add reconciliation/audit tables
-- 3) Add bank_transactions + COD discrepancy tracking
-- 4) Add RPCs:
--    - reconcile_invoice_payment
--    - reconcile_payment_bank
--    - reconcile_cod_settlement
--    - unreconcile

-- =====================================================
-- 1) journal_entry_lines reconciliation fields
-- =====================================================
alter table public.journal_entry_lines
  add column if not exists reconciled_amount numeric(15,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_reconciled_amount_non_negative'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_reconciled_amount_non_negative
      check (reconciled_amount >= 0) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_reconciled_amount_within_line_total'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_reconciled_amount_within_line_total
      check (reconciled_amount <= greatest(debit_amount, credit_amount)) not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_reconciled_amount_non_negative;
  exception
    when others then
      raise notice 'journal_entry_lines_reconciled_amount_non_negative left NOT VALID: %', SQLERRM;
  end;

  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_reconciled_amount_within_line_total;
  exception
    when others then
      raise notice 'journal_entry_lines_reconciled_amount_within_line_total left NOT VALID: %', SQLERRM;
  end;
end
$$;

alter table public.journal_entry_lines
  add column if not exists open_balance numeric(15,2)
  generated always as (greatest(debit_amount, credit_amount) - reconciled_amount) stored;

alter table public.journal_entry_lines
  add column if not exists is_reconciled boolean
  generated always as ((greatest(debit_amount, credit_amount) - reconciled_amount) <= 0) stored;

-- =====================================================
-- 2) Reconciliation tables
-- =====================================================
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('invoice', 'bank', 'cod')),
  status text not null default 'active' check (status in ('active', 'reversed')),
  notes text null,
  created_at timestamptz not null default now(),
  created_by text not null,
  reversed_at timestamptz null,
  reversed_by text null
);

create table if not exists public.reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations(id) on delete cascade,
  journal_entry_line_id uuid not null references public.journal_entry_lines(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by text not null
);

create index if not exists idx_reconciliation_lines_reconciliation_id
  on public.reconciliation_lines(reconciliation_id);

create index if not exists idx_reconciliation_lines_journal_line_id
  on public.reconciliation_lines(journal_entry_line_id);

alter table public.journal_entry_lines
  add column if not exists reconciliation_id uuid null references public.reconciliations(id) on delete set null;

create index if not exists idx_journal_entry_lines_reconciliation_id
  on public.journal_entry_lines(reconciliation_id);

create index if not exists idx_journal_entry_lines_open_balance
  on public.journal_entry_lines(account_id, partner_id, open_balance);

-- =====================================================
-- 3) Bank transactions + COD discrepancy tracking
-- =====================================================
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  reference text not null,
  description text null,
  amount numeric(15,2) not null check (amount > 0),
  direction text not null check (direction in ('deposit', 'withdrawal')),
  bank_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  clearing_account_id uuid null references public.chart_of_accounts(id) on delete restrict,
  partner_id uuid null references public.partners(id) on delete restrict,
  posted_journal_entry_id uuid null references public.journal_entries(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reconciled')),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_transactions_status_date
  on public.bank_transactions(status, transaction_date desc);

create table if not exists public.cod_discrepancies (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations(id) on delete cascade,
  cod_collection_line_id uuid not null references public.journal_entry_lines(id) on delete restrict,
  expected_amount numeric(15,2) not null check (expected_amount >= 0),
  matched_amount numeric(15,2) not null check (matched_amount >= 0),
  difference_amount numeric(15,2) not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  reason text not null default 'COD mismatch between collection and settlement/fees',
  created_at timestamptz not null default now(),
  created_by text not null
);

create index if not exists idx_cod_discrepancies_status
  on public.cod_discrepancies(status, created_at desc);

-- =====================================================
-- 4) Helpers
-- =====================================================
create or replace function public._assert_posted_line(p_line_id uuid)
returns public.journal_entry_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  _line public.journal_entry_lines%rowtype;
  _status text;
begin
  select jel.*
  into _line
  from public.journal_entry_lines jel
  where jel.id = p_line_id
  for update;

  if not found then
    raise exception 'Journal line not found.';
  end if;

  select je.status
  into _status
  from public.journal_entries je
  where je.id = _line.journal_entry_id
  for update;

  if not found then
    raise exception 'Parent journal entry not found for line %.', p_line_id;
  end if;
  if _status <> 'posted' then
    raise exception 'Only posted journal lines can be reconciled.';
  end if;
  return _line;
end
$$;

create or replace function public._apply_reconciliation_line(
  p_reconciliation_id uuid,
  p_line_id uuid,
  p_amount numeric,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _line public.journal_entry_lines%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Reconciliation amount must be greater than zero.';
  end if;

  select * into _line
  from public._assert_posted_line(p_line_id);

  if p_amount > _line.open_balance then
    raise exception 'Reconciliation amount exceeds open balance for line %.', p_line_id;
  end if;

  insert into public.reconciliation_lines (reconciliation_id, journal_entry_line_id, amount, created_by)
  values (p_reconciliation_id, p_line_id, round(p_amount, 2), p_actor);

  update public.journal_entry_lines
  set reconciled_amount = round(reconciled_amount + p_amount, 2),
      reconciliation_id = p_reconciliation_id
  where id = p_line_id;
end
$$;

-- =====================================================
-- 5) Invoice <-> Payment reconciliation (AR/AP)
-- =====================================================
create or replace function public.reconcile_invoice_payment(
  p_invoice_line_id uuid,
  p_payment_line_id uuid,
  p_amount numeric,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _invoice_line public.journal_entry_lines%rowtype;
  _payment_line public.journal_entry_lines%rowtype;
  _recon_id uuid;
  _amount numeric(15,2);
  _invoice_id uuid;
  _payment_id uuid;
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  _amount := round(coalesce(p_amount, 0), 2);
  if _amount <= 0 then
    raise exception 'Reconciliation amount must be greater than zero.';
  end if;

  select * into _invoice_line from public._assert_posted_line(p_invoice_line_id);
  select * into _payment_line from public._assert_posted_line(p_payment_line_id);

  if _invoice_line.account_id <> _payment_line.account_id then
    raise exception 'Account mismatch: lines must use same reconciliation account.';
  end if;
  if _invoice_line.partner_id is null or _payment_line.partner_id is null then
    raise exception 'Partner is required for AR/AP reconciliation.';
  end if;
  if _invoice_line.partner_id <> _payment_line.partner_id then
    raise exception 'Partner mismatch: lines must belong to same partner.';
  end if;
  if _invoice_line.debit_amount <= 0 then
    raise exception 'Invoice line must be a debit line.';
  end if;
  if _payment_line.credit_amount <= 0 and _payment_line.debit_amount <= 0 then
    raise exception 'Payment line must carry amount on one side.';
  end if;
  if _amount > _invoice_line.open_balance or _amount > _payment_line.open_balance then
    raise exception 'Reconciliation amount exceeds open balance.';
  end if;

  insert into public.reconciliations (type, created_by, notes)
  values ('invoice', p_actor, 'Invoice <-> Payment line reconciliation')
  returning id into _recon_id;

  perform public._apply_reconciliation_line(_recon_id, _invoice_line.id, _amount, p_actor);
  perform public._apply_reconciliation_line(_recon_id, _payment_line.id, _amount, p_actor);

  -- Update invoice state (business mirror, source of truth remains ledger lines)
  select i.id into _invoice_id
  from public.invoices i
  where i.posted_journal_entry_id = _invoice_line.journal_entry_id
  limit 1;

  if _invoice_id is not null then
    update public.invoices
    set paid_amount = round(paid_amount + _amount, 2),
        outstanding_amount = round(greatest(total_amount - (paid_amount + _amount), 0), 2),
        invoice_status = case
          when round(greatest(total_amount - (paid_amount + _amount), 0), 2) = 0 then 'paid'
          when round(paid_amount + _amount, 2) > 0 then 'partially_paid'
          else 'posted'
        end,
        payment_status = case
          when round(greatest(total_amount - (paid_amount + _amount), 0), 2) = 0 then 'paid'
          when round(paid_amount + _amount, 2) > 0 then 'partial'
          else 'unpaid'
        end,
        updated_at = now()
    where id = _invoice_id;
  end if;

  select p.id into _payment_id
  from public.payments p
  where p.posted_journal_entry_id = _payment_line.journal_entry_id
  limit 1;

  if _payment_id is not null then
    update public.payments
    set allocated_amount = round(allocated_amount + _amount, 2),
        status = case
          when round(allocated_amount + _amount, 2) >= round(amount, 2) then 'reconciled'
          else 'posted'
        end,
        reconciled_at = case
          when round(allocated_amount + _amount, 2) >= round(amount, 2) then now()
          else reconciled_at
        end,
        updated_at = now()
    where id = _payment_id;
  end if;

  return _recon_id;
end
$$;

-- =====================================================
-- 6) Payment <-> Bank reconciliation (clearing account)
-- =====================================================
create or replace function public.reconcile_payment_bank(
  p_payment_line_id uuid,
  p_bank_line_id uuid,
  p_amount numeric,
  p_actor text,
  p_tolerance numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _payment_line public.journal_entry_lines%rowtype;
  _bank_line public.journal_entry_lines%rowtype;
  _recon_id uuid;
  _amount numeric(15,2);
  _bt_id uuid;
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  _amount := round(coalesce(p_amount, 0), 2);
  if _amount <= 0 then
    raise exception 'Reconciliation amount must be greater than zero.';
  end if;
  if coalesce(p_tolerance, 0) < 0 then
    raise exception 'Tolerance cannot be negative.';
  end if;

  select * into _payment_line from public._assert_posted_line(p_payment_line_id);
  select * into _bank_line from public._assert_posted_line(p_bank_line_id);

  if _payment_line.account_id <> _bank_line.account_id then
    raise exception 'Account mismatch: payment and bank lines must use same clearing account.';
  end if;

  if _amount > _payment_line.open_balance + coalesce(p_tolerance, 0)
     or _amount > _bank_line.open_balance + coalesce(p_tolerance, 0) then
    raise exception 'Reconciliation amount exceeds open balance with tolerance.';
  end if;

  insert into public.reconciliations (type, created_by, notes)
  values ('bank', p_actor, 'Payment <-> Bank clearing reconciliation')
  returning id into _recon_id;

  perform public._apply_reconciliation_line(_recon_id, _payment_line.id, _amount, p_actor);
  perform public._apply_reconciliation_line(_recon_id, _bank_line.id, _amount, p_actor);

  select bt.id into _bt_id
  from public.bank_transactions bt
  where bt.posted_journal_entry_id = _bank_line.journal_entry_id
  limit 1;

  if _bt_id is not null then
    update public.bank_transactions bt
    set status = case
      when exists (
        select 1
        from public.journal_entry_lines jel
        where jel.journal_entry_id = bt.posted_journal_entry_id
          and jel.account_id = _bank_line.account_id
          and jel.open_balance > 0
      ) then 'open'
      else 'reconciled'
    end,
    updated_at = now()
    where bt.id = _bt_id;
  end if;

  return _recon_id;
end
$$;

-- =====================================================
-- 7) COD reconciliation (collection vs settlement + fees)
-- =====================================================
create or replace function public.reconcile_cod_settlement(
  p_cod_collection_line_id uuid,
  p_offset_lines jsonb,
  p_actor text,
  p_finalize boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _cod_line public.journal_entry_lines%rowtype;
  _offset jsonb;
  _offset_line public.journal_entry_lines%rowtype;
  _amount numeric(15,2);
  _total_offsets numeric(15,2) := 0;
  _recon_id uuid;
  _difference numeric(15,2);
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  if p_offset_lines is null or jsonb_typeof(p_offset_lines) <> 'array' or jsonb_array_length(p_offset_lines) = 0 then
    raise exception 'At least one COD offset line is required.';
  end if;

  select * into _cod_line from public._assert_posted_line(p_cod_collection_line_id);
  if _cod_line.debit_amount <= 0 then
    raise exception 'COD collection line must be a debit line.';
  end if;

  insert into public.reconciliations (type, created_by, notes)
  values ('cod', p_actor, 'COD collection vs settlement/fee reconciliation')
  returning id into _recon_id;

  for _offset in
    select value from jsonb_array_elements(p_offset_lines)
  loop
    _amount := round(coalesce((_offset ->> 'amount')::numeric, 0), 2);
    if _amount <= 0 then
      raise exception 'Each COD offset amount must be greater than zero.';
    end if;

    select * into _offset_line
    from public._assert_posted_line(nullif(_offset ->> 'line_id', '')::uuid);

    if _offset_line.account_id <> _cod_line.account_id then
      raise exception 'COD offset line account mismatch.';
    end if;
    if _offset_line.credit_amount <= 0 then
      raise exception 'COD offset lines must be credit lines.';
    end if;
    if _amount > _offset_line.open_balance then
      raise exception 'COD offset amount exceeds open balance for line %.', _offset_line.id;
    end if;

    _total_offsets := round(_total_offsets + _amount, 2);
    if _total_offsets > _cod_line.open_balance then
      raise exception 'Total COD offsets exceed collection open balance.';
    end if;

    perform public._apply_reconciliation_line(_recon_id, _offset_line.id, _amount, p_actor);
  end loop;

  perform public._apply_reconciliation_line(_recon_id, _cod_line.id, _total_offsets, p_actor);

  _difference := round(_cod_line.open_balance - _total_offsets, 2);
  if p_finalize and _difference <> 0 then
    insert into public.cod_discrepancies (
      reconciliation_id,
      cod_collection_line_id,
      expected_amount,
      matched_amount,
      difference_amount,
      created_by
    )
    values (
      _recon_id,
      _cod_line.id,
      round(_cod_line.open_balance, 2),
      _total_offsets,
      _difference,
      p_actor
    );
  end if;

  return _recon_id;
end
$$;

-- =====================================================
-- 8) Unreconciliation
-- =====================================================
create or replace function public.unreconcile(
  p_reconciliation_id uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _recon public.reconciliations%rowtype;
begin
  if p_reconciliation_id is null then
    raise exception 'Reconciliation id is required.';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;

  select * into _recon
  from public.reconciliations
  where id = p_reconciliation_id
  for update;

  if not found then
    raise exception 'Reconciliation not found.';
  end if;
  if _recon.status = 'reversed' then
    raise exception 'Reconciliation is already reversed.';
  end if;

  update public.journal_entry_lines jel
  set reconciled_amount = round(greatest(jel.reconciled_amount - rl.amount, 0), 2),
      reconciliation_id = null
  from public.reconciliation_lines rl
  where rl.reconciliation_id = p_reconciliation_id
    and rl.journal_entry_line_id = jel.id;

  -- Restore "latest active reconciliation_id" pointer where applicable
  update public.journal_entry_lines jel
  set reconciliation_id = latest.reconciliation_id
  from (
    select distinct on (rl.journal_entry_line_id)
      rl.journal_entry_line_id,
      rl.reconciliation_id
    from public.reconciliation_lines rl
    join public.reconciliations r
      on r.id = rl.reconciliation_id
     and r.status = 'active'
    where rl.journal_entry_line_id in (
      select journal_entry_line_id
      from public.reconciliation_lines
      where reconciliation_id = p_reconciliation_id
    )
    order by rl.journal_entry_line_id, rl.created_at desc
  ) latest
  where jel.id = latest.journal_entry_line_id;

  if _recon.type = 'invoice' then
    -- Rollback invoice paid/outstanding mirror
    with inv_agg as (
      select i.id as invoice_id, round(sum(rl.amount), 2) as amount
      from public.reconciliation_lines rl
      join public.journal_entry_lines jel on jel.id = rl.journal_entry_line_id
      join public.invoices i on i.posted_journal_entry_id = jel.journal_entry_id
      where rl.reconciliation_id = p_reconciliation_id
        and jel.debit_amount > 0
      group by i.id
    )
    update public.invoices i
    set paid_amount = round(greatest(i.paid_amount - inv_agg.amount, 0), 2),
        outstanding_amount = round(greatest(i.total_amount - greatest(i.paid_amount - inv_agg.amount, 0), 0), 2),
        invoice_status = case
          when round(greatest(i.total_amount - greatest(i.paid_amount - inv_agg.amount, 0), 0), 2) = 0 then 'paid'
          when round(greatest(i.paid_amount - inv_agg.amount, 0), 2) > 0 then 'partially_paid'
          else 'posted'
        end,
        payment_status = case
          when round(greatest(i.total_amount - greatest(i.paid_amount - inv_agg.amount, 0), 0), 2) = 0 then 'paid'
          when round(greatest(i.paid_amount - inv_agg.amount, 0), 2) > 0 then 'partial'
          else 'unpaid'
        end,
        updated_at = now()
    from inv_agg
    where i.id = inv_agg.invoice_id;

    with pay_agg as (
      select p.id as payment_id, round(sum(rl.amount), 2) as amount
      from public.reconciliation_lines rl
      join public.journal_entry_lines jel on jel.id = rl.journal_entry_line_id
      join public.payments p on p.posted_journal_entry_id = jel.journal_entry_id
      where rl.reconciliation_id = p_reconciliation_id
      group by p.id
    )
    update public.payments p
    set allocated_amount = round(greatest(p.allocated_amount - pay_agg.amount, 0), 2),
        status = case
          when p.status = 'reversed' then 'reversed'
          when round(greatest(p.allocated_amount - pay_agg.amount, 0), 2) >= round(p.amount, 2) then 'reconciled'
          else 'posted'
        end,
        reconciled_at = case
          when round(greatest(p.allocated_amount - pay_agg.amount, 0), 2) >= round(p.amount, 2) then p.reconciled_at
          else null
        end,
        updated_at = now()
    from pay_agg
    where p.id = pay_agg.payment_id;
  elsif _recon.type = 'bank' then
    update public.bank_transactions bt
    set status = 'open',
        updated_at = now()
    where exists (
      select 1
      from public.reconciliation_lines rl
      join public.journal_entry_lines jel on jel.id = rl.journal_entry_line_id
      where rl.reconciliation_id = p_reconciliation_id
        and bt.posted_journal_entry_id = jel.journal_entry_id
    );
  end if;

  update public.reconciliations
  set status = 'reversed',
      reversed_by = p_actor,
      reversed_at = now()
  where id = p_reconciliation_id;
end
$$;

grant execute on function public.reconcile_invoice_payment(uuid, uuid, numeric, text) to service_role;
grant execute on function public.reconcile_payment_bank(uuid, uuid, numeric, text, numeric) to service_role;
grant execute on function public.reconcile_cod_settlement(uuid, jsonb, text, boolean) to service_role;
grant execute on function public.unreconcile(uuid, text) to service_role;




-- =====================================================
-- Source: supabase\migrations\enforce_document_lifecycle_management.sql
-- =====================================================

-- Document lifecycle management (backward-compatible hardening)
-- Scope:
-- - State machines for invoices, vendor bills, payments, journal entries
-- - DB transition validation + immutability guards
-- - Audit trail columns
-- - Posted deletion protection
-- - Reconciliation updates to partially_paid/reconciled states

-- =====================================================
-- 1) Audit trail columns
-- =====================================================
alter table public.invoices
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists posted_by text,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;

alter table public.vendor_bills
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists posted_by text,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;

alter table public.payments
  add column if not exists posted_by text,
  add column if not exists posted_at timestamptz,
  add column if not exists reconciled_by text,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz;

alter table public.journal_entries
  add column if not exists posted_by text,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz;

-- =====================================================
-- 2) Expand status constraints safely
-- =====================================================
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'invoices'
      and constraint_name = 'invoices_invoice_status_check'
  ) then
    alter table public.invoices drop constraint invoices_invoice_status_check;
  end if;
end
$$;

alter table public.invoices
  add constraint invoices_invoice_status_check
  check (invoice_status in ('draft', 'approved', 'confirmed', 'posted', 'partially_paid', 'paid', 'cancelled'));

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vendor_bills'
      and constraint_name = 'vendor_bills_status_check'
  ) then
    alter table public.vendor_bills drop constraint vendor_bills_status_check;
  end if;
end
$$;

alter table public.vendor_bills
  add constraint vendor_bills_status_check
  check (status in ('draft', 'approved', 'posted', 'partially_paid', 'paid', 'cancelled'));

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payments'
      and constraint_name = 'payments_status_check'
  ) then
    alter table public.payments drop constraint payments_status_check;
  end if;
end
$$;

alter table public.payments
  add constraint payments_status_check
  check (status in ('draft', 'posted', 'reconciled', 'reversed'));

-- =====================================================
-- 3) Transition validators + immutability guards
-- =====================================================
create or replace function public.enforce_invoice_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_status <> 'draft' then
      raise exception 'Only draft invoices can be deleted. Use cancellation/reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Status transition validation
    if old.invoice_status <> new.invoice_status then
      if old.invoice_status = 'draft' and new.invoice_status in ('approved', 'confirmed', 'cancelled') then
        null;
      elsif old.invoice_status in ('approved', 'confirmed') and new.invoice_status in ('posted', 'cancelled') then
        null;
      elsif old.invoice_status = 'posted' and new.invoice_status in ('partially_paid', 'paid', 'cancelled') then
        null;
      elsif old.invoice_status = 'partially_paid' and new.invoice_status in ('paid', 'cancelled') then
        null;
      elsif old.invoice_status = 'paid' and new.invoice_status = 'cancelled' then
        null;
      else
        raise exception 'Invalid invoice state transition: % -> %', old.invoice_status, new.invoice_status;
      end if;
    end if;

    -- Immutability of posted financial fields
    if old.invoice_status in ('posted', 'partially_paid', 'paid') then
      if (new.quotation_id, new.partner_id, new.customer_name, new.product_service, new.quantity, new.unit_price, new.total_amount, new.invoice_date, new.due_date)
         is distinct from
         (old.quotation_id, old.partner_id, old.customer_name, old.product_service, old.quantity, old.unit_price, old.total_amount, old.invoice_date, old.due_date) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_invoice_lifecycle on public.invoices;
create trigger trg_enforce_invoice_lifecycle
before update or delete on public.invoices
for each row execute function public.enforce_invoice_lifecycle();

create or replace function public.enforce_vendor_bill_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft vendor bills can be deleted. Use cancellation/reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'draft' and new.status in ('approved', 'cancelled') then
        null;
      elsif old.status = 'approved' and new.status in ('posted', 'cancelled') then
        null;
      elsif old.status = 'posted' and new.status in ('partially_paid', 'paid', 'cancelled') then
        null;
      elsif old.status = 'partially_paid' and new.status in ('paid', 'cancelled') then
        null;
      elsif old.status = 'paid' and new.status = 'cancelled' then
        null;
      else
        raise exception 'Invalid vendor bill state transition: % -> %', old.status, new.status;
      end if;
    end if;

    if old.status in ('posted', 'partially_paid', 'paid') then
      if (new.vendor_partner_id, new.bill_number, new.bill_date, new.due_date, new.total_amount, new.expense_account_id, new.payable_account_id)
         is distinct from
         (old.vendor_partner_id, old.bill_number, old.bill_date, old.due_date, old.total_amount, old.expense_account_id, old.payable_account_id) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_vendor_bill_lifecycle on public.vendor_bills;
create trigger trg_enforce_vendor_bill_lifecycle
before update or delete on public.vendor_bills
for each row execute function public.enforce_vendor_bill_lifecycle();

create or replace function public.enforce_payment_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft payments can be deleted. Use reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'draft' and new.status = 'posted' then
        null;
      elsif old.status = 'posted' and new.status in ('reconciled', 'reversed') then
        null;
      elsif old.status = 'reconciled' and new.status = 'reversed' then
        null;
      else
        raise exception 'Invalid payment state transition: % -> %', old.status, new.status;
      end if;
    end if;

    if old.status in ('posted', 'reconciled', 'reversed') then
      if (new.payment_number, new.partner_id, new.payment_type, new.amount, new.payment_date, new.journal_id, new.receivable_account_id, new.payable_account_id, new.liquidity_account_id)
         is distinct from
         (old.payment_number, old.partner_id, old.payment_type, old.amount, old.payment_date, old.journal_id, old.receivable_account_id, old.payable_account_id, old.liquidity_account_id) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_payment_lifecycle on public.payments;
create trigger trg_enforce_payment_lifecycle
before update or delete on public.payments
for each row execute function public.enforce_payment_lifecycle();

-- =====================================================
-- 4) Reconciliation engine lifecycle status updates
-- =====================================================
create or replace function public.reconcile_payment_allocations(
  p_payment_id uuid,
  p_allocations jsonb,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row payments%rowtype;
  alloc jsonb;
  alloc_amount numeric(12,2);
  alloc_invoice_id uuid;
  alloc_vendor_bill_id uuid;
  requested_total numeric(12,2) := 0;
  invoice_row invoices%rowtype;
  bill_row vendor_bills%rowtype;
  payment_ar_account_id uuid;
  invoice_ar_account_id uuid;
  payment_ap_account_id uuid;
  bill_ap_account_id uuid;
begin
  if p_payment_id is null then
    raise exception 'Payment id is required.';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'At least one allocation is required.';
  end if;

  select * into payment_row
  from payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.';
  end if;
  if payment_row.status not in ('posted', 'reconciled') then
    raise exception 'Only posted/reconciled payments can be reconciled.';
  end if;
  if payment_row.posted_journal_entry_id is null then
    raise exception 'Posted payment must have journal entry reference.';
  end if;

  for alloc in select value from jsonb_array_elements(p_allocations)
  loop
    alloc_amount := round(coalesce((alloc ->> 'amount')::numeric, 0), 2);
    alloc_invoice_id := nullif(alloc ->> 'invoice_id', '')::uuid;
    alloc_vendor_bill_id := nullif(alloc ->> 'vendor_bill_id', '')::uuid;

    if alloc_amount <= 0 then
      raise exception 'Allocation amount must be greater than zero.';
    end if;
    if (alloc_invoice_id is null and alloc_vendor_bill_id is null)
      or (alloc_invoice_id is not null and alloc_vendor_bill_id is not null) then
      raise exception 'Each allocation must target exactly one document.';
    end if;
    requested_total := requested_total + alloc_amount;
  end loop;

  if payment_row.allocated_amount + requested_total > payment_row.amount then
    raise exception 'Cannot reconcile more than remaining payment amount.';
  end if;

  for alloc in select value from jsonb_array_elements(p_allocations)
  loop
    alloc_amount := round(coalesce((alloc ->> 'amount')::numeric, 0), 2);
    alloc_invoice_id := nullif(alloc ->> 'invoice_id', '')::uuid;
    alloc_vendor_bill_id := nullif(alloc ->> 'vendor_bill_id', '')::uuid;

    if alloc_invoice_id is not null then
      if payment_row.payment_type <> 'inbound' then
        raise exception 'Inbound payment is required for invoice reconciliation.';
      end if;

      select * into invoice_row
      from invoices
      where id = alloc_invoice_id
      for update;

      if not found then
        raise exception 'Invoice not found.';
      end if;
      if invoice_row.partner_id <> payment_row.partner_id then
        raise exception 'Payment and invoice partners must match.';
      end if;
      if invoice_row.invoice_status not in ('posted', 'partially_paid', 'paid') then
        raise exception 'Only posted/partially_paid/paid invoices can be reconciled.';
      end if;
      if invoice_row.posted_journal_entry_id is null then
        raise exception 'Invoice must have posted journal entry.';
      end if;
      if alloc_amount > invoice_row.outstanding_amount then
        raise exception 'Allocation exceeds invoice outstanding amount.';
      end if;

      select jel.account_id into payment_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.credit_amount > 0
      order by jel.line_order limit 1;

      select jel.account_id into invoice_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = invoice_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.debit_amount > 0
      order by jel.line_order limit 1;

      if payment_ar_account_id is null or invoice_ar_account_id is null then
        raise exception 'Unable to verify receivable accounts for reconciliation.';
      end if;
      if payment_ar_account_id <> invoice_ar_account_id then
        raise exception 'Receivable account mismatch between payment and invoice.';
      end if;

      insert into payment_allocations (payment_id, invoice_id, vendor_bill_id, amount, created_by)
      values (payment_row.id, invoice_row.id, null, alloc_amount, p_actor);

      update invoices
      set paid_amount = round(paid_amount + alloc_amount, 2),
          outstanding_amount = round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2),
          invoice_status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            when round(paid_amount + alloc_amount, 2) > 0 then 'partially_paid'
            else 'posted'
          end,
          payment_status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            when round(paid_amount + alloc_amount, 2) > 0 then 'partial'
            else 'unpaid'
          end,
          updated_at = now()
      where id = invoice_row.id;
    else
      if payment_row.payment_type <> 'outbound' then
        raise exception 'Outbound payment is required for vendor bill reconciliation.';
      end if;

      select * into bill_row
      from vendor_bills
      where id = alloc_vendor_bill_id
      for update;

      if not found then
        raise exception 'Vendor bill not found.';
      end if;
      if bill_row.vendor_partner_id <> payment_row.partner_id then
        raise exception 'Payment and vendor bill partners must match.';
      end if;
      if bill_row.status not in ('posted', 'partially_paid', 'paid') then
        raise exception 'Only posted/partially_paid/paid vendor bills can be reconciled.';
      end if;
      if bill_row.posted_journal_entry_id is null then
        raise exception 'Vendor bill must have posted journal entry.';
      end if;
      if alloc_amount > bill_row.outstanding_amount then
        raise exception 'Allocation exceeds vendor bill outstanding amount.';
      end if;

      select jel.account_id into payment_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.debit_amount > 0
      order by jel.line_order limit 1;

      select jel.account_id into bill_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = bill_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.credit_amount > 0
      order by jel.line_order limit 1;

      if payment_ap_account_id is null or bill_ap_account_id is null then
        raise exception 'Unable to verify payable accounts for reconciliation.';
      end if;
      if payment_ap_account_id <> bill_ap_account_id then
        raise exception 'Payable account mismatch between payment and vendor bill.';
      end if;

      insert into payment_allocations (payment_id, invoice_id, vendor_bill_id, amount, created_by)
      values (payment_row.id, null, bill_row.id, alloc_amount, p_actor);

      update vendor_bills
      set paid_amount = round(paid_amount + alloc_amount, 2),
          outstanding_amount = round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2),
          status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            when round(paid_amount + alloc_amount, 2) > 0 then 'partially_paid'
            else 'posted'
          end,
          updated_at = now()
      where id = bill_row.id;
    end if;
  end loop;

  update payments
  set allocated_amount = round(allocated_amount + requested_total, 2),
      status = case
        when round(allocated_amount + requested_total, 2) >= round(amount, 2) then 'reconciled'
        else 'posted'
      end,
      reconciled_at = case
        when round(allocated_amount + requested_total, 2) >= round(amount, 2) then now()
        else reconciled_at
      end,
      updated_at = now()
  where id = payment_row.id;
end
$$;

grant execute on function public.reconcile_payment_allocations(uuid, jsonb, text) to service_role;




-- =====================================================
-- Source: supabase\migrations\create_packing_lists_table.sql
-- =====================================================

-- =====================================================
-- Table: packing_lists
-- Purpose: Store import packing list information
-- Related Functionality: Import Packing List Module
-- =====================================================

create table if not exists packing_lists (
  id uuid primary key default gen_random_uuid(),
  build_to text not null,
  ship_to text not null,
  product_name text not null,
  hs_code text not null,
  no_of_cartons integer not null,
  weight numeric(10, 3) not null,
  net_weight numeric(10, 3) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index on created_at for sorting
create index if not exists idx_packing_lists_created_at on packing_lists(created_at desc);

-- =====================================================
-- Table: import_invoices
-- Purpose: Store import invoice information (placeholder for future)
-- Related Functionality: Import Invoice Module
-- =====================================================

create table if not exists import_invoices (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index on created_at for sorting
create index if not exists idx_import_invoices_created_at on import_invoices(created_at desc);




-- =====================================================
-- Source: supabase\migrations\create_packing_list_items_table.sql
-- =====================================================

-- =====================================================
-- Table: packing_list_items
-- Purpose: Store multiple products per packing list
-- Related Functionality: Import Packing List Module - Multiple Products
-- =====================================================

create table if not exists packing_list_items (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references packing_lists(id) on delete cascade,
  product_name text not null,
  hs_code text not null,
  no_of_cartons integer not null,
  weight numeric(10, 3) not null,
  net_weight numeric(10, 3) not null,
  item_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes
create index if not exists idx_packing_list_items_packing_list_id on packing_list_items(packing_list_id);
create index if not exists idx_packing_list_items_item_order on packing_list_items(packing_list_id, item_order);

-- Remove product-specific columns from packing_lists (they're now in items)
-- Note: Keep them for backward compatibility, but they'll be optional
alter table packing_lists
alter column product_name drop not null,
alter column hs_code drop not null,
alter column no_of_cartons drop not null,
alter column weight drop not null,
alter column net_weight drop not null;




-- =====================================================
-- Source: supabase\migrations\add_packing_list_fields.sql
-- =====================================================

-- =====================================================
-- Migration: Add additional fields to packing_lists table
-- Purpose: Support full packing list format with Bill To, Ship To, and shipping details
-- =====================================================

-- Add new columns to packing_lists table
ALTER TABLE packing_lists
ADD COLUMN IF NOT EXISTS invoice_no text,
ADD COLUMN IF NOT EXISTS bill_to_name text,
ADD COLUMN IF NOT EXISTS bill_to_address text,
ADD COLUMN IF NOT EXISTS bill_to_ntn text,
ADD COLUMN IF NOT EXISTS bill_to_phone text,
ADD COLUMN IF NOT EXISTS bill_to_email text,
ADD COLUMN IF NOT EXISTS ship_to_name text,
ADD COLUMN IF NOT EXISTS ship_to_address text,
ADD COLUMN IF NOT EXISTS ship_to_ntn text,
ADD COLUMN IF NOT EXISTS ship_to_phone text,
ADD COLUMN IF NOT EXISTS ship_to_email text,
ADD COLUMN IF NOT EXISTS payment_terms text,
ADD COLUMN IF NOT EXISTS shipped_via text,
ADD COLUMN IF NOT EXISTS coo text,
ADD COLUMN IF NOT EXISTS port_loading text,
ADD COLUMN IF NOT EXISTS port_discharge text,
ADD COLUMN IF NOT EXISTS shipping_terms text;

-- Keep existing columns for backward compatibility
-- build_to and ship_to are kept but can be migrated to bill_to_name and ship_to_name




-- =====================================================
-- Source: supabase\migrations\create_import_invoices_tables.sql
-- =====================================================

-- =====================================================
-- Table: import_invoices
-- Purpose: Store import invoice information
-- Related Functionality: Import Invoice Module
-- =====================================================

-- Add all required columns to existing import_invoices table
-- The table already exists from create_packing_lists_table.sql with only id, created_at, updated_at

alter table import_invoices
add column if not exists invoice_no text,
add column if not exists bill_to_name text,
add column if not exists bill_to_address text,
add column if not exists bill_to_ntn text,
add column if not exists bill_to_phone text,
add column if not exists bill_to_email text,
add column if not exists ship_to_name text,
add column if not exists ship_to_address text,
add column if not exists ship_to_ntn text,
add column if not exists ship_to_phone text,
add column if not exists ship_to_email text,
add column if not exists payment_terms text,
add column if not exists shipped_via text,
add column if not exists coo text,
add column if not exists port_loading text,
add column if not exists port_discharge text,
add column if not exists shipping_terms text,
add column if not exists exporter_bank_name text,
add column if not exists exporter_bank_address text,
add column if not exists exporter_bank_swift text,
add column if not exists exporter_account_name text,
add column if not exists exporter_account_address text,
add column if not exists exporter_account_number text,
add column if not exists importer_bank_name text,
add column if not exists importer_bank_address text,
add column if not exists importer_bank_swift text,
add column if not exists importer_account_name text,
add column if not exists importer_account_address text,
add column if not exists importer_account_number text,
add column if not exists importer_iban_number text;

-- Set NOT NULL constraints for required fields
-- First, update any existing rows with default values
update import_invoices 
set invoice_no = 'INV-' || upper(substring(id::text, 1, 8))
where invoice_no is null;

update import_invoices 
set bill_to_name = 'N/A'
where bill_to_name is null;

update import_invoices 
set ship_to_name = 'N/A'
where ship_to_name is null;

-- Now set NOT NULL constraints
alter table import_invoices
alter column invoice_no set not null,
alter column bill_to_name set not null,
alter column ship_to_name set not null;

-- Create index on created_at for sorting (if not exists)
create index if not exists idx_import_invoices_created_at on import_invoices(created_at desc);
create index if not exists idx_import_invoices_invoice_no on import_invoices(invoice_no);

-- =====================================================
-- Table: import_invoice_items
-- Purpose: Store multiple products per import invoice
-- Related Functionality: Import Invoice Module - Multiple Products
-- =====================================================

create table if not exists import_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references import_invoices(id) on delete cascade,
  product_name text not null,
  hs_code text not null,
  unit text not null,
  no_of_units numeric(10, 3) not null,
  unit_price numeric(10, 2) not null,
  total_amount numeric(10, 2) not null,
  item_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes
create index if not exists idx_import_invoice_items_invoice_id on import_invoice_items(invoice_id);
create index if not exists idx_import_invoice_items_item_order on import_invoice_items(invoice_id, item_order);




-- =====================================================
-- Source: supabase\migrations\add_status_column_to_consoles.sql
-- =====================================================

-- =====================================================
-- Migration: Add status column to consoles table
-- Purpose: Add status column to existing consoles table if it doesn't exist
-- Related Table: consoles
-- Related Functionality: Console Management, Loading Instructions
-- =====================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'consoles' and column_name = 'status'
  ) then
    alter table consoles add column status text not null default 'active';
    -- Update existing rows to have 'active' status
    update consoles set status = 'active' where status is null;
  end if;
end $$;




-- =====================================================
-- Source: supabase\migrations\add_log_note_activity_actions.sql
-- =====================================================

-- Migration: Add 'log_note' and 'activity' actions to quotation_logs
-- Date: 2026-03-11
-- Purpose: Enable internal log notes and activity reminders for quotations

-- =====================================================
-- Update quotation_logs table
-- =====================================================

-- Step 1: Drop the existing check constraint
ALTER TABLE quotation_logs 
DROP CONSTRAINT IF EXISTS quotation_logs_action_check;

-- Step 2: Add the new check constraint with 'log_note' and 'activity' actions
ALTER TABLE quotation_logs 
ADD CONSTRAINT quotation_logs_action_check 
CHECK (action IN ('created', 'updated', 'deleted', 'status_changed', 'printed', 'log_note', 'activity'));



