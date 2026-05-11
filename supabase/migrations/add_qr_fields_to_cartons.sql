create extension if not exists pgcrypto;

alter table public.cartons
  add column if not exists tracking_id text null,
  add column if not exists sticker_identifier text null,
  add column if not exists scan_token uuid null;

update public.cartons
set
  tracking_id = coalesce(tracking_id, 'TRK-' || carton_serial_number),
  sticker_identifier = coalesce(sticker_identifier, carton_serial_number),
  scan_token = coalesce(scan_token, gen_random_uuid())
where tracking_id is null
   or sticker_identifier is null
   or scan_token is null;

create unique index if not exists idx_cartons_scan_token_unique
  on public.cartons(scan_token);

create index if not exists idx_cartons_tracking_id
  on public.cartons(tracking_id);
