-- =====================================================
-- Table: sales_agent_serial_ranges
-- Purpose: Store serial number ranges assigned to sales agents
-- Related Functionality: Sales tab - Serial number allocation to sales agents
-- Related Tables: sales_agents
-- =====================================================

create table if not exists sales_agent_serial_ranges (
  id uuid primary key default gen_random_uuid(),
  sales_agent_id uuid not null references sales_agents(id) on delete cascade,
  serial_from text not null,
  serial_to text not null,
  assigned_at timestamptz default now(),
  constraint valid_range check (serial_from <= serial_to)
);

-- Create index on sales_agent_id for faster lookups
create index if not exists idx_sales_agent_serial_ranges_agent_id on sales_agent_serial_ranges(sales_agent_id);

-- Create index on serial ranges for overlap detection
create index if not exists idx_sales_agent_serial_ranges_from on sales_agent_serial_ranges(serial_from);
create index if not exists idx_sales_agent_serial_ranges_to on sales_agent_serial_ranges(serial_to);

-- Function to check for overlapping ranges
create or replace function check_serial_range_overlap(
  p_serial_from text,
  p_serial_to text,
  p_exclude_id uuid default null
)
returns boolean
language plpgsql
as $$
declare
  overlap_count integer;
begin
  select count(*) into overlap_count
  from sales_agent_serial_ranges
  where (
    (serial_from <= p_serial_to and serial_to >= p_serial_from)
    or (p_serial_from <= serial_to and p_serial_to >= serial_from)
  )
  and (p_exclude_id is null or id != p_exclude_id);
  
  return overlap_count = 0;
end;
$$;
