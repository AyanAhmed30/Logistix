-- Accounting Review — Working Files (Odoo-style audit working files)
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.accounting_working_file_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'WF',
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_working_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  file_number TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  return_type TEXT NOT NULL DEFAULT 'audit'
    CHECK (return_type IN ('audit', 'annual_report')),
  date_from DATE NOT NULL,
  date_to DATE NOT NULL,
  cycles JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'ongoing'
    CHECK (status IN ('draft', 'ongoing', 'paused', 'done', 'cancelled')),
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (date_to >= date_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_working_files_org_number
  ON public.accounting_working_files (organization_id, file_number);

CREATE INDEX IF NOT EXISTS idx_accounting_working_files_org_status_created
  ON public.accounting_working_files (organization_id, status, created_at DESC);

DO $$
BEGIN
  ALTER TABLE public.accounting_working_files
    DROP CONSTRAINT IF EXISTS accounting_working_files_return_type_check;
  ALTER TABLE public.accounting_working_files
    ADD CONSTRAINT accounting_working_files_return_type_check
    CHECK (return_type IN ('audit', 'annual_report'));
END $$;

NOTIFY pgrst, 'reload schema';
