-- =====================================================
-- Migration: create attendance_records
-- Purpose: Track employee attendance records
-- =====================================================

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  date date not null,
  attendance_type text not null check (attendance_type in ('present', 'absent', 'late', 'half_day', 'leave', 'holiday')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.attendance_records enable row level security;

create policy "Full access for service role"
on public.attendance_records
for all
using (true)
with check (true);

create index if not exists idx_attendance_records_employee_id on public.attendance_records(employee_id);
create index if not exists idx_attendance_records_date on public.attendance_records(date);
create index if not exists idx_attendance_records_status on public.attendance_records(status);
create index if not exists idx_attendance_records_created_at on public.attendance_records(created_at desc);
