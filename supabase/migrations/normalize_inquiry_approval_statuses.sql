-- =====================================================
-- Migration: Normalize Inquiry Approval Statuses
-- Purpose: Support draft/sent/approved/rejected status-based stats
-- =====================================================

alter table public.lead_inquiries
  add column if not exists approval_status text,
  add column if not exists approved_at timestamptz null;

alter table public.lead_inquiries
  alter column approval_status set default 'draft';

update public.lead_inquiries
set approval_status = coalesce(approval_status, 'draft')
where approval_status is null;

alter table public.lead_inquiries
  alter column approval_status set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'lead_inquiries_approval_status_check'
      and conrelid = 'public.lead_inquiries'::regclass
  ) then
    alter table public.lead_inquiries
      drop constraint lead_inquiries_approval_status_check;
  end if;
end
$$;

alter table public.lead_inquiries
  add constraint lead_inquiries_approval_status_check
  check (approval_status in ('draft', 'sent', 'approved', 'rejected'));

update public.lead_inquiries
set approval_status = case
  when sent_to_accounting = false then 'draft'
  when approval_status = 'approved' then 'approved'
  when approval_status = 'rejected' then 'rejected'
  else 'sent'
end,
approved_at = case
  when approval_status = 'approved' then approved_at
  else null
end
where
  approval_status is distinct from (
    case
      when sent_to_accounting = false then 'draft'
      when approval_status = 'approved' then 'approved'
      when approval_status = 'rejected' then 'rejected'
      else 'sent'
    end
  )
  or (
    approval_status <> 'approved'
    and approved_at is not null
  );
