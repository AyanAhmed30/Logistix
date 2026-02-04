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

-- Create index on console_id for faster lookups
create index if not exists idx_console_orders_console_id on console_orders(console_id);

-- Create index on order_id for faster lookups
create index if not exists idx_console_orders_order_id on console_orders(order_id);
