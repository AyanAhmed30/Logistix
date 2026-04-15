-- =====================================================
-- Migration: Lead Activity Logs + Inquiry Versioning
-- Purpose: Odoo-like traceability for lead + inquiry lifecycle
-- =====================================================

alter table public.lead_inquiries
  add column if not exists inquiry_group_id uuid default gen_random_uuid(),
  add column if not exists version_number integer not null default 1,
  add column if not exists is_current_version boolean not null default true;

create index if not exists idx_lead_inquiries_group_version
  on public.lead_inquiries(lead_id, inquiry_group_id, version_number desc);

create index if not exists idx_lead_inquiries_current_version
  on public.lead_inquiries(lead_id, is_current_version, updated_at desc);

create table if not exists public.lead_activity_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  inquiry_id uuid null references public.lead_inquiries(id) on delete set null,
  inquiry_version integer null,
  action_type text not null check (
    action_type in (
      'lead_created',
      'lead_updated',
      'inquiry_created_draft',
      'inquiry_edited',
      'inquiry_sent',
      'inquiry_resent',
      'inquiry_viewed',
      'inquiry_status_changed'
    )
  ),
  action_label text not null,
  metadata jsonb null,
  previous_values jsonb null,
  new_values jsonb null,
  performed_by text not null,
  performed_at timestamptz not null default now()
);

create index if not exists idx_lead_activity_logs_lead_performed
  on public.lead_activity_logs(lead_id, performed_at desc);

create index if not exists idx_lead_activity_logs_inquiry
  on public.lead_activity_logs(inquiry_id, performed_at desc);

alter table public.lead_activity_logs enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'lead_activity_logs'
      and policyname = 'Full access for service role'
  ) then
    create policy "Full access for service role"
      on public.lead_activity_logs
      for all
      using (true)
      with check (true);
  end if;
end
$$;
