-- Orders and cartons for Logistix
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  shipping_mark text not null,
  destination_country text not null,
  total_cartons integer not null,
  item_description text,
  created_at timestamptz default now()
);

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

create table if not exists serial_counter (
  id integer primary key,
  last_serial_number bigint not null
);

insert into serial_counter (id, last_serial_number)
values (1, 0)
on conflict (id) do nothing;

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
-- 1. Create the application users table
create table if not exists public.app_users (
  id uuid default gen_random_uuid() primary key,
  username text unique not null,
  password text not null,
  role text not null default 'user',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security
alter table public.app_users enable row level security;

-- 3. Create a policy to allow our Admin Client (Service Role) to do everything
-- Note: Our code uses the Service Role key for user creation to bypass RLS.
create policy "Full access for service role" 
on public.app_users 
for all 
using (true) 
with check (true);

-- Consoles table
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

-- Console orders junction table
create table if not exists console_orders (
  console_id uuid references consoles(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  primary key (console_id, order_id),
  assigned_at timestamptz default now()
);

-- Migration: Add status column to existing consoles table if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'consoles' and column_name = 'status'
  ) then
    alter table consoles add column status text not null default 'active';
  end if;
end $$;