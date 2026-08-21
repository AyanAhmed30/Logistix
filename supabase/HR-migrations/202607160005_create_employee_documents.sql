-- =====================================================
-- Migration: create employee_documents
-- Purpose: Store employee document records
-- =====================================================

create table if not exists public.employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  title text not null,
  category text not null check (category in ('contract', 'id_card', 'certification', 'tax_form', 'EOBI_registration', 'Medical_Insurance', 'degree', 'experience_certificate', 'undertaking', 'other')),
  expiry_date date,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  pdf_name text,
  pdf_path text,
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.employee_documents enable row level security;

create policy "Full access for service role"
on public.employee_documents
for all
using (true)
with check (true);

create index if not exists idx_employee_documents_employee_id on public.employee_documents(employee_id);
create index if not exists idx_employee_documents_category on public.employee_documents(category);
create index if not exists idx_employee_documents_status on public.employee_documents(status);
create index if not exists idx_employee_documents_created_at on public.employee_documents(created_at desc);
