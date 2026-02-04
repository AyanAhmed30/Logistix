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
