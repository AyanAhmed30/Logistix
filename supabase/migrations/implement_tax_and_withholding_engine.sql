-- Configurable tax and withholding engine
-- Scope:
-- 1) Tax master
-- 2) Tax application audit tables
-- 3) Minimal constraints for flexible global usage

create table if not exists public.taxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('sales_tax', 'purchase_tax', 'withholding_tax')),
  rate_type text not null check (rate_type in ('percentage', 'fixed')),
  rate_value numeric(15,6) not null check (rate_value >= 0),
  is_inclusive boolean not null default false,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_taxes_type_active
  on public.taxes(type, is_active);

create table if not exists public.tax_applications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('invoice', 'vendor_bill', 'payment')),
  source_id text not null,
  source_line_key text not null,
  tax_id uuid not null references public.taxes(id) on delete restrict,
  currency_code text null,
  exchange_rate numeric(18,8) null,
  base_amount numeric(15,2) not null check (base_amount >= 0),
  tax_amount numeric(15,2) not null check (tax_amount >= 0),
  gross_amount numeric(15,2) not null check (gross_amount >= 0),
  foreign_base_amount numeric(15,2) null,
  foreign_tax_amount numeric(15,2) null,
  foreign_gross_amount numeric(15,2) null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tax_applications_source
  on public.tax_applications(source_type, source_id);

create index if not exists idx_tax_applications_tax
  on public.tax_applications(tax_id);

create table if not exists public.withholding_applications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('payment', 'vendor_bill')),
  source_id text not null,
  withholding_tax_id uuid not null references public.taxes(id) on delete restrict,
  base_amount numeric(15,2) not null check (base_amount >= 0),
  withheld_amount numeric(15,2) not null check (withheld_amount >= 0),
  currency_code text null,
  exchange_rate numeric(18,8) null,
  foreign_base_amount numeric(15,2) null,
  foreign_withheld_amount numeric(15,2) null,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_withholding_applications_source
  on public.withholding_applications(source_type, source_id);
