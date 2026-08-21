-- =====================================================
-- Migration: create generated_reports
-- Purpose: Store generated HR reports
-- =====================================================

create table if not exists public.generated_reports (
  id uuid primary key default gen_random_uuid(),
  report_type text not null check (report_type in ('attendance', 'leave', 'payroll', 'documents', 'employee_summary')),
  report_title text not null,
  generated_by uuid not null references public.employees(id) on delete cascade,
  generated_at timestamptz not null default timezone('utc'::text, now()),
  pdf_name text,
  pdf_path text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.generated_reports enable row level security;

create policy "Full access for service role"
on public.generated_reports
for all
using (true)
with check (true);

create index if not exists idx_generated_reports_report_type on public.generated_reports(report_type);
create index if not exists idx_generated_reports_generated_by on public.generated_reports(generated_by);
create index if not exists idx_generated_reports_generated_at on public.generated_reports(generated_at desc);
create index if not exists idx_generated_reports_created_at on public.generated_reports(created_at desc);
