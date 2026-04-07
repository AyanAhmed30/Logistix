create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_type text not null check (partner_type in ('customer', 'vendor', 'agent', 'both')),
  email text,
  phone text,
  address text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partners_name_not_blank check (btrim(name) <> '')
);

create unique index if not exists idx_partners_name_type_unique
  on partners (lower(name), partner_type);

create index if not exists idx_partners_status_type
  on partners (status, partner_type, name);

alter table partners enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'partners'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on partners
      for all
      using (true)
      with check (true)
    $policy$;
  end if;
end
$$;

insert into partners (name, partner_type, email, phone, address, status)
select 'Ali Traders', 'customer', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('Ali Traders') and partner_type = 'customer'
);

insert into partners (name, partner_type, email, phone, address, status)
select 'ABC Supplies', 'vendor', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('ABC Supplies') and partner_type = 'vendor'
);

insert into partners (name, partner_type, email, phone, address, status)
select 'XYZ Logistics', 'agent', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('XYZ Logistics') and partner_type = 'agent'
);

insert into partners (name, partner_type, email, phone, address, status)
select 'Global Traders', 'both', null, null, null, 'active'
where not exists (
  select 1 from partners where lower(name) = lower('Global Traders') and partner_type = 'both'
);
