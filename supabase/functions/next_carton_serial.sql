-- =====================================================
-- Function: next_carton_serial()
-- Purpose: Generate next sequential carton serial number
-- Related Functionality: Order Creation, Carton Serial Number Generation
-- Related Table: serial_counter
-- =====================================================

create or replace function next_carton_serial()
returns bigint
language plpgsql
as $$
declare
  next_val bigint;
begin
  update serial_counter
  set last_serial_number = last_serial_number + 1
  where id = 1
  returning last_serial_number into next_val;

  return next_val;
end;
$$;
