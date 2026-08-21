-- =====================================================
-- BASELINE MIGRATION - Complete Logistix Database Schema
-- =====================================================
-- Purpose: Single-file setup for a fresh Supabase project
-- This migration creates the complete database schema as it exists
-- after all historical migrations have been applied.
--
-- IMPORTANT: This is intended to be the ONLY SQL file executed
-- in a new Supabase project. Do not run historical migrations
-- after this baseline.
-- =====================================================

-- =====================================================
-- Extensions
-- =====================================================
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- =====================================================
-- Storage Bucket
-- =====================================================
insert into storage.buckets (id, name, public)
values ('inquiry-images', 'inquiry-images', true)
on conflict (id) do update
set public = excluded.public;

-- =====================================================
-- Core Tables (No dependencies)
-- =====================================================

-- serial_counter
create table serial_counter (
  id integer primary key,
  last_serial_number bigint not null
);

insert into serial_counter (id, last_serial_number)
values (1, 0)
on conflict (id) do nothing;

-- =====================================================
-- Functions (No dependencies)
-- =====================================================

create or replace function next_carton_serial()
returns bigint
language plpgsql
as $$
declare
  next_val bigint;
begin
  update serial_counter
  set last_serial_number = last_serial_number + 1
  where id = 1
  returning last_serial_number into next_val;

  return next_val;
end;
$$;

-- =====================================================
-- Organizations (No dependencies)
-- =====================================================

create table organizations (
  id uuid primary key default gen_random_uuid(),
  organization_name text not null,
  email text not null,
  phone text not null default '',
  address text not null default '',
  city text not null default '',
  country text not null default '',
  description text,
  username text unique,
  password text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  logo_url text,
  street text not null default '',
  street_2 text not null default '',
  state text not null default '',
  zip text not null default '',
  website text not null default '',
  branches jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_organizations_email_lower on organizations (lower(email));
create index idx_organizations_username on organizations(username);
create index idx_organizations_status on organizations(status);

alter table organizations enable row level security;

create policy "Full access for service role"
on organizations
for all
using (true)
with check (true);

create or replace function set_organizations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_organizations_updated_at on organizations;
create trigger trg_organizations_updated_at
before update on organizations
for each row
execute function set_organizations_updated_at();

-- =====================================================
-- Sales Agents (No dependencies)
-- =====================================================

create table sales_agents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone_number text,
  username text,
  password text,
  code text,
  permissions jsonb default '[]'::jsonb,
  app_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table sales_agents
add constraint sales_agents_username_key unique (username);

create index idx_sales_agents_email on sales_agents(email);
create index idx_sales_agents_username on sales_agents(username);
create index idx_sales_agents_code on sales_agents(code);
create index idx_sales_agents_created_at on sales_agents(created_at desc);
create index idx_sales_agents_permissions on sales_agents using gin(permissions);
create index idx_sales_agents_app_user_id on sales_agents(app_user_id);

alter table sales_agents enable row level security;

create policy "Full access for service role"
on sales_agents
for all
using (true)
with check (true);

-- =====================================================
-- Operations Users (No dependencies)
-- =====================================================

create table operations_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  password text not null,
  permissions jsonb default '[]'::jsonb,
  app_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_operations_users_username on operations_users(username);
create index idx_operations_users_permissions on operations_users using gin(permissions);
create index idx_operations_users_app_user_id on operations_users(app_user_id);

-- =====================================================
-- Partners (No dependencies)
-- =====================================================

create table partners (
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

create unique index idx_partners_name_type_unique on partners (lower(name), partner_type);
create index idx_partners_status_type on partners(status, partner_type, name);

alter table partners enable row level security;

create policy "Full access for service role"
on partners
for all
using (true)
with check (true);

insert into partners (name, partner_type, email, phone, address, status)
select 'Ali Traders', 'customer', null, null, null, 'active'
where not exists (select 1 from partners where lower(name) = lower('Ali Traders') and partner_type = 'customer');

insert into partners (name, partner_type, email, phone, address, status)
select 'ABC Supplies', 'vendor', null, null, null, 'active'
where not exists (select 1 from partners where lower(name) = lower('ABC Supplies') and partner_type = 'vendor');

insert into partners (name, partner_type, email, phone, address, status)
select 'XYZ Logistics', 'agent', null, null, null, 'active'
where not exists (select 1 from partners where lower(name) = lower('XYZ Logistics') and partner_type = 'agent');

insert into partners (name, partner_type, email, phone, address, status)
select 'Global Traders', 'both', null, null, null, 'active'
where not exists (select 1 from partners where lower(name) = lower('Global Traders') and partner_type = 'both');

-- =====================================================
-- Currencies (No dependencies)
-- =====================================================

create table currencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  symbol text not null default '',
  is_base boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint currencies_code_uppercase check (code = upper(code))
);

create unique index uq_currencies_single_base on currencies (is_base) where is_base = true;

insert into currencies (code, name, symbol, is_base, is_active)
values
  ('PKR', 'Pakistani Rupee', 'Rs', true, true),
  ('USD', 'US Dollar', '$', false, true),
  ('RMB', 'Chinese Yuan', '¥', false, true),
  ('AED', 'UAE Dirham', 'د.إ', false, true)
on conflict (code) do update
set is_active = excluded.is_active, updated_at = now();

-- =====================================================
-- Chart of Accounts (No dependencies)
-- =====================================================

create table chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('asset', 'liability', 'equity', 'income', 'expense', 'view')),
  parent_id uuid references chart_of_accounts(id) on delete restrict,
  allow_reconciliation boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chart_of_accounts_name_not_blank check (btrim(name) <> ''),
  constraint chart_of_accounts_code_not_blank check (btrim(code) <> ''),
  constraint chart_of_accounts_view_reconciliation check (type <> 'view' or allow_reconciliation = false)
);

create index idx_chart_of_accounts_parent_id on chart_of_accounts(parent_id);
create index idx_chart_of_accounts_active_code on chart_of_accounts(is_active, code);

alter table chart_of_accounts enable row level security;

create policy "Full access for service role"
on chart_of_accounts
for all
using (true)
with check (true);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Assets', '1000', 'view', null, false, true
where not exists (select 1 from chart_of_accounts where code = '1000');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Liabilities', '2000', 'view', null, false, true
where not exists (select 1 from chart_of_accounts where code = '2000');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Equity', '3000', 'view', null, false, true
where not exists (select 1 from chart_of_accounts where code = '3000');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Income', '4000', 'view', null, false, true
where not exists (select 1 from chart_of_accounts where code = '4000');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Expenses', '5000', 'view', null, false, true
where not exists (select 1 from chart_of_accounts where code = '5000');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Cash', '1100', 'asset', (select id from chart_of_accounts where code = '1000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '1100');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Bank', '1200', 'asset', (select id from chart_of_accounts where code = '1000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '1200');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Accounts Receivable', '1300', 'asset', (select id from chart_of_accounts where code = '1000' limit 1), true, true
where not exists (select 1 from chart_of_accounts where code = '1300');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Accounts Payable', '2100', 'liability', (select id from chart_of_accounts where code = '2000' limit 1), true, true
where not exists (select 1 from chart_of_accounts where code = '2100');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Revenue', '4100', 'income', (select id from chart_of_accounts where code = '4000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '4100');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'General Expense', '5100', 'expense', (select id from chart_of_accounts where code = '5000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '5100');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Freight Revenue', '4001', 'income', (select id from chart_of_accounts where code = '4000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '4001');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Customs Clearance Revenue', '4002', 'income', (select id from chart_of_accounts where code = '4000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '4002');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Delivery Revenue', '4003', 'income', (select id from chart_of_accounts where code = '4000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '4003');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'DDP Service Revenue', '4004', 'income', (select id from chart_of_accounts where code = '4000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '4004');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Freight Cost', '5001', 'expense', (select id from chart_of_accounts where code = '5000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '5001');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Customs Duty Cost', '5002', 'expense', (select id from chart_of_accounts where code = '5000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '5002');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Clearance Cost', '5003', 'expense', (select id from chart_of_accounts where code = '5000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '5003');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Delivery Cost', '5004', 'expense', (select id from chart_of_accounts where code = '5000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '5004');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Warehouse Cost', '5005', 'expense', (select id from chart_of_accounts where code = '5000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '5005');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Prepaid Freight', '1203', 'asset', (select id from chart_of_accounts where code = '1000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '1203');

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Prepaid Duty', '1204', 'asset', (select id from chart_of_accounts where code = '1000' limit 1), false, true
where not exists (select 1 from chart_of_accounts where code = '1204');

-- =====================================================
-- Journals (Depends on chart_of_accounts)
-- =====================================================

create table journals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('sales', 'purchase', 'bank', 'cash', 'general')),
  default_debit_account_id uuid references chart_of_accounts(id) on delete restrict,
  default_credit_account_id uuid references chart_of_accounts(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journals_name_not_blank check (btrim(name) <> ''),
  constraint journals_code_not_blank check (btrim(code) <> '')
);

create unique index idx_journals_name_unique on journals (lower(name));
create index idx_journals_type_active on journals(type, is_active, code);

alter table journals enable row level security;

create policy "Full access for service role"
on journals
for all
using (true)
with check (true);

insert into journals (name, code, type, default_debit_account_id, default_credit_account_id, is_active)
select 'Sales Journal', 'SJ', 'sales', (select id from chart_of_accounts where code = '1300' limit 1), (select id from chart_of_accounts where code = '4100' limit 1), true
where not exists (select 1 from journals where code = 'SJ');

insert into journals (name, code, type, default_debit_account_id, default_credit_account_id, is_active)
select 'Purchase Journal', 'PJ', 'purchase', (select id from chart_of_accounts where code = '5100' limit 1), (select id from chart_of_accounts where code = '2100' limit 1), true
where not exists (select 1 from journals where code = 'PJ');

insert into journals (name, code, type, default_debit_account_id, default_credit_account_id, is_active)
select 'Bank Journal', 'BNK', 'bank', (select id from chart_of_accounts where code = '1200' limit 1), (select id from chart_of_accounts where code = '1200' limit 1), true
where not exists (select 1 from journals where code = 'BNK');

insert into journals (name, code, type, default_debit_account_id, default_credit_account_id, is_active)
select 'Cash Journal', 'CSH', 'cash', (select id from chart_of_accounts where code = '1100' limit 1), (select id from chart_of_accounts where code = '1100' limit 1), true
where not exists (select 1 from journals where code = 'CSH');

insert into journals (name, code, type, default_debit_account_id, default_credit_account_id, is_active)
select 'General Journal', 'GEN', 'general', null, null, true
where not exists (select 1 from journals where code = 'GEN');

-- =====================================================
-- Exchange Rates (Depends on currencies)
-- =====================================================

create table exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency_id uuid not null references currencies(id) on delete cascade,
  rate_date date not null,
  rate_to_base numeric(18,8) not null check (rate_to_base > 0),
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exchange_rates_unique_per_day unique (currency_id, rate_date)
);

create index idx_exchange_rates_currency_date on exchange_rates(currency_id, rate_date desc);

-- =====================================================
-- Taxes (Depends on chart_of_accounts)
-- =====================================================

create table taxes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null unique,
  type text not null check (type in ('sales_tax', 'purchase_tax', 'withholding_tax')),
  rate_type text not null check (rate_type in ('percentage', 'fixed')),
  rate_value numeric(15,6) not null check (rate_value >= 0),
  is_inclusive boolean not null default false,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_taxes_type_active on taxes(type, is_active);

-- =====================================================
-- Tax Applications (Depends on taxes)
-- =====================================================

create table tax_applications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('invoice', 'vendor_bill', 'payment')),
  source_id text not null,
  source_line_key text not null,
  tax_id uuid not null references taxes(id) on delete restrict,
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

create index idx_tax_applications_source on tax_applications(source_type, source_id);
create index idx_tax_applications_tax on tax_applications(tax_id);

-- =====================================================
-- Withholding Applications (Depends on taxes)
-- =====================================================

create table withholding_applications (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('payment', 'vendor_bill')),
  source_id text not null,
  withholding_tax_id uuid not null references taxes(id) on delete restrict,
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

create index idx_withholding_applications_source on withholding_applications(source_type, source_id);

-- =====================================================
-- Contact Tags (No dependencies)
-- =====================================================

create table contact_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8b5cf6',
  created_at timestamptz not null default now(),
  constraint contact_tags_name_not_blank check (btrim(name) <> '')
);

alter table contact_tags enable row level security;

create policy "Full access for service role"
on contact_tags
for all
using (true)
with check (true);

-- =====================================================
-- Inquiry Calculator Config (No dependencies)
-- =====================================================

create table inquiry_calculator_config (
  id text primary key,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into inquiry_calculator_config (id, values)
values ('shared', '{}'::jsonb)
on conflict (id) do nothing;

-- =====================================================
-- Reconciliations (No dependencies)
-- =====================================================

create table reconciliations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('invoice', 'bank', 'cod')),
  status text not null default 'active' check (status in ('active', 'reversed')),
  notes text null,
  created_at timestamptz not null default now(),
  created_by text not null,
  reversed_at timestamptz null,
  reversed_by text null
);

-- =====================================================
-- Journal Entries (Depends on journals)
-- =====================================================

create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  entry_date date not null,
  journal_id uuid not null references journals(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reversed')),
  total_debit numeric(15,2) not null default 0,
  total_credit numeric(15,2) not null default 0,
  posted_at timestamptz,
  posting_reference text unique,
  reversed boolean not null default false,
  is_reversal boolean not null default false,
  original_entry_id uuid,
  source_type text,
  source_id text,
  created_by_module text,
  event_id uuid,
  posted_by text,
  reversed_by text,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_reference_not_blank check (btrim(reference) <> ''),
  constraint journal_entries_total_debit_non_negative check (total_debit >= 0),
  constraint journal_entries_total_credit_non_negative check (total_credit >= 0),
  constraint journal_entries_event_id_unique unique (event_id)
);

create index idx_journal_entries_journal_date on journal_entries(journal_id, entry_date desc, created_at desc);
create index idx_journal_entries_status on journal_entries(status, entry_date desc, created_at desc);
create index idx_journal_entries_original_entry_id on journal_entries(original_entry_id);
create index idx_journal_entries_posting_reference on journal_entries(posting_reference);
create index idx_journal_entries_source on journal_entries(source_type, source_id);

alter table journal_entries enable row level security;

create policy "Full access for service role"
on journal_entries
for all
using (true)
with check (true);

-- Add self-reference foreign key after table creation
alter table journal_entries
add constraint journal_entries_original_entry_id_fkey
foreign key (original_entry_id) references journal_entries(id) on delete restrict;

-- =====================================================
-- Journal Entry Lines (Depends on journal_entries, chart_of_accounts, partners, currencies, reconciliations)
-- =====================================================

create table journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  line_order integer not null default 1,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  partner_reference text null,
  partner_id uuid null references partners(id) on delete restrict,
  description text not null default '',
  debit_amount numeric(15,2) not null default 0,
  credit_amount numeric(15,2) not null default 0,
  shipment_reference text,
  base_currency_amount numeric(15,2),
  foreign_currency text,
  foreign_amount numeric(15,2),
  exchange_rate numeric(18,8),
  tax_code text,
  tax_amount numeric(15,2) not null default 0,
  reconciled_amount numeric(15,2) not null default 0,
  open_balance numeric(15,2) generated always as (greatest(debit_amount, credit_amount) - reconciled_amount) stored,
  is_reconciled boolean generated always as ((greatest(debit_amount, credit_amount) - reconciled_amount) <= 0) stored,
  reconciliation_id uuid null references reconciliations(id) on delete set null,
  currency_id uuid null references currencies(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entry_lines_order_positive check (line_order > 0),
  constraint journal_entry_lines_debit_non_negative check (debit_amount >= 0),
  constraint journal_entry_lines_credit_non_negative check (credit_amount >= 0),
  constraint journal_entry_lines_one_side_only check (not (debit_amount > 0 and credit_amount > 0)),
  constraint journal_entry_lines_non_zero check (debit_amount > 0 or credit_amount > 0),
  constraint journal_entry_lines_reconciled_amount_non_negative check (reconciled_amount >= 0),
  constraint journal_entry_lines_reconciled_amount_within_line_total check (reconciled_amount <= greatest(debit_amount, credit_amount)),
  constraint journal_entry_lines_base_currency_amount_non_negative check (base_currency_amount is not null and base_currency_amount >= 0),
  constraint journal_entry_lines_foreign_requirements_check check (
    (foreign_currency is null and foreign_amount is null and exchange_rate is null and currency_id is null)
    or (foreign_currency is not null and foreign_amount is not null and foreign_amount > 0 and exchange_rate is not null and exchange_rate > 0)
  )
);

create index idx_journal_entry_lines_entry_order on journal_entry_lines(journal_entry_id, line_order);
create index idx_journal_entry_lines_partner_id on journal_entry_lines(partner_id);
create index idx_journal_entry_lines_shipment_reference on journal_entry_lines(shipment_reference);
create index idx_journal_entry_lines_currency_id on journal_entry_lines(currency_id);
create index idx_journal_entry_lines_reconciliation_id on journal_entry_lines(reconciliation_id);
create index idx_journal_entry_lines_open_balance on journal_entry_lines(account_id, partner_id, open_balance);

alter table journal_entry_lines enable row level security;

create policy "Full access for service role"
on journal_entry_lines
for all
using (true)
with check (true);

-- =====================================================
-- Vendor Bills (Depends on partners, chart_of_accounts, journal_entries)
-- =====================================================

create table vendor_bills (
  id uuid primary key default gen_random_uuid(),
  vendor_partner_id uuid not null references partners(id) on delete restrict,
  bill_number text not null unique,
  bill_date date not null,
  due_date date not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  status text not null default 'draft' check (status in ('draft', 'approved', 'posted', 'partially_paid', 'paid', 'cancelled')),
  expense_account_id uuid references chart_of_accounts(id) on delete restrict,
  payable_account_id uuid references chart_of_accounts(id) on delete restrict,
  posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  outstanding_amount numeric(12,2) not null default 0 check (outstanding_amount >= 0),
  approved_by text,
  approved_at timestamptz,
  posted_by text,
  reversed_by text,
  reversed_at timestamptz,
  cancelled_by text,
  cancelled_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table vendor_bills
add constraint vendor_bills_posted_requires_journal_entry
check (status not in ('posted', 'paid', 'partially_paid') or posted_journal_entry_id is not null);

create index idx_vendor_bills_partner_status on vendor_bills(vendor_partner_id, status, due_date);

alter table vendor_bills enable row level security;

create policy "Full access for service role"
on vendor_bills
for all
using (true)
with check (true);

-- =====================================================
-- Payments (Depends on partners, journals, chart_of_accounts, journal_entries)
-- =====================================================

create table payments (
  id uuid primary key default gen_random_uuid(),
  payment_number text not null unique,
  partner_id uuid not null references partners(id) on delete restrict,
  payment_type text not null check (payment_type in ('inbound', 'outbound')),
  amount numeric(12,2) not null check (amount > 0),
  payment_date date not null,
  journal_id uuid not null references journals(id) on delete restrict,
  receivable_account_id uuid references chart_of_accounts(id) on delete restrict,
  payable_account_id uuid references chart_of_accounts(id) on delete restrict,
  liquidity_account_id uuid not null references chart_of_accounts(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'posted', 'reconciled', 'reversed')),
  posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  allocated_amount numeric(12,2) not null default 0 check (allocated_amount >= 0),
  reversed_payment_id uuid null,
  posted_by text,
  reconciled_by text,
  reconciled_at timestamptz,
  reversed_by text,
  reversed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table payments
add constraint payments_posted_requires_journal_entry
check (status <> 'posted' or posted_journal_entry_id is not null);

create index idx_payments_partner_status on payments(partner_id, payment_type, status, payment_date);
create index idx_payments_reversed_payment_id on payments(reversed_payment_id);

-- Add self-reference foreign key after table creation
alter table payments
add constraint payments_reversed_payment_id_fkey
foreign key (reversed_payment_id) references payments(id) on delete set null;

alter table payments enable row level security;

create policy "Full access for service role"
on payments
for all
using (true)
with check (true);

-- =====================================================
-- Payment Allocations (Depends on payments, invoices, vendor_bills)
-- =====================================================

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  invoice_id uuid,
  vendor_bill_id uuid,
  amount numeric(12,2) not null check (amount > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint payment_allocations_target_check check (
    (invoice_id is not null and vendor_bill_id is null)
    or (invoice_id is null and vendor_bill_id is not null)
  )
);

create index idx_payment_allocations_payment_id on payment_allocations(payment_id);

-- Add vendor_bill foreign key now (vendor_bills already exists)
alter table payment_allocations
add constraint payment_allocations_vendor_bill_id_fkey
foreign key (vendor_bill_id) references vendor_bills(id) on delete restrict;

create index idx_payment_allocations_vendor_bill_id on payment_allocations(vendor_bill_id);

alter table payment_allocations enable row level security;

create policy "Full access for service role"
on payment_allocations
for all
using (true)
with check (true);

-- =====================================================
-- Event Logs (Depends on journal_entries)
-- =====================================================

create table event_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_type text not null,
  reference_id text not null,
  idempotency_key text not null unique,
  source_module text not null,
  processed boolean not null default false,
  processed_at timestamptz null,
  journal_entry_id uuid null references journal_entries(id) on delete set null,
  processing_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_event_logs_lookup on event_logs(event_type, reference_id, processed);

alter table event_logs enable row level security;

create policy "Full access for service role"
on event_logs
for all
using (true)
with check (true);

-- =====================================================
-- Shipment Cost Sheets (Depends on partners, vendor_bills)
-- =====================================================

create table shipment_cost_sheets (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  cost_type text not null check (cost_type in ('freight', 'duty', 'clearance', 'warehouse')),
  vendor_partner_id uuid not null references partners(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  currency text not null default 'PKR',
  status text not null default 'draft' check (status in ('draft', 'billed')),
  source_bill_id uuid null references vendor_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_shipment_cost_sheets_shipment on shipment_cost_sheets(shipment_id, status);

alter table shipment_cost_sheets enable row level security;

create policy "Full access for service role"
on shipment_cost_sheets
for all
using (true)
with check (true);

-- =====================================================
-- Customer Charge Sheets (Depends on invoices)
-- =====================================================

create table customer_charge_sheets (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  charge_type text not null,
  amount numeric(15,2) not null check (amount > 0),
  currency text not null default 'PKR',
  status text not null default 'draft' check (status in ('draft', 'invoiced')),
  source_invoice_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_customer_charge_sheets_shipment on customer_charge_sheets(shipment_id, status);

alter table customer_charge_sheets enable row level security;

create policy "Full access for service role"
on customer_charge_sheets
for all
using (true)
with check (true);

-- =====================================================
-- Tradeflow Credit Ledger (Depends on partners)
-- =====================================================

create table tradeflow_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_partner_id uuid not null references partners(id) on delete restrict,
  shipment_id text null,
  transaction_type text not null check (transaction_type in ('purchase', 'delivery', 'repayment')),
  amount numeric(15,2) not null check (amount > 0),
  outstanding_amount numeric(15,2) not null check (outstanding_amount >= 0),
  due_date date null,
  status text not null default 'open' check (status in ('open', 'overdue', 'closed')),
  source_reference text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tradeflow_credit_ledger_customer on tradeflow_credit_ledger(customer_partner_id, status, due_date);

alter table tradeflow_credit_ledger enable row level security;

create policy "Full access for service role"
on tradeflow_credit_ledger
for all
using (true)
with check (true);

-- =====================================================
-- Reconciliation Lines (Depends on reconciliations, journal_entry_lines)
-- =====================================================

create table reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references reconciliations(id) on delete cascade,
  journal_entry_line_id uuid not null references journal_entry_lines(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by text not null
);

create index idx_reconciliation_lines_reconciliation_id on reconciliation_lines(reconciliation_id);
create index idx_reconciliation_lines_journal_line_id on reconciliation_lines(journal_entry_line_id);

-- =====================================================
-- Bank Transactions (Depends on chart_of_accounts, partners, journal_entries)
-- =====================================================

create table bank_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  reference text not null,
  description text null,
  amount numeric(15,2) not null check (amount > 0),
  direction text not null check (direction in ('deposit', 'withdrawal')),
  bank_account_id uuid not null references chart_of_accounts(id) on delete restrict,
  clearing_account_id uuid null references chart_of_accounts(id) on delete restrict,
  partner_id uuid null references partners(id) on delete restrict,
  posted_journal_entry_id uuid null references journal_entries(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reconciled')),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now()
);

create index idx_bank_transactions_status_date on bank_transactions(status, transaction_date desc);

-- =====================================================
-- COD Discrepancies (Depends on reconciliations, journal_entry_lines)
-- =====================================================

create table cod_discrepancies (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references reconciliations(id) on delete cascade,
  cod_collection_line_id uuid not null references journal_entry_lines(id) on delete restrict,
  expected_amount numeric(15,2) not null check (expected_amount >= 0),
  matched_amount numeric(15,2) not null check (matched_amount >= 0),
  difference_amount numeric(15,2) not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  reason text not null default 'COD mismatch between collection and settlement/fees',
  created_at timestamptz not null default now(),
  created_by text not null
);

create index idx_cod_discrepancies_status on cod_discrepancies(status, created_at desc);

-- =====================================================
-- Leads (Depends on sales_agents)
-- =====================================================

create table leads (
  id uuid primary key default gen_random_uuid(),
  lead_id_formatted text,
  name text not null default '',
  number text not null,
  source text not null check (source in ('Meta', 'LinkedIn', 'WhatsApp', 'Others')),
  status text not null default 'Leads',
  sales_agent_id uuid not null references sales_agents(id) on delete cascade,
  created_by_sales_agent_id uuid references sales_agents(id) on delete set null,
  transferred_from_sales_agent_id uuid references sales_agents(id) on delete set null,
  transferred_at timestamptz,
  converted boolean not null default false,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table leads
add constraint leads_lead_id_formatted_key unique (lead_id_formatted),
add constraint leads_status_check
check (status in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose'));

create index idx_leads_sales_agent_id on leads(sales_agent_id);
create index idx_leads_created_at on leads(created_at desc);
create index idx_leads_source on leads(source);
create index idx_leads_status on leads(status);
create index idx_leads_lead_id_formatted on leads(lead_id_formatted);
create index idx_leads_created_by_sales_agent_id on leads(created_by_sales_agent_id);
create index idx_leads_transferred_from_sales_agent_id on leads(transferred_from_sales_agent_id);
create index idx_leads_transferred_at on leads(transferred_at desc);
create index idx_leads_converted on leads(converted);
create index idx_leads_organization_id on leads(organization_id);
create index idx_leads_search_name_trgm on leads using gin (name gin_trgm_ops);
create index idx_leads_search_number_trgm on leads using gin (number gin_trgm_ops);
create index idx_leads_search_source_trgm on leads using gin (source gin_trgm_ops);
create index idx_leads_search_formatted_trgm on leads using gin (lead_id_formatted gin_trgm_ops);

alter table leads enable row level security;

create policy "Full access for service role"
on leads
for all
using (true)
with check (true);

-- =====================================================
-- Customers (Depends on sales_agents, leads, organizations)
-- =====================================================

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null,
  city text not null,
  phone_number text not null,
  company_name text not null,
  sales_agent_id uuid references sales_agents(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  converted_at timestamptz,
  customer_code text,
  sequential_number integer,
  customer_id_formatted text,
  customer_sequence_number integer,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table customers
add constraint customers_customer_id_formatted_key unique (customer_id_formatted);

create index idx_customers_company_name on customers(company_name);
create index idx_customers_created_at on customers(created_at desc);
create index idx_customers_customer_code on customers(customer_code);
create index idx_customers_sequential_number on customers(sequential_number);
create index idx_customers_sales_agent_id on customers(sales_agent_id);
create index idx_customers_lead_id on customers(lead_id);
create index idx_customers_customer_id_formatted on customers(customer_id_formatted);
create index idx_customers_customer_sequence_number on customers(sales_agent_id, customer_sequence_number);
create index idx_customers_organization_id on customers(organization_id);

alter table customers enable row level security;

create policy "Full access for service role"
on customers
for all
using (true)
with check (true);

-- =====================================================
-- Sales Agent - Customer Junction
-- =====================================================

create table sales_agent_customers (
  sales_agent_id uuid references sales_agents(id) on delete cascade,
  customer_id uuid references customers(id) on delete cascade,
  primary key (sales_agent_id, customer_id),
  assigned_at timestamptz default now()
);

create index idx_sales_agent_customers_agent_id on sales_agent_customers(sales_agent_id);
create index idx_sales_agent_customers_customer_id on sales_agent_customers(customer_id);
create unique index idx_sales_agent_customers_unique_customer on sales_agent_customers(customer_id);

-- =====================================================
-- Lead Comments (Depends on leads)
-- =====================================================

create table lead_comments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  comment text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_lead_comments_lead_id on lead_comments(lead_id);
create index idx_lead_comments_created_at on lead_comments(created_at desc);

alter table lead_comments enable row level security;

create policy "Full access for service role"
on lead_comments
for all
using (true)
with check (true);

-- =====================================================
-- Lead Transfers (Depends on leads, sales_agents)
-- =====================================================

create table lead_transfers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  from_sales_agent_id uuid not null references sales_agents(id) on delete restrict,
  to_sales_agent_id uuid not null references sales_agents(id) on delete restrict,
  status_before_transfer text not null check (status_before_transfer in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win', 'Follow up', 'Lose')),
  lead_id_formatted_snapshot text,
  lead_name_snapshot text not null,
  lead_number_snapshot text not null,
  lead_source_snapshot text not null check (lead_source_snapshot in ('Meta', 'LinkedIn', 'WhatsApp', 'Others')),
  transferred_at timestamptz not null default now(),
  constraint lead_transfers_agents_must_differ check (from_sales_agent_id <> to_sales_agent_id)
);

create index idx_lead_transfers_from_sales_agent_id on lead_transfers(from_sales_agent_id, transferred_at desc);
create index idx_lead_transfers_to_sales_agent_id on lead_transfers(to_sales_agent_id, transferred_at desc);
create index idx_lead_transfers_lead_id on lead_transfers(lead_id, transferred_at desc);

alter table lead_transfers enable row level security;

create policy "Full access for service role"
on lead_transfers
for all
using (true)
with check (true);

-- =====================================================
-- Lead Inquiries (Depends on leads, organizations)
-- =====================================================

create table lead_inquiries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  inquiry_group_id uuid default gen_random_uuid(),
  version_number integer not null default 1,
  is_current_version boolean not null default true,
  description text not null default '',
  image_url text,
  additional_image_urls jsonb not null default '[]'::jsonb,
  link_url text,
  product_name text default '',
  total_weight text default '',
  cbm text default '',
  quantity text default '',
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'quotation_sent', 'completed')),
  sent_to_accounting boolean not null default false,
  sent_to_operations boolean not null default false,
  sent_at timestamptz,
  approval_status text not null default 'draft',
  approved_at timestamptz null,
  calculator_values jsonb not null default '{}'::jsonb,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table lead_inquiries
add constraint lead_inquiries_approval_status_check
check (approval_status in ('draft', 'sent', 'approved', 'rejected'));

create index idx_lead_inquiries_lead_id on lead_inquiries(lead_id);
create index idx_lead_inquiries_status on lead_inquiries(status);
create index idx_lead_inquiries_sent_to_accounting on lead_inquiries(sent_to_accounting);
create index idx_lead_inquiries_approval_status on lead_inquiries(lead_id, approval_status, approved_at desc);
create index idx_lead_inquiries_group_version on lead_inquiries(lead_id, inquiry_group_id, version_number desc);
create index idx_lead_inquiries_current_version on lead_inquiries(lead_id, is_current_version, updated_at desc);
create index idx_lead_inquiries_ops_feed on lead_inquiries(sent_to_accounting, sent_at desc, id);
create index idx_lead_inquiries_search_product_name_trgm on lead_inquiries using gin (product_name gin_trgm_ops);
create index idx_lead_inquiries_search_description_trgm on lead_inquiries using gin (description gin_trgm_ops);
create index idx_lead_inquiries_organization_id on lead_inquiries(organization_id);

alter table lead_inquiries enable row level security;

create policy "Full access for service role"
on lead_inquiries
for all
using (true)
with check (true);

-- =====================================================
-- Inquiry Logs (Depends on lead_inquiries)
-- =====================================================

create table inquiry_logs (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references lead_inquiries(id) on delete cascade,
  action text not null,
  previous_values jsonb,
  new_values jsonb,
  performed_by text not null,
  performed_at timestamptz default now()
);

create index idx_inquiry_logs_inquiry_performed on inquiry_logs(inquiry_id, performed_at desc);

-- =====================================================
-- Inquiry Quotations (Depends on lead_inquiries, leads)
-- =====================================================

create table inquiry_quotations (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references lead_inquiries(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  quotation_number text not null,
  customer_name text not null,
  product_service text not null,
  quantity numeric(10, 2) not null default 0,
  unit_price numeric(10, 2) not null default 0,
  total_amount numeric(10, 2) not null default 0,
  notes text,
  created_by text not null,
  sent_to_client boolean not null default false,
  sent_to_client_at timestamptz,
  sent_to_agent boolean not null default false,
  sent_to_agent_at timestamptz,
  version integer not null default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_inquiry_quotations_inquiry_id on inquiry_quotations(inquiry_id);
create index idx_inquiry_quotations_lead_id on inquiry_quotations(lead_id);
create index idx_inquiry_quotations_created_at on inquiry_quotations(created_at desc);

alter table inquiry_quotations enable row level security;

create policy "Full access for service role"
on inquiry_quotations
for all
using (true)
with check (true);

-- =====================================================
-- Inquiry Confirmations (Depends on lead_inquiries, leads, organizations)
-- =====================================================

create table inquiry_confirmations (
  id uuid primary key default gen_random_uuid(),
  inquiry_id uuid not null references lead_inquiries(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  lead_number text not null,
  product_name text not null default '',
  total_weight text default '',
  cbm text default '',
  quantity text default '',
  hs_code text default '',
  calculator_values jsonb not null default '{}'::jsonb,
  original_image_url text,
  additional_image_1_url text,
  additional_image_2_url text,
  sales_additional_image_urls jsonb not null default '[]'::jsonb,
  rejection_reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_by text not null default '',
  reviewed_by text,
  reviewed_at timestamptz,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_inquiry_confirmations_inquiry_id on inquiry_confirmations(inquiry_id);
create index idx_inquiry_confirmations_lead_id on inquiry_confirmations(lead_id);
create index idx_inquiry_confirmations_status on inquiry_confirmations(status);
create index idx_inquiry_confirmations_lead_number on inquiry_confirmations(lead_number);
create index idx_inquiry_confirmations_inquiry_created on inquiry_confirmations(inquiry_id, created_at desc);
create index idx_inquiry_confirmations_organization_id on inquiry_confirmations(organization_id);

alter table inquiry_confirmations enable row level security;

create policy "Full access for service role"
on inquiry_confirmations
for all
using (true)
with check (true);

-- =====================================================
-- Lead Activity Logs (Depends on leads, lead_inquiries)
-- =====================================================

create table lead_activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  inquiry_id uuid null references lead_inquiries(id) on delete set null,
  inquiry_version integer null,
  action_type text not null check (
    action_type in (
      'lead_created',
      'lead_updated',
      'inquiry_created_draft',
      'inquiry_edited',
      'inquiry_sent',
      'inquiry_resent',
      'inquiry_viewed',
      'inquiry_status_changed'
    )
  ),
  action_label text not null,
  metadata jsonb null,
  previous_values jsonb null,
  new_values jsonb null,
  performed_by text not null,
  performed_at timestamptz not null default now()
);

create index idx_lead_activity_logs_lead_performed on lead_activity_logs(lead_id, performed_at desc);
create index idx_lead_activity_logs_inquiry on lead_activity_logs(inquiry_id, performed_at desc);

alter table lead_activity_logs enable row level security;

create policy "Full access for service role"
on lead_activity_logs
for all
using (true)
with check (true);

-- =====================================================
-- Lead Chat Messages (Depends on leads)
-- =====================================================

create table lead_chat_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  message text not null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  created_at timestamptz not null default now()
);

create index idx_lead_chat_messages_lead_id_created_at on lead_chat_messages(lead_id, created_at asc);

alter table lead_chat_messages enable row level security;

create policy "Full access for service role"
on lead_chat_messages
for all
using (true)
with check (true);

-- =====================================================
-- Lead Chat Notifications (Depends on lead_chat_messages, leads)
-- =====================================================

create table lead_chat_notifications (
  id uuid primary key default gen_random_uuid(),
  chat_message_id uuid not null references lead_chat_messages(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_lead_chat_notifications_recipient on lead_chat_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table lead_chat_notifications enable row level security;

create policy "Full access for service role"
on lead_chat_notifications
for all
using (true)
with check (true);

-- =====================================================
-- Inquiry Lifecycle Notifications (Depends on leads, lead_inquiries, inquiry_confirmations)
-- =====================================================

create table inquiry_lifecycle_notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  inquiry_id uuid null references lead_inquiries(id) on delete set null,
  confirmation_id uuid null references inquiry_confirmations(id) on delete set null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  event_type text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table inquiry_lifecycle_notifications
add constraint inquiry_lifecycle_notifications_event_type_check
check (
  event_type in (
    'inquiry_sent',
    'sent_for_admin_approval',
    'approved',
    'rejected',
    'lead_transferred'
  )
);

create index idx_inquiry_lifecycle_notifications_recipient on inquiry_lifecycle_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table inquiry_lifecycle_notifications enable row level security;

create policy "Full access for service role"
on inquiry_lifecycle_notifications
for all
using (true)
with check (true);

-- =====================================================
-- App Users (Depends on organizations)
-- =====================================================

create table app_users (
  id uuid default gen_random_uuid() primary key,
  username text unique not null,
  password text not null,
  role text not null default 'user',
  full_name text,
  email text,
  phone text,
  default_organization uuid references organizations(id) on delete set null,
  default_organization_id uuid references organizations(id) on delete set null,
  permissions jsonb default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table app_users enable row level security;

create policy "Full access for service role"
on app_users
for all
using (true)
with check (true);

create index idx_app_users_username on app_users(username);
create index idx_app_users_role on app_users(role);
create index idx_app_users_default_organization on app_users(default_organization);
create index idx_app_users_default_organization_id on app_users(default_organization_id);
create index idx_app_users_email_lower on app_users(lower(email));
create index idx_app_users_permissions on app_users using gin(permissions);

-- =====================================================
-- User-Organization Junction (Depends on app_users, organizations)
-- =====================================================

create table user_organizations (
  user_id uuid not null references app_users (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create index idx_user_organizations_organization_id on user_organizations(organization_id);
create index idx_user_organizations_user_id on user_organizations(user_id);

alter table user_organizations enable row level security;

create policy "Full access for service role"
on user_organizations
for all
using (true)
with check (true);

-- =====================================================
-- Contacts (Depends on sales_agents)
-- =====================================================

create table contacts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references contacts(id) on delete cascade,
  contact_kind text not null default 'contact' check (contact_kind in ('contact', 'invoice', 'delivery', 'other')),
  company_type text not null default 'person' check (company_type in ('person', 'company')),
  name text not null,
  company_name text,
  job_position text,
  title text,
  image_url text,
  email text,
  phone text,
  mobile text,
  website text,
  street text,
  street2 text,
  city text,
  state text,
  zip text,
  country text,
  tax_id text,
  company_ref text,
  industry text,
  salesperson_id uuid references sales_agents(id) on delete set null,
  payment_terms text,
  pricelist text,
  delivery_method text,
  customer_rank integer not null default 0,
  vendor_rank integer not null default 0,
  sales_payment_method text,
  incoterm text,
  incoterm_location text,
  group_rfq text default 'On Order',
  buyer text,
  purchase_payment_terms text,
  purchase_payment_method text,
  receipt_reminder boolean not null default false,
  receivable_account text,
  payable_account text,
  tax_settings text,
  fiscal_position text,
  notes text,
  organization_id uuid references organizations(id) on delete set null,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contacts_name_not_blank check (btrim(name) <> '')
);

create index idx_contacts_name on contacts (lower(name));
create index idx_contacts_email on contacts (lower(email));
create index idx_contacts_parent_id on contacts(parent_id);
create index idx_contacts_company_type on contacts(company_type);
create index idx_contacts_created_at on contacts(created_at desc);
create index idx_contacts_organization_id on contacts(organization_id);

alter table contacts enable row level security;

create policy "Full access for service role"
on contacts
for all
using (true)
with check (true);

create or replace function set_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_contacts_set_updated_at on contacts;
create trigger trg_contacts_set_updated_at
before update on contacts
for each row execute function set_contacts_updated_at();

-- =====================================================
-- Contact Tag Links (Depends on contacts, contact_tags)
-- =====================================================

create table contact_tag_links (
  contact_id uuid not null references contacts(id) on delete cascade,
  tag_id uuid not null references contact_tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create index idx_contact_tag_links_contact on contact_tag_links(contact_id);
create index idx_contact_tag_links_tag on contact_tag_links(tag_id);

alter table contact_tag_links enable row level security;

create policy "Full access for service role"
on contact_tag_links
for all
using (true)
with check (true);

-- =====================================================
-- Contact Activity Logs (Depends on contacts)
-- =====================================================

create table contact_activity_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contacts(id) on delete cascade,
  action_type text not null check (action_type in ('created', 'updated', 'note', 'message', 'activity', 'tag', 'child_added')),
  body text,
  performed_by text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_contact_activity_logs_contact on contact_activity_logs(contact_id);
create index idx_contact_activity_logs_created on contact_activity_logs(created_at desc);

alter table contact_activity_logs enable row level security;

create policy "Full access for service role"
on contact_activity_logs
for all
using (true)
with check (true);

-- =====================================================
-- Quotations (Depends on partners, contacts, organizations)
-- =====================================================

create table quotations (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  product_service text not null,
  quantity numeric(10, 2) not null,
  unit_price numeric(10, 2) not null,
  total_amount numeric(10, 2) not null,
  status text not null default 'quotation' check (status in ('quotation', 'quotation_sent', 'sales_order')),
  quotation_number text,
  expiration_date date,
  payment_terms text default 'Immediate',
  taxes numeric(5, 2) default 0,
  uom text default 'pcs / u',
  created_by text not null,
  partner_id uuid references partners(id) on delete restrict,
  contact_id uuid references contacts(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_quotations_status on quotations(status);
create index idx_quotations_created_at on quotations(created_at desc);
create index idx_quotations_created_by on quotations(created_by);
create index idx_quotations_partner_id on quotations(partner_id);
create index idx_quotations_contact_id on quotations(contact_id);
create index idx_quotations_organization_id on quotations(organization_id);

-- =====================================================
-- Quotation Logs (Depends on quotations)
-- =====================================================

create table quotation_logs (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'deleted', 'status_changed', 'printed', 'log_note', 'activity')),
  previous_status text,
  new_status text,
  performed_by text not null,
  performed_at timestamptz default now(),
  details jsonb
);

create index idx_quotation_logs_quotation_id on quotation_logs(quotation_id);
create index idx_quotation_logs_performed_at on quotation_logs(performed_at desc);
create index idx_quotation_logs_performed_by on quotation_logs(performed_by);

-- =====================================================
-- Invoices (Depends on quotations, partners, journal_entries)
-- =====================================================

create table invoices (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references quotations(id) on delete cascade,
  invoice_number text not null unique,
  customer_name text not null,
  product_service text not null,
  quantity numeric(10, 2) not null,
  unit_price numeric(10, 2) not null,
  total_amount numeric(10, 2) not null,
  invoice_date date not null,
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid', 'partial')),
  invoice_status text not null default 'draft' check (invoice_status in ('draft', 'approved', 'confirmed', 'posted', 'partially_paid', 'paid', 'cancelled')),
  created_by text not null,
  partner_id uuid references partners(id) on delete restrict,
  due_date date,
  posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  paid_amount numeric(12, 2) not null default 0,
  outstanding_amount numeric(12, 2) not null default 0,
  original_invoice_id uuid,
  reversed_invoice_id uuid,
  approved_by text,
  approved_at timestamptz,
  posted_by text,
  reversed_by text,
  reversed_at timestamptz,
  cancelled_by text,
  cancelled_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table invoices
add constraint invoices_original_invoice_id_fkey
foreign key (original_invoice_id) references invoices(id) on delete set null,
add constraint invoices_reversed_invoice_id_fkey
foreign key (reversed_invoice_id) references invoices(id) on delete set null,
add constraint invoices_posted_requires_journal_entry
check (
  invoice_status not in ('posted', 'paid', 'partially_paid')
  or posted_journal_entry_id is not null
);

create index idx_invoices_quotation_id on invoices(quotation_id);
create index idx_invoices_status on invoices(invoice_status);
create index idx_invoices_invoice_number on invoices(invoice_number);
create index idx_invoices_created_at on invoices(created_at desc);
create index idx_invoices_created_by on invoices(created_by);
create index idx_invoices_partner_id on invoices(partner_id);
create index idx_invoices_outstanding on invoices(invoice_status, outstanding_amount);
create index idx_invoices_original_invoice_id on invoices(original_invoice_id);
create index idx_invoices_reversed_invoice_id on invoices(reversed_invoice_id);

alter table invoices enable row level security;

create policy "Full access for service role"
on invoices
for all
using (true)
with check (true);

-- =====================================================
-- Invoice Logs (Depends on invoices)
-- =====================================================

create table invoice_logs (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'deleted', 'status_changed', 'payment_registered', 'printed')),
  previous_status text,
  new_status text,
  performed_by text not null,
  performed_at timestamptz default now(),
  details jsonb
);

create index idx_invoice_logs_invoice_id on invoice_logs(invoice_id);
create index idx_invoice_logs_performed_at on invoice_logs(performed_at desc);
create index idx_invoice_logs_performed_by on invoice_logs(performed_by);

-- Add invoice foreign key to payment_allocations (invoices now exists)
alter table payment_allocations
add constraint payment_allocations_invoice_id_fkey
foreign key (invoice_id) references invoices(id) on delete restrict;

create index idx_payment_allocations_invoice_id on payment_allocations(invoice_id);

-- Add invoice foreign key to customer_charge_sheets (invoices now exists)
alter table customer_charge_sheets
add constraint customer_charge_sheets_source_invoice_id_fkey
foreign key (source_invoice_id) references invoices(id) on delete set null;

-- =====================================================
-- Orders (Depends on organizations)
-- =====================================================

create table orders (
  id uuid primary key default gen_random_uuid(),
  username text not null,
  shipping_mark text not null,
  destination_country text not null,
  total_cartons integer not null,
  item_description text,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now()
);

create index idx_orders_username on orders(username);
create index idx_orders_created_at on orders(created_at desc);
create index idx_orders_organization_id on orders(organization_id);

-- =====================================================
-- Cartons (Depends on orders)
-- =====================================================

create table cartons (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  carton_serial_number text unique not null,
  weight numeric,
  length numeric,
  width numeric,
  height numeric,
  dimension_unit text,
  carton_index integer not null,
  item_description text,
  destination_country text,
  sub_order_index integer,
  carton_in_sub_order integer,
  scan_type text,
  console text,
  qr_code text,
  qr_scanned_at timestamptz,
  created_at timestamptz default now()
);

create index idx_cartons_order_id on cartons(order_id);
create index idx_cartons_serial_number on cartons(carton_serial_number);

-- =====================================================
-- Carton Scans (Depends on cartons, orders)
-- =====================================================

create table carton_scans (
  id uuid primary key default gen_random_uuid(),
  carton_id uuid not null references cartons(id) on delete cascade,
  order_id uuid not null references orders(id) on delete cascade,
  username text not null,
  carton_serial_number text not null,
  scanned_at timestamptz default now()
);

create index idx_carton_scans_username on carton_scans(username);
create index idx_carton_scans_carton_serial on carton_scans(carton_serial_number);

-- =====================================================
-- Consoles (Depends on organizations)
-- =====================================================

create table consoles (
  id uuid primary key default gen_random_uuid(),
  console_number text not null unique,
  container_number text not null,
  date date not null,
  bl_number text not null,
  carrier text not null,
  so text not null,
  total_cartons integer not null default 0,
  total_cbm numeric(10, 3) not null default 0,
  max_cbm numeric(10, 3) not null default 68,
  status text not null default 'active',
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_consoles_console_number on consoles(console_number);
create index idx_consoles_status on consoles(status);
create index idx_consoles_created_at on consoles(created_at desc);
create index idx_consoles_organization_id on consoles(organization_id);

-- =====================================================
-- Console Orders (Depends on consoles, orders)
-- =====================================================

create table console_orders (
  console_id uuid references consoles(id) on delete cascade,
  order_id uuid references orders(id) on delete cascade,
  primary key (console_id, order_id),
  assigned_at timestamptz default now()
);

create index idx_console_orders_console_id on console_orders(console_id);
create index idx_console_orders_order_id on console_orders(order_id);

-- =====================================================
-- Admin Invoices (No dependencies)
-- =====================================================

create table admin_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  invoice_date date not null,
  due_date date not null,
  source text,
  description text,
  quantity text,
  unit_price text,
  taxes text,
  amount text,
  untaxed_amount text,
  total text,
  payment_communication text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_admin_invoices_created_at on admin_invoices(created_at desc);
create index idx_admin_invoices_invoice_number on admin_invoices(invoice_number);

-- =====================================================
-- Packing Lists (Depends on organizations)
-- =====================================================

create table packing_lists (
  id uuid primary key default gen_random_uuid(),
  build_to text not null,
  ship_to text not null,
  product_name text,
  hs_code text,
  no_of_cartons integer,
  weight numeric(10, 3),
  net_weight numeric(10, 3),
  invoice_no text,
  bill_to_name text,
  bill_to_address text,
  bill_to_ntn text,
  bill_to_phone text,
  bill_to_email text,
  ship_to_name text,
  ship_to_address text,
  ship_to_ntn text,
  ship_to_phone text,
  ship_to_email text,
  payment_terms text,
  shipped_via text,
  coo text,
  port_loading text,
  port_discharge text,
  shipping_terms text,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_packing_lists_created_at on packing_lists(created_at desc);
create index idx_packing_lists_organization_id on packing_lists(organization_id);

-- =====================================================
-- Packing List Items (Depends on packing_lists)
-- =====================================================

create table packing_list_items (
  id uuid primary key default gen_random_uuid(),
  packing_list_id uuid not null references packing_lists(id) on delete cascade,
  product_name text not null,
  hs_code text not null,
  no_of_cartons integer not null,
  weight numeric(10, 3) not null,
  net_weight numeric(10, 3) not null,
  item_order integer not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_packing_list_items_packing_list_id on packing_list_items(packing_list_id);
create index idx_packing_list_items_item_order on packing_list_items(packing_list_id, item_order);

-- =====================================================
-- Import Invoices (Depends on organizations)
-- =====================================================

create table import_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null,
  bill_to_name text not null,
  bill_to_address text,
  bill_to_ntn text,
  bill_to_phone text,
  bill_to_email text,
  ship_to_name text not null,
  ship_to_address text,
  ship_to_ntn text,
  ship_to_phone text,
  ship_to_email text,
  payment_terms text,
  shipped_via text,
  coo text,
  port_loading text,
  port_discharge text,
  shipping_terms text,
  exporter_bank_name text,
  exporter_bank_address text,
  exporter_bank_swift text,
  exporter_account_name text,
  exporter_account_address text,
  exporter_account_number text,
  importer_bank_name text,
  importer_bank_address text,
  importer_bank_swift text,
  importer_account_name text,
  importer_account_address text,
  importer_account_number text,
  importer_iban_number text,
  organization_id uuid references organizations(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index idx_import_invoices_created_at on import_invoices(created_at desc);
create index idx_import_invoices_invoice_no on import_invoices(invoice_no);
create index idx_import_invoices_organization_id on import_invoices(organization_id);

-- =====================================================
-- Import Invoice Items (Depends on import_invoices)
-- =====================================================

create table import_invoice_items (
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

create index idx_import_invoice_items_invoice_id on import_invoice_items(invoice_id);
create index idx_import_invoice_items_item_order on import_invoice_items(invoice_id, item_order);

-- =====================================================
-- Portal User Activity Logs (Depends on app_users)
-- =====================================================

create table portal_user_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  action text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create index idx_portal_user_activity_logs_user_id on portal_user_activity_logs(user_id);
create index idx_portal_user_activity_logs_created_at on portal_user_activity_logs(created_at desc);

-- =====================================================
-- Triggers
-- =====================================================

create or replace function block_posted_journal_entry_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_posted_entry_update', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' then
    raise exception 'Posted entries cannot be modified. Use reversal.';
  end if;
  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'Posted entries cannot be modified. Use reversal.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_block_posted_journal_entry_mutation on journal_entries;
create trigger trg_block_posted_journal_entry_mutation
before update or delete on journal_entries
for each row
execute function block_posted_journal_entry_mutation();

-- =====================================================
-- Document Lifecycle Triggers
-- =====================================================

create or replace function enforce_invoice_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_status <> 'draft' then
      raise exception 'Only draft invoices can be deleted. Use cancellation/reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.invoice_status <> new.invoice_status then
      if old.invoice_status = 'draft' and new.invoice_status in ('approved', 'confirmed', 'cancelled') then
        null;
      elsif old.invoice_status in ('approved', 'confirmed') and new.invoice_status in ('posted', 'cancelled') then
        null;
      elsif old.invoice_status = 'posted' and new.invoice_status in ('partially_paid', 'paid', 'cancelled') then
        null;
      elsif old.invoice_status = 'partially_paid' and new.invoice_status in ('paid', 'cancelled') then
        null;
      elsif old.invoice_status = 'paid' and new.invoice_status = 'cancelled' then
        null;
      else
        raise exception 'Invalid invoice state transition: % -> %', old.invoice_status, new.invoice_status;
      end if;
    end if;

    if old.invoice_status in ('posted', 'partially_paid', 'paid') then
      if (new.quotation_id, new.partner_id, new.customer_name, new.product_service, new.quantity, new.unit_price, new.total_amount, new.invoice_date, new.due_date)
         is distinct from
         (old.quotation_id, old.partner_id, old.customer_name, old.product_service, old.quantity, old.unit_price, old.total_amount, old.invoice_date, old.due_date) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_invoice_lifecycle on invoices;
create trigger trg_enforce_invoice_lifecycle
before update or delete on invoices
for each row execute function enforce_invoice_lifecycle();

create or replace function enforce_vendor_bill_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft vendor bills can be deleted. Use cancellation/reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'draft' and new.status in ('approved', 'cancelled') then
        null;
      elsif old.status = 'approved' and new.status in ('posted', 'cancelled') then
        null;
      elsif old.status = 'posted' and new.status in ('partially_paid', 'paid', 'cancelled') then
        null;
      elsif old.status = 'partially_paid' and new.status in ('paid', 'cancelled') then
        null;
      elsif old.status = 'paid' and new.status = 'cancelled' then
        null;
      else
        raise exception 'Invalid vendor bill state transition: % -> %', old.status, new.status;
      end if;
    end if;

    if old.status in ('posted', 'partially_paid', 'paid') then
      if (new.vendor_partner_id, new.bill_number, new.bill_date, new.due_date, new.total_amount, new.expense_account_id, new.payable_account_id)
         is distinct from
         (old.vendor_partner_id, old.bill_number, old.bill_date, old.due_date, old.total_amount, old.expense_account_id, old.payable_account_id) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_vendor_bill_lifecycle on vendor_bills;
create trigger trg_enforce_vendor_bill_lifecycle
before update or delete on vendor_bills
for each row execute function enforce_vendor_bill_lifecycle();

create or replace function enforce_payment_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft payments can be deleted. Use reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'draft' and new.status = 'posted' then
        null;
      elsif old.status = 'posted' and new.status in ('reconciled', 'reversed') then
        null;
      elsif old.status = 'reconciled' and new.status = 'reversed' then
        null;
      else
        raise exception 'Invalid payment state transition: % -> %', old.status, new.status;
      end if;
    end if;

    if old.status in ('posted', 'reconciled', 'reversed') then
      if (new.payment_number, new.partner_id, new.payment_type, new.amount, new.payment_date, new.journal_id, new.receivable_account_id, new.payable_account_id, new.liquidity_account_id)
         is distinct from
         (old.payment_number, old.partner_id, old.payment_type, old.amount, old.payment_date, old.journal_id, old.receivable_account_id, old.payable_account_id, old.liquidity_account_id) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_payment_lifecycle on payments;
create trigger trg_enforce_payment_lifecycle
before update or delete on payments
for each row execute function enforce_payment_lifecycle();

-- =====================================================
-- Key Functions
-- =====================================================

create or replace function post_journal_entry_strict(p_entry_id uuid)
returns table(id uuid, status text, posting_reference text, posted_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  entry_row journal_entries%rowtype;
  totals record;
  _posting_reference text;
begin
  select *
  into entry_row
  from journal_entries
  where journal_entries.id = p_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if entry_row.status <> 'draft' then
    raise exception 'Only draft entries can be posted.';
  end if;

  select
    count(*) as line_count,
    coalesce(sum(debit_amount), 0)::numeric(15,2) as total_debit,
    coalesce(sum(credit_amount), 0)::numeric(15,2) as total_credit,
    count(*) filter (where debit_amount > 0) as debit_lines,
    count(*) filter (where credit_amount > 0) as credit_lines,
    count(*) filter (where debit_amount < 0 or credit_amount < 0) as negative_lines
  into totals
  from journal_entry_lines
  where journal_entry_id = p_entry_id;

  if totals.line_count < 2 then
    raise exception 'Journal entry must have at least two lines';
  end if;
  if totals.negative_lines > 0 then
    raise exception 'Invalid negative values in entry';
  end if;
  if totals.debit_lines = 0 or totals.credit_lines = 0 then
    raise exception 'Entry must contain both debit and credit lines';
  end if;
  if totals.total_debit <> totals.total_credit then
    raise exception 'Total debit and credit must be equal';
  end if;

  _posting_reference := 'POST-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  while exists (select 1 from journal_entries where posting_reference = _posting_reference) loop
    _posting_reference := 'POST-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  end loop;

  perform set_config('app.allow_posted_entry_update', '1', true);

  update journal_entries
  set status = 'posted',
      total_debit = totals.total_debit,
      total_credit = totals.total_credit,
      posted_at = now(),
      posting_reference = _posting_reference,
      updated_at = now()
  where journal_entries.id = p_entry_id;

  perform set_config('app.allow_posted_entry_update', '0', true);

  return query
  select je.id, je.status, je.posting_reference, je.posted_at
  from journal_entries je
  where je.id = p_entry_id;
end;
$$;

create or replace function reverse_journal_entry_strict(p_original_entry_id uuid)
returns table(original_entry_id uuid, reversal_entry_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  original_row journal_entries%rowtype;
  reversal_id uuid;
  _posting_reference text;
begin
  select *
  into original_row
  from journal_entries
  where journal_entries.id = p_original_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found.';
  end if;

  if original_row.status <> 'posted' then
    raise exception 'Only posted entries can be reversed.';
  end if;

  if original_row.reversed then
    raise exception 'Journal entry is already reversed.';
  end if;

  _posting_reference := 'REV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  while exists (select 1 from journal_entries where posting_reference = _posting_reference) loop
    _posting_reference := 'REV-' || to_char(now(), 'YYYYMMDD') || '-' || lpad((floor(random() * 1000000))::text, 6, '0');
  end loop;

  insert into journal_entries (
    reference,
    entry_date,
    journal_id,
    status,
    total_debit,
    total_credit,
    posted_at,
    posting_reference,
    reversed,
    is_reversal,
    original_entry_id,
    updated_at
  )
  values (
    original_row.reference || ' (REV)',
    current_date,
    original_row.journal_id,
    'posted',
    original_row.total_credit,
    original_row.total_debit,
    now(),
    _posting_reference,
    false,
    true,
    original_row.id,
    now()
  )
  returning id into reversal_id;

  insert into journal_entry_lines (
    journal_entry_id,
    line_order,
    account_id,
    partner_reference,
    description,
    debit_amount,
    credit_amount,
    updated_at
  )
  select
    reversal_id,
    line_order,
    account_id,
    partner_reference,
    coalesce(description, '') || ' (REV)',
    credit_amount,
    debit_amount,
    now()
  from journal_entry_lines
  where journal_entry_id = original_row.id
  order by line_order;

  perform set_config('app.allow_posted_entry_update', '1', true);

  update journal_entries
  set reversed = true,
      status = 'reversed',
      updated_at = now()
  where journal_entries.id = original_row.id;

  perform set_config('app.allow_posted_entry_update', '0', true);

  return query
  select original_row.id, reversal_id;
end;
$$;

create or replace function get_exchange_rate(
  p_currency_code text,
  p_rate_date date default current_date
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  _base_code text;
  _code text;
  _rate numeric(18,8);
begin
  _code := upper(coalesce(p_currency_code, ''));
  if _code = '' then
    raise exception 'Currency code is required.';
  end if;

  select code
  into _base_code
  from currencies
  where is_base = true
  limit 1;

  if _base_code is null then
    raise exception 'Base currency is not configured.';
  end if;

  if _code = _base_code then
    return 1;
  end if;

  select er.rate_to_base
  into _rate
  from exchange_rates er
  join currencies c on c.id = er.currency_id
  where c.code = _code
    and c.is_active = true
    and er.rate_date <= coalesce(p_rate_date, current_date)
  order by er.rate_date desc
  limit 1;

  if _rate is null then
    raise exception 'Exchange rate not found for % on or before %.', _code, coalesce(p_rate_date, current_date);
  end if;

  return _rate;
end;
$$;

create or replace function convert_to_base(
  p_foreign_amount numeric,
  p_rate_to_base numeric
)
returns numeric
language plpgsql
immutable
as $$
begin
  if p_foreign_amount is null or p_foreign_amount <= 0 then
    raise exception 'Foreign amount must be greater than zero.';
  end if;
  if p_rate_to_base is null or p_rate_to_base <= 0 then
    raise exception 'Exchange rate must be greater than zero.';
  end if;
  return round(p_foreign_amount * p_rate_to_base, 2);
end;
$$;

-- =====================================================
-- Grant Execute Permissions
-- =====================================================

grant execute on function next_carton_serial() to service_role;
grant execute on function post_journal_entry_strict(uuid) to service_role;
grant execute on function reverse_journal_entry_strict(uuid) to service_role;
grant execute on function get_exchange_rate(text, date) to service_role;
grant execute on function convert_to_base(numeric, numeric) to service_role;

-- =====================================================
-- Reload PostgREST Schema
-- =====================================================

notify pgrst, 'reload schema';
