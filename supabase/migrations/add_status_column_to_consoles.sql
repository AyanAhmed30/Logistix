-- =====================================================
-- Migration: Add status column to consoles table
-- Purpose: Add status column to existing consoles table if it doesn't exist
-- Related Table: consoles
-- Related Functionality: Console Management, Loading Instructions
-- =====================================================

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
