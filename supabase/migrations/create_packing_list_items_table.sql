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
