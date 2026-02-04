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

-- Create index on username for faster lookups
create index if not exists idx_orders_username on orders(username);

-- Create index on created_at for sorting
create index if not exists idx_orders_created_at on orders(created_at desc);
