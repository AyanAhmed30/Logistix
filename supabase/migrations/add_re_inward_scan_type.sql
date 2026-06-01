-- Third scan on same QR: re-inward back to warehouse after container full
alter table public.carton_scans drop constraint if exists carton_scans_scan_type_check;

alter table public.carton_scans
  add constraint carton_scans_scan_type_check
  check (scan_type in ('inward', 'outward', 'return', 're_inward'));

comment on column public.carton_scans.scan_type is
  'inward=receipt; outward=loaded on console; re_inward=3rd scan for cartons still in warehouse after container full; return=legacy';
