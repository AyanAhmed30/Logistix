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

