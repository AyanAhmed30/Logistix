-- =====================================================
-- Migration: repoint HR module foreign keys
-- Purpose: Change FK targets from public.hr_employees(id)
--          to public.employees(id)
-- Notes: Does not recreate tables or migrate row data.
--        Ensure public.employees exists before running.
-- =====================================================

-- Drop any existing FK constraints that still reference hr_employees.
do $$
declare
  r record;
begin
  for r in
    select
      c.conrelid::regclass as table_name,
      c.conname as constraint_name
    from pg_constraint c
    join pg_class ref on ref.oid = c.confrelid
    join pg_namespace n on n.oid = ref.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and ref.relname = 'hr_employees'
      and c.connamespace = 'public'::regnamespace
  loop
    execute format(
      'alter table %s drop constraint if exists %I',
      r.table_name,
      r.constraint_name
    );
  end loop;
end $$;

-- Recreate FK constraints against public.employees(id).
alter table public.attendance_records
  drop constraint if exists attendance_records_employee_id_fkey;

alter table public.attendance_records
  add constraint attendance_records_employee_id_fkey
  foreign key (employee_id)
  references public.employees(id)
  on delete cascade;

alter table public.leave_requests
  drop constraint if exists leave_requests_employee_id_fkey;

alter table public.leave_requests
  add constraint leave_requests_employee_id_fkey
  foreign key (employee_id)
  references public.employees(id)
  on delete cascade;

alter table public.employee_documents
  drop constraint if exists employee_documents_employee_id_fkey;

alter table public.employee_documents
  add constraint employee_documents_employee_id_fkey
  foreign key (employee_id)
  references public.employees(id)
  on delete cascade;

alter table public.payroll_records
  drop constraint if exists payroll_records_employee_id_fkey;

alter table public.payroll_records
  add constraint payroll_records_employee_id_fkey
  foreign key (employee_id)
  references public.employees(id)
  on delete cascade;

alter table public.generated_reports
  drop constraint if exists generated_reports_generated_by_fkey;

alter table public.generated_reports
  add constraint generated_reports_generated_by_fkey
  foreign key (generated_by)
  references public.employees(id)
  on delete cascade;
