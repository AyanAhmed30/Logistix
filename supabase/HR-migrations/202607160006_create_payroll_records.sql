-- =====================================================
-- Migration: create payroll_records
-- Purpose: Track employee payroll records
-- =====================================================

create table if not exists public.payroll_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  salary numeric not null default 0,
  hardship_allowance numeric default 0,
  deductions numeric default 0,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'failed')),
  payment_date date,
  pdf_name text,
  pdf_path text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.payroll_records enable row level security;

create policy "Full access for service role"
on public.payroll_records
for all
using (true)
with check (true);

create index if not exists idx_payroll_records_employee_id on public.payroll_records(employee_id);
create index if not exists idx_payroll_records_payment_status on public.payroll_records(payment_status);
create index if not exists idx_payroll_records_payment_date on public.payroll_records(payment_date);
create index if not exists idx_payroll_records_created_at on public.payroll_records(created_at desc);
