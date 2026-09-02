-- =====================================================
-- Migration: create leave_requests
-- Purpose: Track employee leave requests
-- =====================================================

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  leave_type text not null check (leave_type in ('annual', 'sick', 'personal', 'maternity', 'paternity', 'unpaid', 'other')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.leave_requests enable row level security;

create policy "Full access for service role"
on public.leave_requests
for all
using (true)
with check (true);

create index if not exists idx_leave_requests_employee_id on public.leave_requests(employee_id);
create index if not exists idx_leave_requests_start_date on public.leave_requests(start_date);
create index if not exists idx_leave_requests_status on public.leave_requests(status);
create index if not exists idx_leave_requests_created_at on public.leave_requests(created_at desc);
