alter table public.cartons
  add column if not exists scan_status text not null default 'pending',
  add column if not exists scanned_at timestamptz null,
  add column if not exists scanned_by text null;

create index if not exists idx_cartons_scan_status on public.cartons(scan_status);
create index if not exists idx_cartons_scanned_at on public.cartons(scanned_at desc);
