-- =====================================================
-- Migration: allow weight 0-100 on employee_kpi_goals
-- Purpose: Align weight constraint with Goals & Management UI (0–100)
-- =====================================================

alter table public.employee_kpi_goals
  drop constraint if exists employee_kpi_goals_weight_check;

alter table public.employee_kpi_goals
  add constraint employee_kpi_goals_weight_check
  check (weight >= 0 and weight <= 100);
