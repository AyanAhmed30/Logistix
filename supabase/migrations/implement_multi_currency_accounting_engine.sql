-- Multi-currency accounting engine hardening
-- Scope:
-- 1) Currency master + exchange rates
-- 2) Journal line currency-level integrity
-- 3) DB helper functions for rates/conversion
-- 4) Base-currency safety in mapped event posting

-- =====================================================
-- 1) Currency master
-- =====================================================
create table if not exists public.currencies (
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

create unique index if not exists uq_currencies_single_base
  on public.currencies (is_base)
  where is_base = true;

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  currency_id uuid not null references public.currencies(id) on delete cascade,
  rate_date date not null,
  rate_to_base numeric(18,8) not null check (rate_to_base > 0),
  source text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exchange_rates_unique_per_day unique (currency_id, rate_date)
);

create index if not exists idx_exchange_rates_currency_date
  on public.exchange_rates(currency_id, rate_date desc);

insert into public.currencies (code, name, symbol, is_base, is_active)
values
  ('PKR', 'Pakistani Rupee', 'Rs', true, true),
  ('USD', 'US Dollar', '$', false, true),
  ('RMB', 'Chinese Yuan', '¥', false, true),
  ('AED', 'UAE Dirham', 'د.إ', false, true)
on conflict (code) do update
set is_active = excluded.is_active,
    updated_at = now();

-- =====================================================
-- 2) Journal line currency integrity
-- =====================================================
alter table public.journal_entry_lines
  add column if not exists currency_id uuid null references public.currencies(id) on delete restrict;

update public.journal_entry_lines
set base_currency_amount = greatest(debit_amount, credit_amount)
where base_currency_amount is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_base_currency_amount_non_negative'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_base_currency_amount_non_negative
      check (base_currency_amount is not null and base_currency_amount >= 0) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_foreign_requirements_check'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_foreign_requirements_check
      check (
        (
          foreign_currency is null
          and foreign_amount is null
          and exchange_rate is null
          and currency_id is null
        )
        or
        (
          foreign_currency is not null
          and foreign_amount is not null
          and foreign_amount > 0
          and exchange_rate is not null
          and exchange_rate > 0
        )
      ) not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_base_currency_amount_non_negative;
  exception
    when others then
      raise notice 'journal_entry_lines_base_currency_amount_non_negative left NOT VALID: %', SQLERRM;
  end;

  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_foreign_requirements_check;
  exception
    when others then
      raise notice 'journal_entry_lines_foreign_requirements_check left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_journal_entry_lines_currency_id
  on public.journal_entry_lines(currency_id);

-- =====================================================
-- 3) Rate helper functions
-- =====================================================
create or replace function public.get_exchange_rate(
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
  from public.currencies
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
  from public.exchange_rates er
  join public.currencies c on c.id = er.currency_id
  where c.code = _code
    and c.is_active = true
    and er.rate_date <= coalesce(p_rate_date, current_date)
  order by er.rate_date desc
  limit 1;

  if _rate is null then
    raise exception 'Exchange rate not found for % on or before %.', _code, coalesce(p_rate_date, current_date);
  end if;

  return _rate;
end
$$;

create or replace function public.convert_to_base(
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
end
$$;

grant execute on function public.get_exchange_rate(text, date) to service_role;
grant execute on function public.convert_to_base(numeric, numeric) to service_role;

-- =====================================================
-- 4) Strengthen mapped event posting (base balance check)
-- =====================================================
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
  _base_debit numeric(15,2);
  _base_credit numeric(15,2);
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

  select
    round(coalesce(sum(case when coalesce((line ->> 'debit_amount')::numeric, 0) > 0
                       then coalesce((line ->> 'base_currency_amount')::numeric, greatest(coalesce((line ->> 'debit_amount')::numeric, 0), coalesce((line ->> 'credit_amount')::numeric, 0)))
                       else 0 end), 0), 2),
    round(coalesce(sum(case when coalesce((line ->> 'credit_amount')::numeric, 0) > 0
                       then coalesce((line ->> 'base_currency_amount')::numeric, greatest(coalesce((line ->> 'debit_amount')::numeric, 0), coalesce((line ->> 'credit_amount')::numeric, 0)))
                       else 0 end), 0), 2)
  into _base_debit, _base_credit
  from jsonb_array_elements(p_lines) as line;

  if _base_debit <= 0 or _base_credit <= 0 or _base_debit <> _base_credit then
    raise exception 'Journal entry must be balanced in base currency.';
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
    coalesce((line ->> 'base_currency_amount')::numeric, greatest(coalesce((line ->> 'debit_amount')::numeric, 0), coalesce((line ->> 'credit_amount')::numeric, 0))),
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
