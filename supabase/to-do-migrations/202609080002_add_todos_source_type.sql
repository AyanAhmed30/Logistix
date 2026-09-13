-- =====================================================
-- Migration: add todos.source_type
-- Purpose: Category-only Source Type on existing todos
-- Allowed values: customer, employee, shipment
-- Existing rows remain valid (source_type nullable)
-- Location: supabase/to-do-migrations/
-- =====================================================

alter table public.todos
  add column if not exists source_type text;

alter table public.todos
  drop constraint if exists todos_source_type_check;

alter table public.todos
  add constraint todos_source_type_check
  check (
    source_type is null
    or source_type in ('customer', 'employee', 'shipment')
  );
