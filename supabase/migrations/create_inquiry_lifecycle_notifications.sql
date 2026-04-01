-- =====================================================
-- Migration: Create Inquiry Lifecycle Notifications
-- Purpose: Notify Sales/Operations for key inquiry workflow events
-- =====================================================

create table if not exists inquiry_lifecycle_notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  inquiry_id uuid null references lead_inquiries(id) on delete set null,
  confirmation_id uuid null references inquiry_confirmations(id) on delete set null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  event_type text not null check (event_type in ('inquiry_sent', 'sent_for_admin_approval', 'approved', 'rejected')),
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_inquiry_lifecycle_notifications_recipient
  on inquiry_lifecycle_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table inquiry_lifecycle_notifications enable row level security;

create policy "Full access for service role"
on inquiry_lifecycle_notifications
for all
using (true)
with check (true);
