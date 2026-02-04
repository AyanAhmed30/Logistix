-- =====================================================
-- Table: serial_counter
-- Purpose: Track serial number generation for cartons
-- Related Functionality: Order Creation, Carton Serial Number Generation
-- =====================================================

create table if not exists serial_counter (
  id integer primary key,
  last_serial_number bigint not null
);

-- Initialize counter if it doesn't exist
insert into serial_counter (id, last_serial_number)
values (1, 0)
on conflict (id) do nothing;
