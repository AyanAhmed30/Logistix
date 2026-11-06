-- STEP 051 — Inquiry workflow events (Analytics timing)
-- One append-only timeline per inquiry, used to measure Operations processing
-- time, Admin decision time and total turnaround.
--
-- Existing tables are only read. Triggers record future events automatically,
-- so existing Sales, Operations, Admin and mobile code paths do not change. The
-- triggers can never fail a business transaction (see EXCEPTION blocks).
--
-- Past events are copied from real records only (inquiry_logs, sent_at,
-- inquiry_confirmations, inquiry_flags) and marked source = 'backfill'.
-- Nothing is estimated from updated_at.
-- Idempotent. Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.inquiry_workflow_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.lead_inquiries(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'submitted',             -- Sales or customer sent the inquiry to Operations
    'resubmitted',           -- Sent again after the first send
    'operations_submitted',  -- Operations sent its calculation to Admin
    'admin_calculated',      -- Admin did the calculation directly
    'approved',
    'rejected',
    'flagged'
  )),
  occurred_at timestamptz NOT NULL,
  actor text,                -- Username when the source record has one
  actor_role text,           -- sales, customer, operations, admin
  sales_agent_id uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL,
  confirmation_id uuid REFERENCES public.inquiry_confirmations(id) ON DELETE SET NULL,
  source text NOT NULL DEFAULT 'trigger' CHECK (source IN ('trigger', 'backfill')),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Same event at the same instant is recorded once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_inquiry_workflow_events_once
  ON public.inquiry_workflow_events (inquiry_id, event_type, occurred_at);

CREATE INDEX IF NOT EXISTS idx_inquiry_workflow_events_org_time
  ON public.inquiry_workflow_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiry_workflow_events_type_time
  ON public.inquiry_workflow_events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_inquiry_workflow_events_actor
  ON public.inquiry_workflow_events (lower(actor), occurred_at DESC)
  WHERE actor IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inquiry_workflow_events_agent
  ON public.inquiry_workflow_events (sales_agent_id, occurred_at DESC)
  WHERE sales_agent_id IS NOT NULL;

-- Server code only (service role). No browser access.
ALTER TABLE public.inquiry_workflow_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.inquiry_workflow_events FROM anon, authenticated;
GRANT ALL ON TABLE public.inquiry_workflow_events TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'inquiry_workflow_events'
      AND policyname = 'Service role only'
  ) THEN
    CREATE POLICY "Service role only"
      ON public.inquiry_workflow_events
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Backfill (runs before the triggers exist; inserts into the new table only)
-- ---------------------------------------------------------------------------

-- Sends recorded in inquiry_logs. Skips inquiries that already have send events,
-- so re-running cannot add a second copy at a slightly different timestamp.
INSERT INTO public.inquiry_workflow_events
  (inquiry_id, organization_id, event_type, occurred_at, actor, actor_role, sales_agent_id, source)
SELECT
  log.inquiry_id,
  li.organization_id,
  CASE WHEN log.action = 'inquiry_resent' THEN 'resubmitted' ELSE 'submitted' END,
  log.performed_at,
  log.performed_by,
  'sales',
  l.sales_agent_id,
  'backfill'
FROM public.inquiry_logs log
JOIN public.lead_inquiries li ON li.id = log.inquiry_id
LEFT JOIN public.leads l ON l.id = li.lead_id
WHERE log.action IN ('inquiry_sent', 'inquiry_resent')
  AND log.performed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inquiry_workflow_events e
    WHERE e.inquiry_id = log.inquiry_id
      AND e.event_type IN ('submitted', 'resubmitted')
  )
ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;

-- Sends with no log row (mobile submissions): sent_at is the real send time.
INSERT INTO public.inquiry_workflow_events
  (inquiry_id, organization_id, event_type, occurred_at, actor_role, sales_agent_id, source)
SELECT
  li.id,
  li.organization_id,
  'submitted',
  li.sent_at,
  CASE WHEN (to_jsonb(li) ->> 'customer_submitted') = 'true' THEN 'customer' ELSE 'sales' END,
  l.sales_agent_id,
  'backfill'
FROM public.lead_inquiries li
LEFT JOIN public.leads l ON l.id = li.lead_id
WHERE li.sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.inquiry_workflow_events e
    WHERE e.inquiry_id = li.id
      AND e.event_type IN ('submitted', 'resubmitted')
  )
ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;

-- Operations or Admin calculation submissions.
INSERT INTO public.inquiry_workflow_events
  (inquiry_id, organization_id, event_type, occurred_at, actor, actor_role, sales_agent_id, confirmation_id, source)
SELECT
  c.inquiry_id,
  li.organization_id,
  CASE WHEN (to_jsonb(c) ->> 'submitted_by_role') = 'admin'
    THEN 'admin_calculated' ELSE 'operations_submitted' END,
  c.created_at,
  NULLIF(btrim(c.submitted_by), ''),
  COALESCE(to_jsonb(c) ->> 'submitted_by_role', 'operations'),
  l.sales_agent_id,
  c.id,
  'backfill'
FROM public.inquiry_confirmations c
JOIN public.lead_inquiries li ON li.id = c.inquiry_id
LEFT JOIN public.leads l ON l.id = li.lead_id
WHERE c.created_at IS NOT NULL
ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;

-- Admin decisions.
INSERT INTO public.inquiry_workflow_events
  (inquiry_id, organization_id, event_type, occurred_at, actor, actor_role, sales_agent_id, confirmation_id, source)
SELECT
  c.inquiry_id,
  li.organization_id,
  c.status,
  c.reviewed_at,
  NULLIF(btrim(c.reviewed_by), ''),
  'admin',
  l.sales_agent_id,
  c.id,
  'backfill'
FROM public.inquiry_confirmations c
JOIN public.lead_inquiries li ON li.id = c.inquiry_id
LEFT JOIN public.leads l ON l.id = li.lead_id
WHERE c.status IN ('approved', 'rejected')
  AND c.reviewed_at IS NOT NULL
ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;

-- Flags.
INSERT INTO public.inquiry_workflow_events
  (inquiry_id, organization_id, event_type, occurred_at, actor, actor_role, sales_agent_id, source)
SELECT
  f.inquiry_id,
  li.organization_id,
  'flagged',
  f.created_at,
  NULLIF(btrim(f.raised_by), ''),
  f.raised_by_role,
  l.sales_agent_id,
  'backfill'
FROM public.inquiry_flags f
JOIN public.lead_inquiries li ON li.id = f.inquiry_id
LEFT JOIN public.leads l ON l.id = li.lead_id
ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Triggers for future events
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._record_inquiry_sent_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent uuid;
  v_first boolean;
BEGIN
  BEGIN
    SELECT l.sales_agent_id INTO v_agent FROM public.leads l WHERE l.id = NEW.lead_id;

    v_first := NOT EXISTS (
      SELECT 1 FROM public.inquiry_workflow_events e
      WHERE e.inquiry_id = NEW.id
        AND e.event_type IN ('submitted', 'resubmitted')
    );

    INSERT INTO public.inquiry_workflow_events
      (inquiry_id, organization_id, event_type, occurred_at, actor_role, sales_agent_id)
    VALUES (
      NEW.id,
      NEW.organization_id,
      CASE WHEN v_first THEN 'submitted' ELSE 'resubmitted' END,
      NEW.sent_at,
      CASE WHEN (to_jsonb(NEW) ->> 'customer_submitted') = 'true' THEN 'customer' ELSE 'sales' END,
      v_agent
    )
    ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'inquiry_workflow_events: sent event skipped for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._record_inquiry_confirmation_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_agent uuid;
  v_role text;
BEGIN
  BEGIN
    SELECT li.organization_id, l.sales_agent_id
      INTO v_org, v_agent
    FROM public.lead_inquiries li
    LEFT JOIN public.leads l ON l.id = li.lead_id
    WHERE li.id = NEW.inquiry_id;

    IF TG_OP = 'INSERT' THEN
      v_role := COALESCE(to_jsonb(NEW) ->> 'submitted_by_role', 'operations');
      INSERT INTO public.inquiry_workflow_events
        (inquiry_id, organization_id, event_type, occurred_at, actor, actor_role, sales_agent_id, confirmation_id)
      VALUES (
        NEW.inquiry_id,
        v_org,
        CASE WHEN v_role = 'admin' THEN 'admin_calculated' ELSE 'operations_submitted' END,
        COALESCE(NEW.created_at, now()),
        NULLIF(btrim(NEW.submitted_by), ''),
        v_role,
        v_agent,
        NEW.id
      )
      ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;
    ELSIF NEW.status IN ('approved', 'rejected') THEN
      INSERT INTO public.inquiry_workflow_events
        (inquiry_id, organization_id, event_type, occurred_at, actor, actor_role, sales_agent_id, confirmation_id)
      VALUES (
        NEW.inquiry_id,
        v_org,
        NEW.status,
        COALESCE(NEW.reviewed_at, now()),
        NULLIF(btrim(NEW.reviewed_by), ''),
        'admin',
        v_agent,
        NEW.id
      )
      ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;
    END IF;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'inquiry_workflow_events: confirmation event skipped for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._record_inquiry_flag_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_agent uuid;
BEGIN
  BEGIN
    SELECT li.organization_id, l.sales_agent_id
      INTO v_org, v_agent
    FROM public.lead_inquiries li
    LEFT JOIN public.leads l ON l.id = li.lead_id
    WHERE li.id = NEW.inquiry_id;

    INSERT INTO public.inquiry_workflow_events
      (inquiry_id, organization_id, event_type, occurred_at, actor, actor_role, sales_agent_id)
    VALUES (
      NEW.inquiry_id,
      v_org,
      'flagged',
      COALESCE(NEW.created_at, now()),
      NULLIF(btrim(NEW.raised_by), ''),
      NEW.raised_by_role,
      v_agent
    )
    ON CONFLICT (inquiry_id, event_type, occurred_at) DO NOTHING;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'inquiry_workflow_events: flag event skipped for %: %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public._record_inquiry_sent_event() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._record_inquiry_confirmation_event() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._record_inquiry_flag_event() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_inquiry_events_sent_insert ON public.lead_inquiries;
CREATE TRIGGER trg_inquiry_events_sent_insert
  AFTER INSERT ON public.lead_inquiries
  FOR EACH ROW
  WHEN (NEW.sent_at IS NOT NULL)
  EXECUTE FUNCTION public._record_inquiry_sent_event();

DROP TRIGGER IF EXISTS trg_inquiry_events_sent_update ON public.lead_inquiries;
CREATE TRIGGER trg_inquiry_events_sent_update
  AFTER UPDATE OF sent_at ON public.lead_inquiries
  FOR EACH ROW
  WHEN (NEW.sent_at IS NOT NULL AND NEW.sent_at IS DISTINCT FROM OLD.sent_at)
  EXECUTE FUNCTION public._record_inquiry_sent_event();

DROP TRIGGER IF EXISTS trg_inquiry_events_confirmation_insert ON public.inquiry_confirmations;
CREATE TRIGGER trg_inquiry_events_confirmation_insert
  AFTER INSERT ON public.inquiry_confirmations
  FOR EACH ROW
  EXECUTE FUNCTION public._record_inquiry_confirmation_event();

DROP TRIGGER IF EXISTS trg_inquiry_events_confirmation_decision ON public.inquiry_confirmations;
CREATE TRIGGER trg_inquiry_events_confirmation_decision
  AFTER UPDATE OF status ON public.inquiry_confirmations
  FOR EACH ROW
  WHEN (NEW.status IS DISTINCT FROM OLD.status)
  EXECUTE FUNCTION public._record_inquiry_confirmation_event();

DROP TRIGGER IF EXISTS trg_inquiry_events_flag_insert ON public.inquiry_flags;
CREATE TRIGGER trg_inquiry_events_flag_insert
  AFTER INSERT ON public.inquiry_flags
  FOR EACH ROW
  EXECUTE FUNCTION public._record_inquiry_flag_event();

NOTIFY pgrst, 'reload schema';
