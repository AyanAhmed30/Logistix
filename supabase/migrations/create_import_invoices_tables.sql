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
