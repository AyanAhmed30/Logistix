-- =====================================================
-- Migration: enhance payroll_records fields
-- Purpose: Add notes, gross_salary, and net_salary
-- =====================================================

alter table public.payroll_records
  add column if not exists notes text,
  add column if not exists gross_salary numeric not null default 0,
  add column if not exists net_salary numeric not null default 0;

-- Backfill calculated values for existing rows
update public.payroll_records
set
  gross_salary = coalesce(salary, 0) + coalesce(hardship_allowance, 0),
  net_salary =
    coalesce(salary, 0) + coalesce(hardship_allowance, 0) - coalesce(deductions, 0)
where
  gross_salary = 0
  and net_salary = 0
  and (coalesce(salary, 0) <> 0 or coalesce(hardship_allowance, 0) <> 0 or coalesce(deductions, 0) <> 0);
