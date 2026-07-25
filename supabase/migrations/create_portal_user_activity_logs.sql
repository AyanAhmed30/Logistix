-- Odoo-style audit trail for portal user profile changes

ALTER TABLE public.app_users ADD COLUMN IF NOT EXISTS phone TEXT;

CREATE TABLE IF NOT EXISTS public.portal_user_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.app_users (id) ON DELETE CASCADE,
  action_type TEXT NOT NULL DEFAULT 'field_changed',
  field_name TEXT,
  previous_value TEXT,
  new_value TEXT,
  performed_by TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portal_user_activity_logs_user
  ON public.portal_user_activity_logs (user_id, created_at DESC);

ALTER TABLE public.portal_user_activity_logs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'portal_user_activity_logs'
      AND policyname = 'Full access for service role'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Full access for service role"
      ON public.portal_user_activity_logs FOR ALL
      USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
