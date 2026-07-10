-- Organization-scoped customers and quotations (isolated from admin modules)

create table if not exists public.organization_customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_name text not null,
  company_name text not null default '',
  email text not null,
  phone text not null,
  address text not null default '',
  city text not null default '',
  country text not null default '',
  postal_code text not null default '',
  tax_vat_number text not null default '',
  notes text,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_organization_customers_org_id
  on public.organization_customers (organization_id);

create index if not exists idx_organization_customers_status
  on public.organization_customers (organization_id, status);

create table if not exists public.organization_quotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  organization_customer_id uuid not null references public.organization_customers(id) on delete restrict,
  quotation_number text not null,
  source_reference text not null default '',
  invoice_date date not null,
  due_date date not null,
  payment_communication text not null default '',
  bank_account text not null default '',
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(14, 2) not null default 0,
  discount_total numeric(14, 2) not null default 0,
  tax_total numeric(14, 2) not null default 0,
  grand_total numeric(14, 2) not null default 0,
  status text not null default 'quotation' check (status in ('quotation', 'sent', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, quotation_number)
);

create index if not exists idx_organization_quotations_org_id
  on public.organization_quotations (organization_id);

create index if not exists idx_organization_quotations_status
  on public.organization_quotations (organization_id, status);

create index if not exists idx_organization_quotations_customer
  on public.organization_quotations (organization_customer_id);

alter table public.organization_customers enable row level security;
alter table public.organization_quotations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_customers'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
    on public.organization_customers
    for all
    using (true)
    with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'organization_quotations'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
    on public.organization_quotations
    for all
    using (true)
    with check (true);
  end if;
end $$;
