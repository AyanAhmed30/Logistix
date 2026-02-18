-- =====================================================
-- Migration: Add status field to leads and create lead_comments table
-- Purpose: Enable Kanban board functionality with status tracking and comments
-- Related Functionality: Sales Agent Dashboard - Pipeline Tab
-- =====================================================

-- Add status column to leads table
alter table leads 
add column if not exists status text not null default 'Leads' 
check (status in ('Leads', 'Inquiry Received', 'Quotation Sent', 'Negotiation', 'Win'));

-- Create index on status for faster queries
create index if not exists idx_leads_status on leads(status);

-- =====================================================
-- Table: lead_comments
-- Purpose: Store comments for leads with timestamps
-- Related Functionality: Sales Agent Dashboard - Pipeline Tab - Comments
-- =====================================================

create table if not exists lead_comments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  comment text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create indexes
create index if not exists idx_lead_comments_lead_id on lead_comments(lead_id);
create index if not exists idx_lead_comments_created_at on lead_comments(created_at desc);

-- Enable Row Level Security
alter table lead_comments enable row level security;

-- Create a policy to allow Admin Client (Service Role) to do everything
create policy "Full access for service role" 
on lead_comments 
for all 
using (true) 
with check (true);
