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
