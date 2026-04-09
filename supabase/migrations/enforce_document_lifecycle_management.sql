-- Document lifecycle management (backward-compatible hardening)
-- Scope:
-- - State machines for invoices, vendor bills, payments, journal entries
-- - DB transition validation + immutability guards
-- - Audit trail columns
-- - Posted deletion protection
-- - Reconciliation updates to partially_paid/reconciled states

-- =====================================================
-- 1) Audit trail columns
-- =====================================================
alter table public.invoices
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists posted_by text,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;

alter table public.vendor_bills
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists posted_by text,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz,
  add column if not exists cancelled_by text,
  add column if not exists cancelled_at timestamptz;

alter table public.payments
  add column if not exists posted_by text,
  add column if not exists posted_at timestamptz,
  add column if not exists reconciled_by text,
  add column if not exists reconciled_at timestamptz,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz;

alter table public.journal_entries
  add column if not exists posted_by text,
  add column if not exists reversed_by text,
  add column if not exists reversed_at timestamptz;

-- =====================================================
-- 2) Expand status constraints safely
-- =====================================================
do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'invoices'
      and constraint_name = 'invoices_invoice_status_check'
  ) then
    alter table public.invoices drop constraint invoices_invoice_status_check;
  end if;
end
$$;

alter table public.invoices
  add constraint invoices_invoice_status_check
  check (invoice_status in ('draft', 'approved', 'confirmed', 'posted', 'partially_paid', 'paid', 'cancelled'));

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'vendor_bills'
      and constraint_name = 'vendor_bills_status_check'
  ) then
    alter table public.vendor_bills drop constraint vendor_bills_status_check;
  end if;
end
$$;

alter table public.vendor_bills
  add constraint vendor_bills_status_check
  check (status in ('draft', 'approved', 'posted', 'partially_paid', 'paid', 'cancelled'));

do $$
begin
  if exists (
    select 1
    from information_schema.table_constraints
    where table_schema = 'public'
      and table_name = 'payments'
      and constraint_name = 'payments_status_check'
  ) then
    alter table public.payments drop constraint payments_status_check;
  end if;
end
$$;

alter table public.payments
  add constraint payments_status_check
  check (status in ('draft', 'posted', 'reconciled', 'reversed'));

-- =====================================================
-- 3) Transition validators + immutability guards
-- =====================================================
create or replace function public.enforce_invoice_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.invoice_status <> 'draft' then
      raise exception 'Only draft invoices can be deleted. Use cancellation/reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    -- Status transition validation
    if old.invoice_status <> new.invoice_status then
      if old.invoice_status = 'draft' and new.invoice_status in ('approved', 'confirmed', 'cancelled') then
        null;
      elsif old.invoice_status in ('approved', 'confirmed') and new.invoice_status in ('posted', 'cancelled') then
        null;
      elsif old.invoice_status = 'posted' and new.invoice_status in ('partially_paid', 'paid', 'cancelled') then
        null;
      elsif old.invoice_status = 'partially_paid' and new.invoice_status in ('paid', 'cancelled') then
        null;
      elsif old.invoice_status = 'paid' and new.invoice_status = 'cancelled' then
        null;
      else
        raise exception 'Invalid invoice state transition: % -> %', old.invoice_status, new.invoice_status;
      end if;
    end if;

    -- Immutability of posted financial fields
    if old.invoice_status in ('posted', 'partially_paid', 'paid') then
      if (new.quotation_id, new.partner_id, new.customer_name, new.product_service, new.quantity, new.unit_price, new.total_amount, new.invoice_date, new.due_date)
         is distinct from
         (old.quotation_id, old.partner_id, old.customer_name, old.product_service, old.quantity, old.unit_price, old.total_amount, old.invoice_date, old.due_date) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_invoice_lifecycle on public.invoices;
create trigger trg_enforce_invoice_lifecycle
before update or delete on public.invoices
for each row execute function public.enforce_invoice_lifecycle();

create or replace function public.enforce_vendor_bill_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft vendor bills can be deleted. Use cancellation/reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'draft' and new.status in ('approved', 'cancelled') then
        null;
      elsif old.status = 'approved' and new.status in ('posted', 'cancelled') then
        null;
      elsif old.status = 'posted' and new.status in ('partially_paid', 'paid', 'cancelled') then
        null;
      elsif old.status = 'partially_paid' and new.status in ('paid', 'cancelled') then
        null;
      elsif old.status = 'paid' and new.status = 'cancelled' then
        null;
      else
        raise exception 'Invalid vendor bill state transition: % -> %', old.status, new.status;
      end if;
    end if;

    if old.status in ('posted', 'partially_paid', 'paid') then
      if (new.vendor_partner_id, new.bill_number, new.bill_date, new.due_date, new.total_amount, new.expense_account_id, new.payable_account_id)
         is distinct from
         (old.vendor_partner_id, old.bill_number, old.bill_date, old.due_date, old.total_amount, old.expense_account_id, old.payable_account_id) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_vendor_bill_lifecycle on public.vendor_bills;
create trigger trg_enforce_vendor_bill_lifecycle
before update or delete on public.vendor_bills
for each row execute function public.enforce_vendor_bill_lifecycle();

create or replace function public.enforce_payment_lifecycle()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Only draft payments can be deleted. Use reversal.';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if old.status <> new.status then
      if old.status = 'draft' and new.status = 'posted' then
        null;
      elsif old.status = 'posted' and new.status in ('reconciled', 'reversed') then
        null;
      elsif old.status = 'reconciled' and new.status = 'reversed' then
        null;
      else
        raise exception 'Invalid payment state transition: % -> %', old.status, new.status;
      end if;
    end if;

    if old.status in ('posted', 'reconciled', 'reversed') then
      if (new.payment_number, new.partner_id, new.payment_type, new.amount, new.payment_date, new.journal_id, new.receivable_account_id, new.payable_account_id, new.liquidity_account_id)
         is distinct from
         (old.payment_number, old.partner_id, old.payment_type, old.amount, old.payment_date, old.journal_id, old.receivable_account_id, old.payable_account_id, old.liquidity_account_id) then
        raise exception 'Posted records cannot be modified';
      end if;
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists trg_enforce_payment_lifecycle on public.payments;
create trigger trg_enforce_payment_lifecycle
before update or delete on public.payments
for each row execute function public.enforce_payment_lifecycle();

-- =====================================================
-- 4) Reconciliation engine lifecycle status updates
-- =====================================================
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

  select * into payment_row
  from payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Payment not found.';
  end if;
  if payment_row.status not in ('posted', 'reconciled') then
    raise exception 'Only posted/reconciled payments can be reconciled.';
  end if;
  if payment_row.posted_journal_entry_id is null then
    raise exception 'Posted payment must have journal entry reference.';
  end if;

  for alloc in select value from jsonb_array_elements(p_allocations)
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

  if payment_row.allocated_amount + requested_total > payment_row.amount then
    raise exception 'Cannot reconcile more than remaining payment amount.';
  end if;

  for alloc in select value from jsonb_array_elements(p_allocations)
  loop
    alloc_amount := round(coalesce((alloc ->> 'amount')::numeric, 0), 2);
    alloc_invoice_id := nullif(alloc ->> 'invoice_id', '')::uuid;
    alloc_vendor_bill_id := nullif(alloc ->> 'vendor_bill_id', '')::uuid;

    if alloc_invoice_id is not null then
      if payment_row.payment_type <> 'inbound' then
        raise exception 'Inbound payment is required for invoice reconciliation.';
      end if;

      select * into invoice_row
      from invoices
      where id = alloc_invoice_id
      for update;

      if not found then
        raise exception 'Invoice not found.';
      end if;
      if invoice_row.partner_id <> payment_row.partner_id then
        raise exception 'Payment and invoice partners must match.';
      end if;
      if invoice_row.invoice_status not in ('posted', 'partially_paid', 'paid') then
        raise exception 'Only posted/partially_paid/paid invoices can be reconciled.';
      end if;
      if invoice_row.posted_journal_entry_id is null then
        raise exception 'Invoice must have posted journal entry.';
      end if;
      if alloc_amount > invoice_row.outstanding_amount then
        raise exception 'Allocation exceeds invoice outstanding amount.';
      end if;

      select jel.account_id into payment_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.credit_amount > 0
      order by jel.line_order limit 1;

      select jel.account_id into invoice_ar_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = invoice_row.posted_journal_entry_id
        and jel.partner_reference ilike 'customer:%'
        and jel.debit_amount > 0
      order by jel.line_order limit 1;

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
            when round(paid_amount + alloc_amount, 2) > 0 then 'partially_paid'
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

      select * into bill_row
      from vendor_bills
      where id = alloc_vendor_bill_id
      for update;

      if not found then
        raise exception 'Vendor bill not found.';
      end if;
      if bill_row.vendor_partner_id <> payment_row.partner_id then
        raise exception 'Payment and vendor bill partners must match.';
      end if;
      if bill_row.status not in ('posted', 'partially_paid', 'paid') then
        raise exception 'Only posted/partially_paid/paid vendor bills can be reconciled.';
      end if;
      if bill_row.posted_journal_entry_id is null then
        raise exception 'Vendor bill must have posted journal entry.';
      end if;
      if alloc_amount > bill_row.outstanding_amount then
        raise exception 'Allocation exceeds vendor bill outstanding amount.';
      end if;

      select jel.account_id into payment_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = payment_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.debit_amount > 0
      order by jel.line_order limit 1;

      select jel.account_id into bill_ap_account_id
      from journal_entry_lines jel
      where jel.journal_entry_id = bill_row.posted_journal_entry_id
        and jel.partner_reference ilike 'vendor:%'
        and jel.credit_amount > 0
      order by jel.line_order limit 1;

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
            when round(paid_amount + alloc_amount, 2) > 0 then 'partially_paid'
            else 'posted'
          end,
          updated_at = now()
      where id = bill_row.id;
    end if;
  end loop;

  update payments
  set allocated_amount = round(allocated_amount + requested_total, 2),
      status = case
        when round(allocated_amount + requested_total, 2) >= round(amount, 2) then 'reconciled'
        else 'posted'
      end,
      reconciled_at = case
        when round(allocated_amount + requested_total, 2) >= round(amount, 2) then now()
        else reconciled_at
      end,
      updated_at = now()
  where id = payment_row.id;
end
$$;

grant execute on function public.reconcile_payment_allocations(uuid, jsonb, text) to service_role;
