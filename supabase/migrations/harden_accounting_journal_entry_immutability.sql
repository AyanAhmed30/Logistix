-- Freeze posted accounting journal items.
-- Header may reset to draft (lock-checked in application). Posted → cancelled is blocked.
-- Lines on posted entries cannot be inserted, updated, or deleted.

create or replace function public.block_posted_accounting_journal_entry_mutation()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.allow_posted_entry_update', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' and old.status = 'posted' then
    raise exception 'Posted accounting journal entries cannot be deleted.';
  end if;

  if tg_op = 'UPDATE' and old.status = 'posted' then
    if new.status = 'cancelled' then
      raise exception 'Posted accounting journal entries cannot be cancelled in place. Use a reversing entry.';
    end if;
    if new.status = 'draft' then
      raise exception 'Posted accounting journal entries cannot be reset to draft. Use a reversing entry.';
    end if;
    if new.status = 'posted' then
      if new.total_debit is distinct from old.total_debit
         or new.total_credit is distinct from old.total_credit
         or new.entry_date is distinct from old.entry_date
         or new.journal_id is distinct from old.journal_id
         or new.organization_id is distinct from old.organization_id
         or new.source_id is distinct from old.source_id then
        raise exception 'Posted accounting journal entries cannot be modified. Use a reversing entry.';
      end if;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists trg_block_posted_accounting_je on public.accounting_journal_entries;
create trigger trg_block_posted_accounting_je
before update or delete on public.accounting_journal_entries
for each row
execute function public.block_posted_accounting_journal_entry_mutation();

create or replace function public.block_posted_accounting_journal_line_mutation()
returns trigger
language plpgsql
as $$
declare
  parent_status text;
begin
  if current_setting('app.allow_posted_entry_update', true) = '1' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select status into parent_status
  from public.accounting_journal_entries
  where id = coalesce(new.journal_entry_id, old.journal_entry_id);

  if parent_status = 'posted' then
    raise exception 'Posted journal items cannot be modified.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists trg_block_posted_accounting_je_lines on public.accounting_journal_entry_lines;
create trigger trg_block_posted_accounting_je_lines
before insert or update or delete on public.accounting_journal_entry_lines
for each row
execute function public.block_posted_accounting_journal_line_mutation();
