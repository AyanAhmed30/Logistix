-- =====================================================
-- Table: hr_staff
-- Purpose: Store HR personnel profiles (linked to app_users)
-- Related Functionality: Admin HR Management, HR login
-- Linked Auth: public.app_users (role = 'hr_person') via user_id
-- =====================================================

create table if not exists public.hr_staff (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.app_users(id) on delete cascade,
  full_name text not null,
  username text not null unique,
  email text,
  phone text,
  department text,
  designation text,
  employee_id text,
  joining_date date,
  status text not null default 'active' check (status in ('active', 'inactive')),
  address text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.hr_staff enable row level security;

create policy "Full access for service role"
on public.hr_staff
for all
using (true)
with check (true);

create index if not exists idx_hr_staff_user_id on public.hr_staff(user_id);
create index if not exists idx_hr_staff_username on public.hr_staff(username);
create index if not exists idx_hr_staff_status on public.hr_staff(status);
create index if not exists idx_hr_staff_created_at on public.hr_staff(created_at desc);
