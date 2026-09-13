-- =====================================================
-- Migration: add Hybrid employment type
-- Purpose: Allow employment_type = 'hybrid'
-- Location: supabase/HR-migrations/ (do not copy into supabase/migrations/)
-- =====================================================

alter table public.employees
  drop constraint if exists employees_employment_type_check;

alter table public.employees
  add constraint employees_employment_type_check
  check (
    employment_type is null
    or employment_type in (
      'permanent',
      'probation',
      'contract',
      'temporary',
      'part_time',
      'full_time',
      'internee',
      'hybrid'
    )
  );
