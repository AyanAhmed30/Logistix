-- =====================================================
-- Migration: Create Lead Chat Notifications
-- Purpose: Notification tracking for Sales <-> Operations chat events
-- =====================================================

create table if not exists lead_chat_notifications (
  id uuid primary key default gen_random_uuid(),
  chat_message_id uuid not null references lead_chat_messages(id) on delete cascade,
  lead_id uuid not null references leads(id) on delete cascade,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  recipient_role text not null check (recipient_role in ('sales_agent', 'operations', 'admin')),
  recipient_username text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_chat_notifications_recipient
  on lead_chat_notifications(recipient_role, recipient_username, is_read, created_at desc);

alter table lead_chat_notifications enable row level security;

create policy "Full access for service role"
on lead_chat_notifications
for all
using (true)
with check (true);
