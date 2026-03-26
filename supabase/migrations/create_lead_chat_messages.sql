-- =====================================================
-- Migration: Create Lead Chat Messages
-- Purpose: Enable lead-specific communication between Sales and Operations
-- =====================================================

create table if not exists lead_chat_messages (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  message text not null,
  sender_role text not null check (sender_role in ('sales_agent', 'operations', 'admin')),
  sender_username text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_lead_chat_messages_lead_id_created_at
  on lead_chat_messages(lead_id, created_at asc);

alter table lead_chat_messages enable row level security;

create policy "Full access for service role"
on lead_chat_messages
for all
using (true)
with check (true);
