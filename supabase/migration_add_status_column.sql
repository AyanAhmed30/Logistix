-- Migration: Add status column to consoles table
-- Run this SQL in your Supabase SQL Editor if you get "column consoles.status does not exist" error

-- Add status column if it doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_name = 'consoles' and column_name = 'status'
  ) then
    alter table consoles add column status text not null default 'active';
    -- Update existing rows to have 'active' status
    update consoles set status = 'active' where status is null;
  end if;
end $$;
