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

-- Create index on console_number for faster lookups
create index if not exists idx_consoles_console_number on consoles(console_number);

-- Create index on status for filtering
create index if not exists idx_consoles_status on consoles(status);

-- Create index on created_at for sorting
create index if not exists idx_consoles_created_at on consoles(created_at desc);
