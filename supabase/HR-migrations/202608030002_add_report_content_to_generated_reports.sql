-- =====================================================
-- Migration: add report_content to generated_reports
-- Purpose: Persist generated report body for View/Download
-- =====================================================

alter table public.generated_reports
  add column if not exists report_content text;

-- Allow report generation when no employee row is available as generator
alter table public.generated_reports
  alter column generated_by drop not null;
