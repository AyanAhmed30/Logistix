-- =====================================================
-- CRM PIPELINE MODULE — Stages & Opportunities (Phase 2/3)
-- Safe to run multiple times (idempotent).
-- =====================================================

-- -----------------------------------------------------
-- 1. Pipeline stages
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  is_won BOOLEAN NOT NULL DEFAULT FALSE,
  is_lost BOOLEAN NOT NULL DEFAULT FALSE,
  is_folded BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_org_seq
  ON public.crm_pipeline_stages (organization_id, sequence);

-- -----------------------------------------------------
-- 2. Opportunities
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_person_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  expected_revenue NUMERIC(16, 2) NOT NULL DEFAULT 0,
  probability INTEGER NOT NULL DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  priority INTEGER NOT NULL DEFAULT 0 CHECK (priority >= 0 AND priority <= 3),
  salesperson_id UUID REFERENCES public.sales_agents(id) ON DELETE SET NULL,
  sales_team TEXT,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  campaign TEXT,
  medium TEXT,
  source TEXT,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  website TEXT,
  expected_closing_date DATE,
  internal_notes TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_org_stage
  ON public.crm_opportunities (organization_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_contact
  ON public.crm_opportunities (contact_id);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_salesperson
  ON public.crm_opportunities (salesperson_id);

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_created_at
  ON public.crm_opportunities (created_at DESC);

-- -----------------------------------------------------
-- 3. RLS (service role used by server actions; enable for safety)
-- -----------------------------------------------------
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_pipeline_stages'
      AND policyname = 'crm_pipeline_stages_service_role'
  ) THEN
    CREATE POLICY crm_pipeline_stages_service_role ON public.crm_pipeline_stages
      FOR ALL USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'crm_opportunities'
      AND policyname = 'crm_opportunities_service_role'
  ) THEN
    CREATE POLICY crm_opportunities_service_role ON public.crm_opportunities
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
