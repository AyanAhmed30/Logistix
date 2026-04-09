-- Safe, backward-compatible accounting hardening patch.
-- Scope:
-- 1) partner_id linkage on journal_entry_lines (keep partner_reference)
-- 2) posting integrity constraints for invoices/vendor_bills/payments
-- 3) minimal business-level reversal linkage fields

-- =====================================================
-- TASK 1: Strong partner linkage in journal_entry_lines
-- =====================================================

alter table public.journal_entry_lines
  add column if not exists partner_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'journal_entry_lines_partner_id_fkey'
      and conrelid = 'public.journal_entry_lines'::regclass
  ) then
    alter table public.journal_entry_lines
      add constraint journal_entry_lines_partner_id_fkey
      foreign key (partner_id)
      references public.partners(id)
      on delete restrict
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.journal_entry_lines
      validate constraint journal_entry_lines_partner_id_fkey;
  exception
    when others then
      raise notice 'journal_entry_lines_partner_id_fkey left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_journal_entry_lines_partner_id
  on public.journal_entry_lines(partner_id);

-- Optional safe backfill from partner_reference (format: "<type>:<name>")
-- Backfill only when a single unambiguous active partner match exists.
with parsed as (
  select
    jel.id as line_id,
    lower(btrim(split_part(jel.partner_reference, ':', 1))) as ref_type,
    lower(btrim(substr(jel.partner_reference, strpos(jel.partner_reference, ':') + 1))) as ref_name
  from public.journal_entry_lines jel
  where jel.partner_id is null
    and jel.partner_reference is not null
    and strpos(jel.partner_reference, ':') > 0
),
candidate_matches as (
  select
    p.line_id,
    pr.id as partner_id,
    row_number() over (
      partition by p.line_id
      order by
        case
          when p.ref_type = 'customer' and pr.partner_type = 'customer' then 1
          when p.ref_type = 'customer' and pr.partner_type = 'both' then 2
          when p.ref_type = 'vendor' and pr.partner_type = 'vendor' then 1
          when p.ref_type = 'vendor' and pr.partner_type = 'both' then 2
          when p.ref_type = 'agent' and pr.partner_type = 'agent' then 1
          else 99
        end,
        pr.id
    ) as rn,
    count(*) over (partition by p.line_id) as candidate_count
  from parsed p
  join public.partners pr
    on lower(pr.name) = p.ref_name
   and pr.status = 'active'
   and (
     (p.ref_type = 'customer' and pr.partner_type in ('customer', 'both'))
     or (p.ref_type = 'vendor' and pr.partner_type in ('vendor', 'both'))
     or (p.ref_type = 'agent' and pr.partner_type = 'agent')
   )
),
resolved as (
  select line_id, partner_id
  from candidate_matches
  where candidate_count = 1
    and rn = 1
)
update public.journal_entry_lines jel
set partner_id = r.partner_id
from resolved r
where jel.id = r.line_id
  and jel.partner_id is null;

-- =====================================================
-- TASK 2: DB-level posting integrity constraints
-- =====================================================

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_posted_requires_journal_entry'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_posted_requires_journal_entry
      check (
        invoice_status not in ('posted', 'paid')
        or posted_journal_entry_id is not null
      )
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.invoices
      validate constraint invoices_posted_requires_journal_entry;
  exception
    when others then
      raise notice 'invoices_posted_requires_journal_entry left NOT VALID: %', SQLERRM;
  end;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vendor_bills_posted_requires_journal_entry'
      and conrelid = 'public.vendor_bills'::regclass
  ) then
    alter table public.vendor_bills
      add constraint vendor_bills_posted_requires_journal_entry
      check (
        status not in ('posted', 'paid')
        or posted_journal_entry_id is not null
      )
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.vendor_bills
      validate constraint vendor_bills_posted_requires_journal_entry;
  exception
    when others then
      raise notice 'vendor_bills_posted_requires_journal_entry left NOT VALID: %', SQLERRM;
  end;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_posted_requires_journal_entry'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_posted_requires_journal_entry
      check (
        status <> 'posted'
        or posted_journal_entry_id is not null
      )
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.payments
      validate constraint payments_posted_requires_journal_entry;
  exception
    when others then
      raise notice 'payments_posted_requires_journal_entry left NOT VALID: %', SQLERRM;
  end;
end
$$;

-- =====================================================
-- TASK 3: Minimal reversal linkage fields
-- =====================================================

alter table public.invoices
  add column if not exists original_invoice_id uuid null,
  add column if not exists reversed_invoice_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_original_invoice_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_original_invoice_id_fkey
      foreign key (original_invoice_id)
      references public.invoices(id)
      on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'invoices_reversed_invoice_id_fkey'
      and conrelid = 'public.invoices'::regclass
  ) then
    alter table public.invoices
      add constraint invoices_reversed_invoice_id_fkey
      foreign key (reversed_invoice_id)
      references public.invoices(id)
      on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.invoices
      validate constraint invoices_original_invoice_id_fkey;
  exception
    when others then
      raise notice 'invoices_original_invoice_id_fkey left NOT VALID: %', SQLERRM;
  end;

  begin
    alter table public.invoices
      validate constraint invoices_reversed_invoice_id_fkey;
  exception
    when others then
      raise notice 'invoices_reversed_invoice_id_fkey left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_invoices_original_invoice_id
  on public.invoices(original_invoice_id);

create index if not exists idx_invoices_reversed_invoice_id
  on public.invoices(reversed_invoice_id);

alter table public.payments
  add column if not exists reversed_payment_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_reversed_payment_id_fkey'
      and conrelid = 'public.payments'::regclass
  ) then
    alter table public.payments
      add constraint payments_reversed_payment_id_fkey
      foreign key (reversed_payment_id)
      references public.payments(id)
      on delete set null
      not valid;
  end if;
end
$$;

do $$
begin
  begin
    alter table public.payments
      validate constraint payments_reversed_payment_id_fkey;
  exception
    when others then
      raise notice 'payments_reversed_payment_id_fkey left NOT VALID: %', SQLERRM;
  end;
end
$$;

create index if not exists idx_payments_reversed_payment_id
  on public.payments(reversed_payment_id);
