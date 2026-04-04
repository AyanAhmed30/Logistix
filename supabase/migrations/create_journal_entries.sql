create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  reference text not null,
  entry_date date not null,
  journal_id uuid not null references journals(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'posted', 'cancelled')),
  total_debit numeric(15,2) not null default 0,
  total_credit numeric(15,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entries_reference_not_blank check (btrim(reference) <> ''),
  constraint journal_entries_total_debit_non_negative check (total_debit >= 0),
  constraint journal_entries_total_credit_non_negative check (total_credit >= 0)
);

create table if not exists journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references journal_entries(id) on delete cascade,
  line_order integer not null default 1,
  account_id uuid not null references chart_of_accounts(id) on delete restrict,
  partner_reference text null,
  description text not null default '',
  debit_amount numeric(15,2) not null default 0,
  credit_amount numeric(15,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint journal_entry_lines_order_positive check (line_order > 0),
  constraint journal_entry_lines_debit_non_negative check (debit_amount >= 0),
  constraint journal_entry_lines_credit_non_negative check (credit_amount >= 0),
  constraint journal_entry_lines_one_side_only check (
    not (debit_amount > 0 and credit_amount > 0)
  ),
  constraint journal_entry_lines_non_zero check (
    debit_amount > 0 or credit_amount > 0
  )
);

create index if not exists idx_journal_entries_journal_date
  on journal_entries(journal_id, entry_date desc, created_at desc);

create index if not exists idx_journal_entries_status
  on journal_entries(status, entry_date desc, created_at desc);

create index if not exists idx_journal_entry_lines_entry_order
  on journal_entry_lines(journal_entry_id, line_order);

alter table journal_entries enable row level security;
alter table journal_entry_lines enable row level security;

drop policy if exists "Full access for service role" on journal_entries;
drop policy if exists "Full access for service role" on journal_entry_lines;

create policy "Full access for service role"
on journal_entries
for all
using (true)
with check (true);

create policy "Full access for service role"
on journal_entry_lines
for all
using (true)
with check (true);
