-- =====================================================
-- Sales Phase 9 & 10 — Automation, Security & Audit
-- Idempotent. Safe to re-run.
-- =====================================================

-- Audit: updated_by on quotations
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- Expiration automation metadata
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

-- Status: add expired
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_status_check'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations DROP CONSTRAINT quotations_status_check;
  END IF;
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_status_check'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_status_check
      CHECK (status IN (
        'quotation',
        'quotation_sent',
        'customer_review',
        'expired',
        'sales_order',
        'cancelled'
      ));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Org-scoped quotation number sequences (QT00001…)
CREATE TABLE IF NOT EXISTS public.sales_number_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'QT',
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Reusable quotation email templates (send service can stay placeholder)
CREATE TABLE IF NOT EXISTS public.sales_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_email_templates_key_unique UNIQUE (organization_id, template_key)
);

CREATE INDEX IF NOT EXISTS idx_sales_email_templates_org
  ON public.sales_email_templates(organization_id);

-- Reminder / follow-up scheduling architecture (email + in-app later)
CREATE TABLE IF NOT EXISTS public.sales_quotation_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  reminder_type TEXT NOT NULL CHECK (
    reminder_type IN ('expiration', 'follow_up', 'email', 'call', 'meeting')
  ),
  due_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'sent', 'done', 'cancelled')
  ),
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (
    channel IN ('in_app', 'email', 'both')
  ),
  summary TEXT,
  crm_activity_id UUID,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_quotation_reminders_due
  ON public.sales_quotation_reminders(status, due_at);

CREATE INDEX IF NOT EXISTS idx_sales_quotation_reminders_quotation
  ON public.sales_quotation_reminders(quotation_id);

-- Seed global default templates (organization_id NULL = system defaults)
INSERT INTO public.sales_email_templates (organization_id, template_key, name, subject, body)
SELECT NULL, v.template_key, v.name, v.subject, v.body
FROM (VALUES
  (
    'send_quotation',
    'Send Quotation',
    'Quotation {{quotation_number}} from {{company_name}}',
    E'Dear {{customer_name}},\n\nPlease find quotation {{quotation_number}} for your review.\n\nTotal: {{total_amount}}\nValid until: {{expiration_date}}\n\nBest regards,\n{{salesperson_name}}\n{{company_name}}'
  ),
  (
    'reminder',
    'Quotation Reminder',
    'Reminder: Quotation {{quotation_number}} expires soon',
    E'Dear {{customer_name}},\n\nThis is a friendly reminder that quotation {{quotation_number}} expires on {{expiration_date}}.\n\nPlease let us know if you have any questions.\n\nBest regards,\n{{salesperson_name}}\n{{company_name}}'
  ),
  (
    'follow_up',
    'Quotation Follow-up',
    'Follow-up on Quotation {{quotation_number}}',
    E'Dear {{customer_name}},\n\nWe wanted to follow up on quotation {{quotation_number}}.\n\nWould you like to schedule a call or meeting to discuss next steps?\n\nBest regards,\n{{salesperson_name}}\n{{company_name}}'
  )
) AS v(template_key, name, subject, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_email_templates t
  WHERE t.organization_id IS NULL AND t.template_key = v.template_key
);

ALTER TABLE public.sales_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_quotation_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_number_sequences ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
