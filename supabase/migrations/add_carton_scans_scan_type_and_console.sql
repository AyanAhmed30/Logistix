-- Outward loading scans: same carton QR, differentiated by scan_type + console_id
alter table public.carton_scans
  add column if not exists scan_type text not null default 'inward',
  add column if not exists console_id uuid null references public.consoles(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'carton_scans' and c.conname = 'carton_scans_scan_type_check'
  ) then
    alter table public.carton_scans
      add constraint carton_scans_scan_type_check
      check (scan_type in ('inward', 'outward'));
  end if;
end $$;

create index if not exists idx_carton_scans_scan_type_username
  on public.carton_scans(scan_type, username);

create index if not exists idx_carton_scans_outward_console_carton
  on public.carton_scans(console_id, carton_id)
  where scan_type = 'outward';

-- One outward scan per carton per loading console (warehouse)
create unique index if not exists uq_carton_scans_outward_carton_console
  on public.carton_scans(carton_id, console_id)
  where scan_type = 'outward' and console_id is not null;

comment on column public.carton_scans.scan_type is 'inward = warehouse receipt; outward = load against a ready-for-loading console';
comment on column public.carton_scans.console_id is 'Set for outward scans; links to loading instruction console';
