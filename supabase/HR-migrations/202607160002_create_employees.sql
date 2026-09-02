-- =====================================================
-- Migration: create employees
-- Purpose: Normal company employee profile records (no auth)
-- Auth: profile-only — employees do NOT have app_users accounts
-- =====================================================

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  username text not null unique,
  email text,
  phone text,
  department text,
  designation text,
  employee_id text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.employees enable row level security;

create policy "Full access for service role"
on public.employees
for all
using (true)
with check (true);

create index if not exists idx_employees_username on public.employees(username);
create index if not exists idx_employees_status on public.employees(status);
create index if not exists idx_employees_created_at on public.employees(created_at desc);
