-- =====================================================
-- Migration: enhance employees profile fields
-- Purpose: Add employment, shift, hierarchy, personal,
--          education, and work experience columns
-- =====================================================

alter table public.employees
  drop constraint if exists employees_status_check;

alter table public.employees
  add constraint employees_status_check
  check (
    status in (
      'active',
      'inactive',
      'on_leave',
      'suspended',
      'resigned',
      'terminated'
    )
  );

alter table public.employees
  add column if not exists employment_type text,
  add column if not exists shift_timing text,
  add column if not exists joining_date date,
  add column if not exists reporting_manager text,
  add column if not exists secondary_reporting_manager text,
  add column if not exists date_of_birth date,
  add column if not exists age integer,
  add column if not exists gender text,
  add column if not exists institute_name text,
  add column if not exists degree_diploma text,
  add column if not exists specialization text,
  add column if not exists company_name text,
  add column if not exists job_title text,
  add column if not exists duration text,
  add column if not exists job_description text;

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
      'internee'
    )
  );

alter table public.employees
  drop constraint if exists employees_gender_check;

alter table public.employees
  add constraint employees_gender_check
  check (
    gender is null
    or gender in ('male', 'female', 'other', 'prefer_not_to_say')
  );
