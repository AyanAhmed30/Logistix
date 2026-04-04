create table if not exists journals (
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

create unique index if not exists idx_journals_name_unique
  on journals (lower(name));

create index if not exists idx_journals_type_active
  on journals(type, is_active, code);

alter table journals enable row level security;

drop policy if exists "Full access for service role" on journals;

create policy "Full access for service role"
on journals
for all
using (true)
with check (true);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Sales Journal',
  'SJ',
  'sales',
  (select id from chart_of_accounts where code = '1300' limit 1),
  (select id from chart_of_accounts where code = '4100' limit 1),
  true
where not exists (
  select 1 from journals where code = 'SJ'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Purchase Journal',
  'PJ',
  'purchase',
  (select id from chart_of_accounts where code = '5100' limit 1),
  (select id from chart_of_accounts where code = '2100' limit 1),
  true
where not exists (
  select 1 from journals where code = 'PJ'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Bank Journal',
  'BNK',
  'bank',
  (select id from chart_of_accounts where code = '1200' limit 1),
  (select id from chart_of_accounts where code = '1200' limit 1),
  true
where not exists (
  select 1 from journals where code = 'BNK'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'Cash Journal',
  'CSH',
  'cash',
  (select id from chart_of_accounts where code = '1100' limit 1),
  (select id from chart_of_accounts where code = '1100' limit 1),
  true
where not exists (
  select 1 from journals where code = 'CSH'
);

insert into journals (
  name,
  code,
  type,
  default_debit_account_id,
  default_credit_account_id,
  is_active
)
select
  'General Journal',
  'GEN',
  'general',
  null,
  null,
  true
where not exists (
  select 1 from journals where code = 'GEN'
);
