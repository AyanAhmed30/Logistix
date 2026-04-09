-- Production-grade line-level reconciliation engine
-- Scope:
-- 1) Extend journal_entry_lines for line-level reconciliation tracking
-- 2) Add reconciliation/audit tables
-- 3) Add bank_transactions + COD discrepancy tracking
-- 4) Add RPCs:
--    - reconcile_invoice_payment
--    - reconcile_payment_bank
--    - reconcile_cod_settlement
--    - unreconcile

-- =====================================================
-- 1) journal_entry_lines reconciliation fields
-- =====================================================
alter table public.journal_entry_lines
  add column if not exists reconciled_amount numeric(15,2) not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_reconciled_amount_non_negative'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_reconciled_amount_non_negative
      check (reconciled_amount >= 0) not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_reconciled_amount_within_line_total'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_reconciled_amount_within_line_total
      check (reconciled_amount <= greatest(debit_amount, credit_amount)) not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_reconciled_amount_non_negative;
  exception
    when others then
      raise notice 'journal_entry_lines_reconciled_amount_non_negative left NOT VALID: %', SQLERRM;
  end;

  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_reconciled_amount_within_line_total;
  exception
    when others then
      raise notice 'journal_entry_lines_reconciled_amount_within_line_total left NOT VALID: %', SQLERRM;
  end;
end
$$;

alter table public.journal_entry_lines
  add column if not exists open_balance numeric(15,2)
  generated always as (greatest(debit_amount, credit_amount) - reconciled_amount) stored;

alter table public.journal_entry_lines
  add column if not exists is_reconciled boolean
  generated always as ((greatest(debit_amount, credit_amount) - reconciled_amount) <= 0) stored;

-- =====================================================
-- 2) Reconciliation tables
-- =====================================================
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('invoice', 'bank', 'cod')),
  status text not null default 'active' check (status in ('active', 'reversed')),
  notes text null,
  created_at timestamptz not null default now(),
  created_by text not null,
  reversed_at timestamptz null,
  reversed_by text null
);

create table if not exists public.reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations(id) on delete cascade,
  journal_entry_line_id uuid not null references public.journal_entry_lines(id) on delete restrict,
  amount numeric(15,2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  created_by text not null
);

create index if not exists idx_reconciliation_lines_reconciliation_id
  on public.reconciliation_lines(reconciliation_id);

create index if not exists idx_reconciliation_lines_journal_line_id
  on public.reconciliation_lines(journal_entry_line_id);

alter table public.journal_entry_lines
  add column if not exists reconciliation_id uuid null references public.reconciliations(id) on delete set null;

create index if not exists idx_journal_entry_lines_reconciliation_id
  on public.journal_entry_lines(reconciliation_id);

create index if not exists idx_journal_entry_lines_open_balance
  on public.journal_entry_lines(account_id, partner_id, open_balance);

-- =====================================================
-- 3) Bank transactions + COD discrepancy tracking
-- =====================================================
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  transaction_date date not null,
  reference text not null,
  description text null,
  amount numeric(15,2) not null check (amount > 0),
  direction text not null check (direction in ('deposit', 'withdrawal')),
  bank_account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  clearing_account_id uuid null references public.chart_of_accounts(id) on delete restrict,
  partner_id uuid null references public.partners(id) on delete restrict,
  posted_journal_entry_id uuid null references public.journal_entries(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'reconciled')),
  created_at timestamptz not null default now(),
  created_by text not null,
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_transactions_status_date
  on public.bank_transactions(status, transaction_date desc);

create table if not exists public.cod_discrepancies (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.reconciliations(id) on delete cascade,
  cod_collection_line_id uuid not null references public.journal_entry_lines(id) on delete restrict,
  expected_amount numeric(15,2) not null check (expected_amount >= 0),
  matched_amount numeric(15,2) not null check (matched_amount >= 0),
  difference_amount numeric(15,2) not null,
  status text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  reason text not null default 'COD mismatch between collection and settlement/fees',
  created_at timestamptz not null default now(),
  created_by text not null
);

create index if not exists idx_cod_discrepancies_status
  on public.cod_discrepancies(status, created_at desc);

-- =====================================================
-- 4) Helpers
-- =====================================================
create or replace function public._assert_posted_line(p_line_id uuid)
returns public.journal_entry_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  _line public.journal_entry_lines%rowtype;
  _status text;
begin
  select jel.*
  into _line
  from public.journal_entry_lines jel
  where jel.id = p_line_id
  for update;

  if not found then
    raise exception 'Journal line not found.';
  end if;

  select je.status
  into _status
  from public.journal_entries je
  where je.id = _line.journal_entry_id
  for update;

  if not found then
    raise exception 'Parent journal entry not found for line %.', p_line_id;
  end if;
  if _status <> 'posted' then
    raise exception 'Only posted journal lines can be reconciled.';
  end if;
  return _line;
end
$$;

create or replace function public._apply_reconciliation_line(
  p_reconciliation_id uuid,
  p_line_id uuid,
  p_amount numeric,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _line public.journal_entry_lines%rowtype;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Reconciliation amount must be greater than zero.';
  end if;

  select * into _line
  from public._assert_posted_line(p_line_id);

  if p_amount > _line.open_balance then
    raise exception 'Reconciliation amount exceeds open balance for line %.', p_line_id;
  end if;

  insert into public.reconciliation_lines (reconciliation_id, journal_entry_line_id, amount, created_by)
  values (p_reconciliation_id, p_line_id, round(p_amount, 2), p_actor);

  update public.journal_entry_lines
  set reconciled_amount = round(reconciled_amount + p_amount, 2),
      reconciliation_id = p_reconciliation_id
  where id = p_line_id;
end
$$;

-- =====================================================
-- 5) Invoice <-> Payment reconciliation (AR/AP)
-- =====================================================
create or replace function public.reconcile_invoice_payment(
  p_invoice_line_id uuid,
  p_payment_line_id uuid,
  p_amount numeric,
  p_actor text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _invoice_line public.journal_entry_lines%rowtype;
  _payment_line public.journal_entry_lines%rowtype;
  _recon_id uuid;
  _amount numeric(15,2);
  _invoice_id uuid;
  _payment_id uuid;
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  _amount := round(coalesce(p_amount, 0), 2);
  if _amount <= 0 then
    raise exception 'Reconciliation amount must be greater than zero.';
  end if;

  select * into _invoice_line from public._assert_posted_line(p_invoice_line_id);
  select * into _payment_line from public._assert_posted_line(p_payment_line_id);

  if _invoice_line.account_id <> _payment_line.account_id then
    raise exception 'Account mismatch: lines must use same reconciliation account.';
  end if;
  if _invoice_line.partner_id is null or _payment_line.partner_id is null then
    raise exception 'Partner is required for AR/AP reconciliation.';
  end if;
  if _invoice_line.partner_id <> _payment_line.partner_id then
    raise exception 'Partner mismatch: lines must belong to same partner.';
  end if;
  if _invoice_line.debit_amount <= 0 then
    raise exception 'Invoice line must be a debit line.';
  end if;
  if _payment_line.credit_amount <= 0 and _payment_line.debit_amount <= 0 then
    raise exception 'Payment line must carry amount on one side.';
  end if;
  if _amount > _invoice_line.open_balance or _amount > _payment_line.open_balance then
    raise exception 'Reconciliation amount exceeds open balance.';
  end if;

  insert into public.reconciliations (type, created_by, notes)
  values ('invoice', p_actor, 'Invoice <-> Payment line reconciliation')
  returning id into _recon_id;

  perform public._apply_reconciliation_line(_recon_id, _invoice_line.id, _amount, p_actor);
  perform public._apply_reconciliation_line(_recon_id, _payment_line.id, _amount, p_actor);

  -- Update invoice state (business mirror, source of truth remains ledger lines)
  select i.id into _invoice_id
  from public.invoices i
  where i.posted_journal_entry_id = _invoice_line.journal_entry_id
  limit 1;

  if _invoice_id is not null then
    update public.invoices
    set paid_amount = round(paid_amount + _amount, 2),
        outstanding_amount = round(greatest(total_amount - (paid_amount + _amount), 0), 2),
        invoice_status = case
          when round(greatest(total_amount - (paid_amount + _amount), 0), 2) = 0 then 'paid'
          when round(paid_amount + _amount, 2) > 0 then 'partially_paid'
          else 'posted'
        end,
        payment_status = case
          when round(greatest(total_amount - (paid_amount + _amount), 0), 2) = 0 then 'paid'
          when round(paid_amount + _amount, 2) > 0 then 'partial'
          else 'unpaid'
        end,
        updated_at = now()
    where id = _invoice_id;
  end if;

  select p.id into _payment_id
  from public.payments p
  where p.posted_journal_entry_id = _payment_line.journal_entry_id
  limit 1;

  if _payment_id is not null then
    update public.payments
    set allocated_amount = round(allocated_amount + _amount, 2),
        status = case
          when round(allocated_amount + _amount, 2) >= round(amount, 2) then 'reconciled'
          else 'posted'
        end,
        reconciled_at = case
          when round(allocated_amount + _amount, 2) >= round(amount, 2) then now()
          else reconciled_at
        end,
        updated_at = now()
    where id = _payment_id;
  end if;

  return _recon_id;
end
$$;

-- =====================================================
-- 6) Payment <-> Bank reconciliation (clearing account)
-- =====================================================
create or replace function public.reconcile_payment_bank(
  p_payment_line_id uuid,
  p_bank_line_id uuid,
  p_amount numeric,
  p_actor text,
  p_tolerance numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _payment_line public.journal_entry_lines%rowtype;
  _bank_line public.journal_entry_lines%rowtype;
  _recon_id uuid;
  _amount numeric(15,2);
  _bt_id uuid;
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  _amount := round(coalesce(p_amount, 0), 2);
  if _amount <= 0 then
    raise exception 'Reconciliation amount must be greater than zero.';
  end if;
  if coalesce(p_tolerance, 0) < 0 then
    raise exception 'Tolerance cannot be negative.';
  end if;

  select * into _payment_line from public._assert_posted_line(p_payment_line_id);
  select * into _bank_line from public._assert_posted_line(p_bank_line_id);

  if _payment_line.account_id <> _bank_line.account_id then
    raise exception 'Account mismatch: payment and bank lines must use same clearing account.';
  end if;

  if _amount > _payment_line.open_balance + coalesce(p_tolerance, 0)
     or _amount > _bank_line.open_balance + coalesce(p_tolerance, 0) then
    raise exception 'Reconciliation amount exceeds open balance with tolerance.';
  end if;

  insert into public.reconciliations (type, created_by, notes)
  values ('bank', p_actor, 'Payment <-> Bank clearing reconciliation')
  returning id into _recon_id;

  perform public._apply_reconciliation_line(_recon_id, _payment_line.id, _amount, p_actor);
  perform public._apply_reconciliation_line(_recon_id, _bank_line.id, _amount, p_actor);

  select bt.id into _bt_id
  from public.bank_transactions bt
  where bt.posted_journal_entry_id = _bank_line.journal_entry_id
  limit 1;

  if _bt_id is not null then
    update public.bank_transactions bt
    set status = case
      when exists (
        select 1
        from public.journal_entry_lines jel
        where jel.journal_entry_id = bt.posted_journal_entry_id
          and jel.account_id = _bank_line.account_id
          and jel.open_balance > 0
      ) then 'open'
      else 'reconciled'
    end,
    updated_at = now()
    where bt.id = _bt_id;
  end if;

  return _recon_id;
end
$$;

-- =====================================================
-- 7) COD reconciliation (collection vs settlement + fees)
-- =====================================================
create or replace function public.reconcile_cod_settlement(
  p_cod_collection_line_id uuid,
  p_offset_lines jsonb,
  p_actor text,
  p_finalize boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  _cod_line public.journal_entry_lines%rowtype;
  _offset jsonb;
  _offset_line public.journal_entry_lines%rowtype;
  _amount numeric(15,2);
  _total_offsets numeric(15,2) := 0;
  _recon_id uuid;
  _difference numeric(15,2);
begin
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  if p_offset_lines is null or jsonb_typeof(p_offset_lines) <> 'array' or jsonb_array_length(p_offset_lines) = 0 then
    raise exception 'At least one COD offset line is required.';
  end if;

  select * into _cod_line from public._assert_posted_line(p_cod_collection_line_id);
  if _cod_line.debit_amount <= 0 then
    raise exception 'COD collection line must be a debit line.';
  end if;

  insert into public.reconciliations (type, created_by, notes)
  values ('cod', p_actor, 'COD collection vs settlement/fee reconciliation')
  returning id into _recon_id;

  for _offset in
    select value from jsonb_array_elements(p_offset_lines)
  loop
    _amount := round(coalesce((_offset ->> 'amount')::numeric, 0), 2);
    if _amount <= 0 then
      raise exception 'Each COD offset amount must be greater than zero.';
    end if;

    select * into _offset_line
    from public._assert_posted_line(nullif(_offset ->> 'line_id', '')::uuid);

    if _offset_line.account_id <> _cod_line.account_id then
      raise exception 'COD offset line account mismatch.';
    end if;
    if _offset_line.credit_amount <= 0 then
      raise exception 'COD offset lines must be credit lines.';
    end if;
    if _amount > _offset_line.open_balance then
      raise exception 'COD offset amount exceeds open balance for line %.', _offset_line.id;
    end if;

    _total_offsets := round(_total_offsets + _amount, 2);
    if _total_offsets > _cod_line.open_balance then
      raise exception 'Total COD offsets exceed collection open balance.';
    end if;

    perform public._apply_reconciliation_line(_recon_id, _offset_line.id, _amount, p_actor);
  end loop;

  perform public._apply_reconciliation_line(_recon_id, _cod_line.id, _total_offsets, p_actor);

  _difference := round(_cod_line.open_balance - _total_offsets, 2);
  if p_finalize and _difference <> 0 then
    insert into public.cod_discrepancies (
      reconciliation_id,
      cod_collection_line_id,
      expected_amount,
      matched_amount,
      difference_amount,
      created_by
    )
    values (
      _recon_id,
      _cod_line.id,
      round(_cod_line.open_balance, 2),
      _total_offsets,
      _difference,
      p_actor
    );
  end if;

  return _recon_id;
end
$$;

-- =====================================================
-- 8) Unreconciliation
-- =====================================================
create or replace function public.unreconcile(
  p_reconciliation_id uuid,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  _recon public.reconciliations%rowtype;
begin
  if p_reconciliation_id is null then
    raise exception 'Reconciliation id is required.';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;

  select * into _recon
  from public.reconciliations
  where id = p_reconciliation_id
  for update;

  if not found then
    raise exception 'Reconciliation not found.';
  end if;
  if _recon.status = 'reversed' then
    raise exception 'Reconciliation is already reversed.';
  end if;

  update public.journal_entry_lines jel
  set reconciled_amount = round(greatest(jel.reconciled_amount - rl.amount, 0), 2),
      reconciliation_id = null
  from public.reconciliation_lines rl
  where rl.reconciliation_id = p_reconciliation_id
    and rl.journal_entry_line_id = jel.id;

  -- Restore "latest active reconciliation_id" pointer where applicable
  update public.journal_entry_lines jel
  set reconciliation_id = latest.reconciliation_id
  from (
    select distinct on (rl.journal_entry_line_id)
      rl.journal_entry_line_id,
      rl.reconciliation_id
    from public.reconciliation_lines rl
    join public.reconciliations r
      on r.id = rl.reconciliation_id
     and r.status = 'active'
    where rl.journal_entry_line_id in (
      select journal_entry_line_id
      from public.reconciliation_lines
      where reconciliation_id = p_reconciliation_id
    )
    order by rl.journal_entry_line_id, rl.created_at desc
  ) latest
  where jel.id = latest.journal_entry_line_id;

  if _recon.type = 'invoice' then
    -- Rollback invoice paid/outstanding mirror
    with inv_agg as (
      select i.id as invoice_id, round(sum(rl.amount), 2) as amount
      from public.reconciliation_lines rl
      join public.journal_entry_lines jel on jel.id = rl.journal_entry_line_id
      join public.invoices i on i.posted_journal_entry_id = jel.journal_entry_id
      where rl.reconciliation_id = p_reconciliation_id
        and jel.debit_amount > 0
      group by i.id
    )
    update public.invoices i
    set paid_amount = round(greatest(i.paid_amount - inv_agg.amount, 0), 2),
        outstanding_amount = round(greatest(i.total_amount - greatest(i.paid_amount - inv_agg.amount, 0), 0), 2),
        invoice_status = case
          when round(greatest(i.total_amount - greatest(i.paid_amount - inv_agg.amount, 0), 0), 2) = 0 then 'paid'
          when round(greatest(i.paid_amount - inv_agg.amount, 0), 2) > 0 then 'partially_paid'
          else 'posted'
        end,
        payment_status = case
          when round(greatest(i.total_amount - greatest(i.paid_amount - inv_agg.amount, 0), 0), 2) = 0 then 'paid'
          when round(greatest(i.paid_amount - inv_agg.amount, 0), 2) > 0 then 'partial'
          else 'unpaid'
        end,
        updated_at = now()
    from inv_agg
    where i.id = inv_agg.invoice_id;

    with pay_agg as (
      select p.id as payment_id, round(sum(rl.amount), 2) as amount
      from public.reconciliation_lines rl
      join public.journal_entry_lines jel on jel.id = rl.journal_entry_line_id
      join public.payments p on p.posted_journal_entry_id = jel.journal_entry_id
      where rl.reconciliation_id = p_reconciliation_id
      group by p.id
    )
    update public.payments p
    set allocated_amount = round(greatest(p.allocated_amount - pay_agg.amount, 0), 2),
        status = case
          when p.status = 'reversed' then 'reversed'
          when round(greatest(p.allocated_amount - pay_agg.amount, 0), 2) >= round(p.amount, 2) then 'reconciled'
          else 'posted'
        end,
        reconciled_at = case
          when round(greatest(p.allocated_amount - pay_agg.amount, 0), 2) >= round(p.amount, 2) then p.reconciled_at
          else null
        end,
        updated_at = now()
    from pay_agg
    where p.id = pay_agg.payment_id;
  elsif _recon.type = 'bank' then
    update public.bank_transactions bt
    set status = 'open',
        updated_at = now()
    where exists (
      select 1
      from public.reconciliation_lines rl
      join public.journal_entry_lines jel on jel.id = rl.journal_entry_line_id
      where rl.reconciliation_id = p_reconciliation_id
        and bt.posted_journal_entry_id = jel.journal_entry_id
    );
  end if;

  update public.reconciliations
  set status = 'reversed',
      reversed_by = p_actor,
      reversed_at = now()
  where id = p_reconciliation_id;
end
$$;

grant execute on function public.reconcile_invoice_payment(uuid, uuid, numeric, text) to service_role;
grant execute on function public.reconcile_payment_bank(uuid, uuid, numeric, text, numeric) to service_role;
grant execute on function public.reconcile_cod_settlement(uuid, jsonb, text, boolean) to service_role;
grant execute on function public.unreconcile(uuid, text) to service_role;
