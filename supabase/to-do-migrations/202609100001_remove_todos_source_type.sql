-- =====================================================
-- Migration: remove todos.source_type
-- Purpose: Drop Source Type category from Global To-Do
-- Existing rows remain valid; assignment columns are unchanged
-- Location: supabase/to-do-migrations/
-- =====================================================

alter table public.todos
  drop constraint if exists todos_source_type_check;

alter table public.todos
  drop column if exists source_type;
