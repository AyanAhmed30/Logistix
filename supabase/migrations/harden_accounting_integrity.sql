alter table quotations
  add column if not exists partner_id uuid references partners(id) on delete restrict;

create index if not exists idx_quotations_partner_id
  on quotations(partner_id);

with unique_customer_partner as (
  select lower(name) as normalized_name, min(id::text)::uuid as partner_id
  from partners
  where status = 'active'
    and partner_type in ('customer', 'both')
  group by lower(name)
  having count(*) = 1
)
update quotations q
set partner_id = u.partner_id
from unique_customer_partner u
where q.partner_id is null
  and lower(q.customer_name) = u.normalized_name;

do $$
declare
  _constraint_name text;
begin
  for _constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'invoices'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%invoice_status%'
  loop
    execute format('alter table public.invoices drop constraint if exists %I', _constraint_name);
  end loop;
end
$$;

alter table invoices
  add constraint invoices_invoice_status_check
  check (invoice_status in ('draft', 'confirmed', 'posted', 'paid', 'cancelled'));

create or replace function public.reconcile_payment_allocations(
  p_payment_id uuid,
  p_allocations jsonb,
  p_actor text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row payments%rowtype;
  alloc jsonb;
  alloc_amount numeric(12,2);
  alloc_invoice_id uuid;
  alloc_vendor_bill_id uuid;
  requested_total numeric(12,2) := 0;
  invoice_row invoices%rowtype;
  bill_row vendor_bills%rowtype;
  payment_ar_account_id uuid;
  invoice_ar_account_id uuid;
  payment_ap_account_id uuid;
  bill_ap_account_id uuid;
begin
  if p_payment_id is null then
    raise exception 'Payment id is required.';
  end if;
  if p_actor is null or btrim(p_actor) = '' then
    raise exception 'Actor is required.';
  end if;
  if p_allocations is null or jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'At least one allocation is required.';
  end if;

  select *
  into payment_row
  from payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.';
  end if;
  if payment_row.status <> 'posted' then
    raise exception 'Only posted payments can be reconciled.';
  end if;
  if payment_row.posted_journal_entry_id is null then
    raise exception 'Posted payment must have journal entry reference.';
  end if;

  for alloc in
    select value
    from jsonb_array_elements(p_allocations)
  loop
    alloc_amount := round(coalesce((alloc ->> 'amount')::numeric, 0), 2);
    alloc_invoice_id := nullif(alloc ->> 'invoice_id', '')::uuid;
    alloc_vendor_bill_id := nullif(alloc ->> 'vendor_bill_id', '')::uuid;

    if alloc_amount <= 0 then
      raise exception 'Allocation amount must be greater than zero.';
    end if;
    if (alloc_invoice_id is null and alloc_vendor_bill_id is null)
      or (alloc_invoice_id is not null and alloc_vendor_bill_id is not null) then
      raise exception 'Each allocation must target exactly one document.';
    end if;

    requested_total := requested_total + alloc_amount;
  end loop;

  if requested_total <= 0 then
    raise exception 'Allocation amount must be greater than zero.';
  end if;
  if payment_row.allocated_amount + requested_total > payment_row.amount then
    raise exception 'Cannot reconcile more than remaining payment amount.';
  end if;

  for alloc in
    select value
    from jsonb_array_elements(p_allocations)
  loop
    alloc_amount := round(coalesce((alloc ->> 'amount')::numeric, 0), 2);
    alloc_invoice_id := nullif(alloc ->> 'invoice_id', '')::uuid;
    alloc_vendor_bill_id := nullif(alloc ->> 'vendor_bill_id', '')::uuid;

    if alloc_invoice_id is not null then
      if payment_row.payment_type <> 'inbound' then
        raise exception 'Inbound payment is required for invoice reconciliation.';
      end if;

      select *
      into invoice_row
      from invoices
      where id = alloc_invoice_id
      for update;
      if not found then
        raise exception 'Invoice not found.';
      end if;
      if invoice_row.partner_id <> payment_row.partner_id then
        raise exception 'Payment and invoice partners must match.';
      end if;
      if invoice_row.invoice_status not in ('posted', 'paid') then
        raise exception 'Only posted/paid invoices can be reconciled.';
      end if;
      if invoice_row.posted_journal_entry_id is null then
        raise exception 'Invoice must have posted journal entry.';
      end if;
      if alloc_amount > invoice_row.outstanding_amount then
        raise exception 'Allocation exceeds invoice outstanding amount.';
      end if;

      select jel.account_id
      into payment_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.credit_amount > 0
      order by jel.line_order
      limit 1;

      select jel.account_id
      into invoice_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = invoice_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.debit_amount > 0
      order by jel.line_order
      limit 1;

      if payment_ar_account_id is null or invoice_ar_account_id is null then
        raise exception 'Unable to verify receivable accounts for reconciliation.';
      end if;
      if payment_ar_account_id <> invoice_ar_account_id then
        raise exception 'Receivable account mismatch between payment and invoice.';
      end if;

      insert into payment_allocations (payment_id, invoice_id, vendor_bill_id, amount, created_by)
      values (payment_row.id, invoice_row.id, null, alloc_amount, p_actor);

      update invoices
      set paid_amount = round(paid_amount + alloc_amount, 2),
          outstanding_amount = round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2),
          invoice_status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            else 'posted'
          end,
          payment_status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            when round(paid_amount + alloc_amount, 2) > 0 then 'partial'
            else 'unpaid'
          end,
          updated_at = now()
      where id = invoice_row.id;

    else
      if payment_row.payment_type <> 'outbound' then
        raise exception 'Outbound payment is required for vendor bill reconciliation.';
      end if;

      select *
      into bill_row
      from vendor_bills
      where id = alloc_vendor_bill_id
      for update;
      if not found then
        raise exception 'Vendor bill not found.';
      end if;
      if bill_row.vendor_partner_id <> payment_row.partner_id then
        raise exception 'Payment and vendor bill partners must match.';
      end if;
      if bill_row.status not in ('posted', 'paid') then
        raise exception 'Only posted/paid vendor bills can be reconciled.';
      end if;
      if bill_row.posted_journal_entry_id is null then
        raise exception 'Vendor bill must have posted journal entry.';
      end if;
      if alloc_amount > bill_row.outstanding_amount then
        raise exception 'Allocation exceeds vendor bill outstanding amount.';
      end if;

      select jel.account_id
      into payment_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.debit_amount > 0
      order by jel.line_order
      limit 1;

      select jel.account_id
      into bill_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = bill_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.credit_amount > 0
      order by jel.line_order
      limit 1;

      if payment_ap_account_id is null or bill_ap_account_id is null then
        raise exception 'Unable to verify payable accounts for reconciliation.';
      end if;
      if payment_ap_account_id <> bill_ap_account_id then
        raise exception 'Payable account mismatch between payment and vendor bill.';
      end if;

      insert into payment_allocations (payment_id, invoice_id, vendor_bill_id, amount, created_by)
      values (payment_row.id, null, bill_row.id, alloc_amount, p_actor);

      update vendor_bills
      set paid_amount = round(paid_amount + alloc_amount, 2),
          outstanding_amount = round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2),
          status = case
            when round(greatest(total_amount - (paid_amount + alloc_amount), 0), 2) = 0 then 'paid'
            else 'posted'
          end,
          updated_at = now()
      where id = bill_row.id;
    end if;
  end loop;

  update payments
  set allocated_amount = round(allocated_amount + requested_total, 2),
      updated_at = now()
  where id = payment_row.id;
end
$$;

grant execute on function public.reconcile_payment_allocations(uuid, jsonb, text) to service_role;
