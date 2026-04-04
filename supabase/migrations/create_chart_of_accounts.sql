create table if not exists chart_of_accounts (
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
  constraint chart_of_accounts_view_reconciliation check (
    type <> 'view' or allow_reconciliation = false
  )
);

create index if not exists idx_chart_of_accounts_parent_id
  on chart_of_accounts(parent_id);

create index if not exists idx_chart_of_accounts_active_code
  on chart_of_accounts(is_active, code);

alter table chart_of_accounts enable row level security;

drop policy if exists "Full access for service role" on chart_of_accounts;

create policy "Full access for service role"
on chart_of_accounts
for all
using (true)
with check (true);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Assets', '1000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '1000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Liabilities', '2000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '2000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Equity', '3000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '3000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Income', '4000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '4000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Expenses', '5000', 'view', null, false, true
where not exists (
  select 1 from chart_of_accounts where code = '5000'
);

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Cash', '1100', 'asset', id, false, true
from chart_of_accounts
where code = '1000'
  and not exists (
    select 1 from chart_of_accounts where code = '1100'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Bank', '1200', 'asset', id, false, true
from chart_of_accounts
where code = '1000'
  and not exists (
    select 1 from chart_of_accounts where code = '1200'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Accounts Receivable', '1300', 'asset', id, true, true
from chart_of_accounts
where code = '1000'
  and not exists (
    select 1 from chart_of_accounts where code = '1300'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Accounts Payable', '2100', 'liability', id, true, true
from chart_of_accounts
where code = '2000'
  and not exists (
    select 1 from chart_of_accounts where code = '2100'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'Revenue', '4100', 'income', id, false, true
from chart_of_accounts
where code = '4000'
  and not exists (
    select 1 from chart_of_accounts where code = '4100'
  );

insert into chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select 'General Expense', '5100', 'expense', id, false, true
from chart_of_accounts
where code = '5000'
  and not exists (
    select 1 from chart_of_accounts where code = '5100'
  );
