create table if not exists public.event_logs (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null unique,
  event_type text not null,
  reference_id text not null,
  idempotency_key text not null unique,
  source_module text not null,
  processed boolean not null default false,
  processed_at timestamptz null,
  journal_entry_id uuid null references public.journal_entries(id) on delete set null,
  processing_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_event_logs_lookup
  on public.event_logs(event_type, reference_id, processed);

alter table public.journal_entries
  add column if not exists source_type text,
  add column if not exists source_id text,
  add column if not exists created_by_module text,
  add column if not exists event_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entries_event_id_unique'
      and conrelid = 'public.journal_entries'::regclass
  ) then
    alter table public.journal_entries
      add constraint journal_entries_event_id_unique unique (event_id);
  end if;
end
$$;

alter table public.journal_entry_lines
  add column if not exists shipment_reference text,
  add column if not exists base_currency_amount numeric(15,2),
  add column if not exists foreign_currency text,
  add column if not exists foreign_amount numeric(15,2),
  add column if not exists exchange_rate numeric(18,8),
  add column if not exists tax_code text,
  add column if not exists tax_amount numeric(15,2) not null default 0;

create index if not exists idx_journal_entries_source
  on public.journal_entries(source_type, source_id);

create index if not exists idx_journal_entry_lines_shipment_reference
  on public.journal_entry_lines(shipment_reference);

create table if not exists public.shipment_cost_sheets (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  cost_type text not null check (cost_type in ('freight', 'duty', 'clearance', 'warehouse')),
  vendor_partner_id uuid not null references public.partners(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  currency text not null default 'PKR',
  status text not null default 'draft' check (status in ('draft', 'billed')),
  source_bill_id uuid null references public.vendor_bills(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_shipment_cost_sheets_shipment
  on public.shipment_cost_sheets(shipment_id, status);

create table if not exists public.customer_charge_sheets (
  id uuid primary key default gen_random_uuid(),
  shipment_id text not null,
  charge_type text not null,
  amount numeric(15,2) not null check (amount > 0),
  currency text not null default 'PKR',
  status text not null default 'draft' check (status in ('draft', 'invoiced')),
  source_invoice_id uuid null references public.invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_charge_sheets_shipment
  on public.customer_charge_sheets(shipment_id, status);

create table if not exists public.tradeflow_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  customer_partner_id uuid not null references public.partners(id) on delete restrict,
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

create index if not exists idx_tradeflow_credit_ledger_customer
  on public.tradeflow_credit_ledger(customer_partner_id, status, due_date);

alter table public.event_logs enable row level security;
alter table public.shipment_cost_sheets enable row level security;
alter table public.customer_charge_sheets enable row level security;
alter table public.tradeflow_credit_ledger enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'event_logs'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.event_logs
      for all
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'shipment_cost_sheets'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.shipment_cost_sheets
      for all
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'customer_charge_sheets'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.customer_charge_sheets
      for all
      using (true)
      with check (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tradeflow_credit_ledger'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.tradeflow_credit_ledger
      for all
      using (true)
      with check (true);
  end if;
end
$$;

create or replace function public.process_mapped_journal_event(
  p_event_id uuid,
  p_event_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_source_module text,
  p_created_by_module text,
  p_source_type text,
  p_source_id text,
  p_entry_date date,
  p_journal_id uuid,
  p_reference text,
  p_lines jsonb
)
returns table(processed boolean, journal_entry_id uuid, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_log event_logs%rowtype;
  _entry_id uuid;
  _line_count integer;
begin
  select *
  into existing_log
  from event_logs
  where idempotency_key = p_idempotency_key
  for update;

  if found and existing_log.processed then
    return query select true, existing_log.journal_entry_id, 'Duplicate event skipped';
    return;
  end if;

  if found and not existing_log.processed then
    update event_logs
    set event_id = p_event_id,
        event_type = p_event_type,
        reference_id = p_reference_id,
        source_module = p_source_module,
        updated_at = now(),
        processing_error = null
    where id = existing_log.id;
  else
    insert into event_logs(event_id, event_type, reference_id, idempotency_key, source_module, processed, created_at, updated_at)
    values (p_event_id, p_event_type, p_reference_id, p_idempotency_key, p_source_module, false, now(), now());
  end if;

  _line_count := coalesce(jsonb_array_length(p_lines), 0);
  if _line_count < 2 then
    raise exception 'Journal entry must have at least two lines';
  end if;

  insert into journal_entries (
    reference,
    entry_date,
    journal_id,
    status,
    total_debit,
    total_credit,
    source_type,
    source_id,
    created_by_module,
    event_id,
    updated_at
  )
  values (
    p_reference,
    p_entry_date,
    p_journal_id,
    'draft',
    0,
    0,
    p_source_type,
    p_source_id,
    p_created_by_module,
    p_event_id,
    now()
  )
  returning id into _entry_id;

  insert into journal_entry_lines (
    journal_entry_id,
    line_order,
    account_id,
    partner_reference,
    description,
    debit_amount,
    credit_amount,
    shipment_reference,
    base_currency_amount,
    foreign_currency,
    foreign_amount,
    exchange_rate,
    tax_code,
    tax_amount,
    updated_at
  )
  select
    _entry_id,
    row_number() over (),
    (line ->> 'account_id')::uuid,
    nullif(line ->> 'partner_reference', ''),
    coalesce(line ->> 'description', ''),
    coalesce((line ->> 'debit_amount')::numeric, 0),
    coalesce((line ->> 'credit_amount')::numeric, 0),
    nullif(line ->> 'shipment_reference', ''),
    coalesce((line ->> 'base_currency_amount')::numeric, null),
    nullif(line ->> 'foreign_currency', ''),
    coalesce((line ->> 'foreign_amount')::numeric, null),
    coalesce((line ->> 'exchange_rate')::numeric, null),
    nullif(line ->> 'tax_code', ''),
    coalesce((line ->> 'tax_amount')::numeric, 0),
    now()
  from jsonb_array_elements(p_lines) as line;

  perform * from post_journal_entry_strict(_entry_id);

  update event_logs
  set processed = true,
      processed_at = now(),
      journal_entry_id = _entry_id,
      updated_at = now(),
      processing_error = null
  where idempotency_key = p_idempotency_key;

  return query select true, _entry_id, 'Processed';
exception
  when others then
    update event_logs
    set processed = false,
        processing_error = SQLERRM,
        updated_at = now()
    where idempotency_key = p_idempotency_key;
    raise;
end
$$;

grant execute on function public.process_mapped_journal_event(
  uuid, text, text, text, text, text, text, text, date, uuid, text, jsonb
) to service_role;
