-- =====================================================
-- Migration: add monthly tracking to employee KPI goals
-- Purpose: Each goal belongs to a specific calendar month
-- =====================================================

alter table public.employee_kpi_goals
  add column if not exists goal_month date;

comment on column public.employee_kpi_goals.goal_month is
  'First day of the goal month (e.g. 2026-07-01 for July 2026). Nullable for legacy rows.';

create index if not exists idx_employee_kpi_goals_goal_month
  on public.employee_kpi_goals (goal_month desc nulls last);

-- Prevent duplicate goals for the same employee + title + month
create unique index if not exists idx_employee_kpi_goals_unique_month_goal
  on public.employee_kpi_goals (employee_id, lower(goal), goal_month)
  where goal_month is not null;
