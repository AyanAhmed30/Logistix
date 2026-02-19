-- =====================================================
-- Migration: Add permissions column to sales_agents
-- Purpose: Store additional module access permissions for sales agents
-- =====================================================

-- Add permissions column as JSONB to store array of permission keys
alter table sales_agents 
add column if not exists permissions jsonb default '[]'::jsonb;

-- Create index on permissions for faster queries
create index if not exists idx_sales_agents_permissions on sales_agents using gin(permissions);

-- Update existing sales agents to have empty permissions array
update sales_agents
set permissions = '[]'::jsonb
where permissions is null;
