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

-- Create index on order_id for faster lookups
create index if not exists idx_cartons_order_id on cartons(order_id);

-- Create index on carton_serial_number for faster lookups
create index if not exists idx_cartons_serial_number on cartons(carton_serial_number);
