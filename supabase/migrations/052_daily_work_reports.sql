-- STEP 052 — Daily work reports (Sales and Operations accountability)
-- New tables only; no existing table is changed.
--
-- Counts the system can prove are stored in system_counts when a report is
-- submitted. Numbers the system cannot verify (WhatsApp messages, calls) live in
-- self_reported and must be labelled that way in the UI.
--
-- A submitted report is never overwritten: every later change first copies the
-- old version into daily_work_report_revisions, and it cannot be deleted.
--
-- The app has its own login, so the database cannot see who the user is. Access
-- rules live in the server actions; these tables are closed to everything except
-- the service role, and attachments use a private bucket with signed URLs.
-- Idempotent. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Settings: one default row (organization_id NULL) plus optional per-org rows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_report_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'Asia/Karachi',
  deadline_local time NOT NULL DEFAULT '19:00',
  -- ISO weekdays, 1 = Monday ... 7 = Sunday
  working_days smallint[] NOT NULL DEFAULT '{1,2,3,4,5,6}',
  inquiry_pending_alert_hours integer NOT NULL DEFAULT 24
    CHECK (inquiry_pending_alert_hours > 0),
  updated_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_report_settings_org
  ON public.daily_report_settings (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_report_settings_default
  ON public.daily_report_settings ((organization_id IS NULL))
  WHERE organization_id IS NULL;

INSERT INTO public.daily_report_settings (organization_id)
SELECT NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.daily_report_settings WHERE organization_id IS NULL
);

-- ---------------------------------------------------------------------------
-- Reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_work_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable: legacy Operations logins have no organization on their session.
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  department text NOT NULL CHECK (department IN ('sales', 'operations')),
  employee_username text NOT NULL,
  employee_name text,
  app_user_id uuid REFERENCES public.app_users(id) ON DELETE SET NULL,
  sales_agent_id uuid REFERENCES public.sales_agents(id) ON DELETE SET NULL,
  operations_user_id uuid REFERENCES public.operations_users(id) ON DELETE SET NULL,
  report_date date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'submitted')),
  work_summary text NOT NULL DEFAULT '',
  achievements text NOT NULL DEFAULT '',
  pending_tasks text NOT NULL DEFAULT '',
  issues_summary text NOT NULL DEFAULT '',
  tomorrow_plan text NOT NULL DEFAULT '',
  system_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  self_reported jsonb NOT NULL DEFAULT '{}'::jsonb,
  deadline_at timestamptz,
  submitted_at timestamptz,
  is_late boolean NOT NULL DEFAULT false,
  revision_no integer NOT NULL DEFAULT 0,
  reopened_at timestamptz,
  reopened_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT daily_work_reports_submitted_has_time
    CHECK (status <> 'submitted' OR submitted_at IS NOT NULL)
);

-- One report per person, department, organization and day.
CREATE UNIQUE INDEX IF NOT EXISTS uq_daily_work_reports_one_per_day
  ON public.daily_work_reports (
    lower(employee_username),
    department,
    COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid),
    report_date
  );

CREATE INDEX IF NOT EXISTS idx_daily_work_reports_org_date
  ON public.daily_work_reports (organization_id, report_date DESC, department);

CREATE INDEX IF NOT EXISTS idx_daily_work_reports_employee_date
  ON public.daily_work_reports (lower(employee_username), report_date DESC);

-- ---------------------------------------------------------------------------
-- Issues raised in a report
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_work_report_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_work_reports(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  inquiry_id uuid REFERENCES public.lead_inquiries(id) ON DELETE SET NULL,
  description text NOT NULL,
  delay_reason text,
  action_taken text,
  assistance_needed text,
  follow_up_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_work_report_issues_report
  ON public.daily_work_report_issues (report_id);

CREATE INDEX IF NOT EXISTS idx_daily_work_report_issues_contact
  ON public.daily_work_report_issues (contact_id)
  WHERE contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_daily_work_report_issues_inquiry
  ON public.daily_work_report_issues (inquiry_id)
  WHERE inquiry_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Attachments (files live in the private daily-report-attachments bucket)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_work_report_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_work_reports(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_work_report_attachments_report
  ON public.daily_work_report_attachments (report_id);

-- ---------------------------------------------------------------------------
-- Admin comments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_work_report_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_work_reports(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (btrim(body) <> ''),
  author text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_work_report_comments_report
  ON public.daily_work_report_comments (report_id, created_at);

-- ---------------------------------------------------------------------------
-- Revision history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_work_report_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_work_reports(id) ON DELETE CASCADE,
  revision_no integer NOT NULL,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, revision_no)
);

CREATE OR REPLACE FUNCTION public._daily_work_report_before_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF OLD.status = 'submitted' THEN
    INSERT INTO public.daily_work_report_revisions (report_id, revision_no, snapshot)
    VALUES (OLD.id, OLD.revision_no, to_jsonb(OLD))
    ON CONFLICT (report_id, revision_no) DO NOTHING;
    NEW.revision_no := OLD.revision_no + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public._daily_work_report_block_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'Submitted daily reports cannot be deleted';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public._daily_work_report_before_update() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public._daily_work_report_block_delete() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS trg_daily_work_report_before_update ON public.daily_work_reports;
CREATE TRIGGER trg_daily_work_report_before_update
  BEFORE UPDATE ON public.daily_work_reports
  FOR EACH ROW
  EXECUTE FUNCTION public._daily_work_report_before_update();

DROP TRIGGER IF EXISTS trg_daily_work_report_block_delete ON public.daily_work_reports;
CREATE TRIGGER trg_daily_work_report_block_delete
  BEFORE DELETE ON public.daily_work_reports
  FOR EACH ROW
  EXECUTE FUNCTION public._daily_work_report_block_delete();

-- ---------------------------------------------------------------------------
-- Access: service role only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'daily_report_settings',
    'daily_work_reports',
    'daily_work_report_issues',
    'daily_work_report_attachments',
    'daily_work_report_comments',
    'daily_work_report_revisions'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'Service role only'
    ) THEN
      EXECUTE format(
        'CREATE POLICY "Service role only" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Private attachment bucket. No storage policies are added, so only the service
-- role can reach these files; users get short-lived signed URLs from the server.
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'daily-report-attachments',
  'daily-report-attachments',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
