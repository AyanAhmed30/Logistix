-- Console loading workflow: full container, space available, return-to-warehouse scans

alter table public.consoles
  add column if not exists loading_phase text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'consoles' and c.conname = 'consoles_loading_phase_check'
  ) then
    alter table public.consoles
      add constraint consoles_loading_phase_check
      check (
        loading_phase is null
        or loading_phase in ('open', 'full_reported', 'space_available', 'closed')
      );
  end if;
end $$;

comment on column public.consoles.loading_phase is
  'When status=ready_for_loading: open | full_reported | space_available | closed';

update public.consoles
set loading_phase = 'open'
where status = 'ready_for_loading' and loading_phase is null;

alter table public.carton_scans
  add column if not exists voided_at timestamptz null,
  add column if not exists voided_by text null,
  add column if not exists void_reason text null;

-- Extend scan_type to include return
alter table public.carton_scans drop constraint if exists carton_scans_scan_type_check;

alter table public.carton_scans
  add constraint carton_scans_scan_type_check
  check (scan_type in ('inward', 'outward', 'return'));

create table if not exists public.console_order_loading (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  assignment_status text not null default 'active',
  released_at timestamptz null,
  released_by text null,
  release_reason text null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (console_id, order_id)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where t.relname = 'console_order_loading' and c.conname = 'console_order_loading_status_check'
  ) then
    alter table public.console_order_loading
      add constraint console_order_loading_status_check
      check (assignment_status in ('active', 'released', 'fully_loaded'));
  end if;
end $$;

create index if not exists idx_console_order_loading_console
  on public.console_order_loading(console_id);

create index if not exists idx_console_order_loading_order
  on public.console_order_loading(order_id);

-- Backfill loading rows for existing console_orders
insert into public.console_order_loading (console_id, order_id, assignment_status)
select co.console_id, co.order_id, 'active'
from public.console_orders co
on conflict (console_id, order_id) do nothing;

create table if not exists public.console_loading_events (
  id uuid primary key default gen_random_uuid(),
  console_id uuid not null references public.consoles(id) on delete cascade,
  event_type text not null,
  actor_username text not null,
  actor_role text not null,
  payload jsonb null,
  created_at timestamptz default now()
);

create index if not exists idx_console_loading_events_console
  on public.console_loading_events(console_id, created_at desc);

-- Row Level Security (same pattern as other Logistix tables)
alter table public.console_order_loading enable row level security;
alter table public.console_loading_events enable row level security;

drop policy if exists "Full access for service role" on public.console_order_loading;
create policy "Full access for service role"
  on public.console_order_loading
  for all
  using (true)
  with check (true);

drop policy if exists "Full access for service role" on public.console_loading_events;
create policy "Full access for service role"
  on public.console_loading_events
  for all
  using (true)
  with check (true);
