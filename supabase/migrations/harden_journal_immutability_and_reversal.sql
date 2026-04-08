do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'journal_entries'
      and constraint_name = 'journal_entries_status_check'
  ) then
    alter table journal_entries drop constraint journal_entries_status_check;
  end if;
end
$$;

alter table journal_entries
  add column if not exists posted_at timestamptz,
  add column if not exists posting_reference text unique,
  add column if not exists reversed boolean not null default false,
  add column if not exists is_reversal boolean not null default false,
  add column if not exists original_entry_id uuid references journal_entries(id) on delete restrict;

-- Backward compatibility: old implementations used "cancelled".
-- Convert to "reversed" before adding the stricter status constraint.
update journal_entries
set status = 'reversed',
    reversed = true,
    updated_at = now()
where status = 'cancelled';

alter table journal_entries
  add constraint journal_entries_status_check
  check (status in ('draft', 'posted', 'reversed'));

create index if not exists idx_journal_entries_original_entry_id
  on journal_entries(original_entry_id);

create index if not exists idx_journal_entries_posting_reference
  on journal_entries(posting_reference);

create or replace function public.block_posted_journal_entry_mutation()
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
end
$$;

drop trigger if exists trg_block_posted_journal_entry_mutation on public.journal_entries;
create trigger trg_block_posted_journal_entry_mutation
before update or delete on public.journal_entries
for each row
execute function public.block_posted_journal_entry_mutation();

create or replace function public.post_journal_entry_strict(p_entry_id uuid)
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
end
$$;

create or replace function public.reverse_journal_entry_strict(p_original_entry_id uuid)
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
end
$$;

grant execute on function public.post_journal_entry_strict(uuid) to service_role;
grant execute on function public.reverse_journal_entry_strict(uuid) to service_role;
