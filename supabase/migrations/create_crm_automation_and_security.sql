-- =====================================================
-- CRM AUTOMATION + SECURITY FOUNDATION (Phase 8/9)
-- Safe to run multiple times (idempotent).
-- =====================================================

-- Opportunity automation columns
ALTER TABLE public.crm_opportunities
  ADD COLUMN IF NOT EXISTS lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS lead_score INTEGER NOT NULL DEFAULT 0
    CHECK (lead_score >= 0 AND lead_score <= 100),
  ADD COLUMN IF NOT EXISTS date_closed TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS probability_manual BOOLEAN NOT NULL DEFAULT FALSE;

-- Stage default probability for auto-update
ALTER TABLE public.crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS default_probability INTEGER NOT NULL DEFAULT 10
    CHECK (default_probability >= 0 AND default_probability <= 100);

-- Seed known stage probabilities (by name, per org)
UPDATE public.crm_pipeline_stages SET default_probability = 10
  WHERE lower(name) = 'new' AND default_probability = 10;
UPDATE public.crm_pipeline_stages SET default_probability = 40
  WHERE lower(name) IN ('qualified');
UPDATE public.crm_pipeline_stages SET default_probability = 70
  WHERE lower(name) IN ('proposition', 'proposal');
UPDATE public.crm_pipeline_stages SET default_probability = 100
  WHERE is_won = TRUE;
UPDATE public.crm_pipeline_stages SET default_probability = 0
  WHERE is_lost = TRUE;

-- Lost reason catalog (org-scoped, with global defaults seeded per org via app)
CREATE TABLE IF NOT EXISTS public.crm_lost_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS idx_crm_lost_reasons_org
  ON public.crm_lost_reasons (organization_id, sequence);

-- Stage → auto activity rules
CREATE TABLE IF NOT EXISTS public.crm_stage_activity_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.crm_pipeline_stages(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'follow-up'
    CHECK (activity_type IN ('call', 'meeting', 'email', 'follow-up', 'todo')),
  summary_template TEXT NOT NULL DEFAULT 'Follow up',
  due_in_days INTEGER NOT NULL DEFAULT 2,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, stage_id, activity_type)
);

CREATE INDEX IF NOT EXISTS idx_crm_stage_activity_rules_stage
  ON public.crm_stage_activity_rules (stage_id) WHERE is_active = TRUE;

-- Email templates (structure only — sending not implemented)
CREATE TABLE IF NOT EXISTS public.crm_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, name)
);

-- Security / audit log structure (for future audit reports)
CREATE TABLE IF NOT EXISTS public.crm_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL DEFAULT 'opportunity',
  entity_id UUID,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_org_created
  ON public.crm_audit_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_crm_audit_logs_entity
  ON public.crm_audit_logs (entity_type, entity_id, created_at DESC);

ALTER TABLE public.crm_lost_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_stage_activity_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_audit_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_lost_reasons' AND policyname = 'crm_lost_reasons_service_role'
  ) THEN
    CREATE POLICY crm_lost_reasons_service_role ON public.crm_lost_reasons FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_stage_activity_rules' AND policyname = 'crm_stage_activity_rules_service_role'
  ) THEN
    CREATE POLICY crm_stage_activity_rules_service_role ON public.crm_stage_activity_rules FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_email_templates' AND policyname = 'crm_email_templates_service_role'
  ) THEN
    CREATE POLICY crm_email_templates_service_role ON public.crm_email_templates FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_audit_logs' AND policyname = 'crm_audit_logs_service_role'
  ) THEN
    CREATE POLICY crm_audit_logs_service_role ON public.crm_audit_logs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
