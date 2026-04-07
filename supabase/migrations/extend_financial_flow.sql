alter table invoices
  add column if not exists partner_id uuid references partners(id) on delete restrict,
  add column if not exists due_date date,
  add column if not exists posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  add column if not exists paid_amount numeric(12,2) not null default 0,
  add column if not exists outstanding_amount numeric(12,2) not null default 0;

update invoices
set due_date = coalesce(due_date, invoice_date)
where due_date is null;

update invoices
set paid_amount = case
  when invoice_status = 'paid' then total_amount
  else 0
end
where paid_amount is null or paid_amount = 0;

update invoices
set outstanding_amount = greatest(total_amount - paid_amount, 0)
where outstanding_amount is null or outstanding_amount = 0;

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'invoices'
      and constraint_name = 'invoices_invoice_status_check'
  ) then
    alter table invoices drop constraint invoices_invoice_status_check;
  end if;
end
$$;

alter table invoices
  add constraint invoices_invoice_status_check
  check (invoice_status in ('draft', 'confirmed', 'posted', 'paid', 'cancelled'));

create index if not exists idx_invoices_partner_id
  on invoices(partner_id);

create index if not exists idx_invoices_outstanding
  on invoices(invoice_status, outstanding_amount);

create table if not exists vendor_bills (
  id uuid primary key default gen_random_uuid(),
  vendor_partner_id uuid not null references partners(id) on delete restrict,
  bill_number text not null unique,
  bill_date date not null,
  due_date date not null,
  total_amount numeric(12,2) not null check (total_amount > 0),
  status text not null default 'draft' check (status in ('draft', 'posted', 'paid')),
  expense_account_id uuid references chart_of_accounts(id) on delete restrict,
  payable_account_id uuid references chart_of_accounts(id) on delete restrict,
  posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  outstanding_amount numeric(12,2) not null default 0 check (outstanding_amount >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_bills_partner_status
  on vendor_bills(vendor_partner_id, status, due_date);

create table if not exists payments (
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
  status text not null default 'draft' check (status in ('draft', 'posted')),
  posted_journal_entry_id uuid references journal_entries(id) on delete set null,
  allocated_amount numeric(12,2) not null default 0 check (allocated_amount >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payments_partner_status
  on payments(partner_id, payment_type, status, payment_date);

create table if not exists payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references payments(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete restrict,
  vendor_bill_id uuid references vendor_bills(id) on delete restrict,
  amount numeric(12,2) not null check (amount > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint payment_allocations_target_check check (
    (invoice_id is not null and vendor_bill_id is null)
    or (invoice_id is null and vendor_bill_id is not null)
  )
);

create index if not exists idx_payment_allocations_payment_id
  on payment_allocations(payment_id);

create index if not exists idx_payment_allocations_invoice_id
  on payment_allocations(invoice_id);

create index if not exists idx_payment_allocations_vendor_bill_id
  on payment_allocations(vendor_bill_id);

alter table vendor_bills enable row level security;
alter table payments enable row level security;
alter table payment_allocations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vendor_bills' and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on vendor_bills for all using (true) with check (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payments' and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on payments for all using (true) with check (true)';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'payment_allocations' and policyname = 'Full access for service role'
  ) then
    execute 'create policy "Full access for service role" on payment_allocations for all using (true) with check (true)';
  end if;
end
$$;
