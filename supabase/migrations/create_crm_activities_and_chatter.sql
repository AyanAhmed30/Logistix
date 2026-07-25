-- =====================================================
-- CRM ACTIVITIES + OPPORTUNITY CHATTER
-- Safe to run multiple times (idempotent).
-- =====================================================

CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'todo'
    CHECK (activity_type IN ('call', 'meeting', 'email', 'follow-up', 'todo')),
  summary TEXT NOT NULL,
  notes TEXT,
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES public.sales_agents(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'done', 'cancelled')),
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_org_due
  ON public.crm_activities (organization_id, due_date);

CREATE INDEX IF NOT EXISTS idx_crm_activities_opportunity
  ON public.crm_activities (opportunity_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_crm_activities_assigned
  ON public.crm_activities (assigned_to, status, due_date);

CREATE TABLE IF NOT EXISTS public.crm_opportunity_chatter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL
    CHECK (entry_type IN ('message', 'note', 'attachment', 'audit', 'reply')),
  body TEXT NOT NULL DEFAULT '',
  performed_by TEXT NOT NULL,
  parent_id UUID REFERENCES public.crm_opportunity_chatter(id) ON DELETE CASCADE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_opportunity_chatter_opp
  ON public.crm_opportunity_chatter (opportunity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.crm_opportunity_followers (
  opportunity_id UUID NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (opportunity_id, username)
);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunity_chatter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_opportunity_followers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_activities' AND policyname = 'crm_activities_service_role'
  ) THEN
    CREATE POLICY crm_activities_service_role ON public.crm_activities FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_opportunity_chatter' AND policyname = 'crm_opportunity_chatter_service_role'
  ) THEN
    CREATE POLICY crm_opportunity_chatter_service_role ON public.crm_opportunity_chatter FOR ALL USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'crm_opportunity_followers' AND policyname = 'crm_opportunity_followers_service_role'
  ) THEN
    CREATE POLICY crm_opportunity_followers_service_role ON public.crm_opportunity_followers FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
