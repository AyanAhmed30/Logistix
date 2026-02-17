-- =====================================================
-- Migration: Add username and password to sales_agents
-- Purpose: Enable sales agent authentication
-- =====================================================

-- Add username column (unique, not null)
alter table sales_agents 
add column if not exists username text;

-- Add password column (not null)
alter table sales_agents 
add column if not exists password text;

-- Make username unique
do $$
begin
  if not exists (
    select 1 from pg_constraint 
    where conname = 'sales_agents_username_key'
  ) then
    alter table sales_agents add constraint sales_agents_username_key unique (username);
  end if;
end $$;

-- Create index on username for faster lookups
create index if not exists idx_sales_agents_username on sales_agents(username);

-- Make email and phone_number nullable (they're no longer required)
alter table sales_agents 
alter column email drop not null;

alter table sales_agents 
alter column phone_number drop not null;
