-- =====================================================
-- Migration: Simple Inquiry Approval Status
-- Purpose: Make approved inquiry visibility explicit for Sales Agent
-- =====================================================

alter table public.lead_inquiries
  add column if not exists approval_status text not null default 'sent'
    check (approval_status in ('sent', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz null;

create index if not exists idx_lead_inquiries_approval_status
  on public.lead_inquiries(lead_id, approval_status, approved_at desc);
