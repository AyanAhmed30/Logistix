-- =====================================================
-- Accounting Phase 8/9 — Reporting support, Automation, Audit
-- Idempotent.
-- =====================================================

-- Email templates (Odoo-style reusable)
CREATE TABLE IF NOT EXISTS public.accounting_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_key TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_email_templates_key_check
    CHECK (template_key IN (
      'invoice_sent',
      'payment_reminder',
      'overdue_reminder',
      'credit_note',
      'refund'
    ))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_email_templates_org_key
  ON public.accounting_email_templates (organization_id, template_key)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_email_templates_system_key
  ON public.accounting_email_templates (template_key)
  WHERE organization_id IS NULL;

-- Payment / overdue reminders
CREATE TABLE IF NOT EXISTS public.accounting_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES public.accounting_customer_invoices(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  reminder_type TEXT NOT NULL
    CHECK (reminder_type IN ('payment', 'overdue')),
  channel TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email', 'activity')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'sent', 'cancelled', 'failed')),
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  summary TEXT,
  template_key TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_reminders_invoice
  ON public.accounting_reminders (invoice_id, reminder_type, status);

CREATE INDEX IF NOT EXISTS idx_accounting_reminders_due
  ON public.accounting_reminders (organization_id, due_at)
  WHERE status = 'scheduled';

-- Prevent duplicate scheduled reminders of same type for an invoice
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_reminders_open_unique
  ON public.accounting_reminders (invoice_id, reminder_type)
  WHERE status = 'scheduled';

-- Accounting activities (invoice / customer follow-ups)
CREATE TABLE IF NOT EXISTS public.accounting_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES public.accounting_customer_invoices(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL DEFAULT 'follow_up'
    CHECK (activity_type IN (
      'follow_up',
      'call',
      'send_reminder',
      'verify_payment',
      'todo'
    )),
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'done', 'cancelled')),
  due_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  assigned_to TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_activities_invoice
  ON public.accounting_activities (invoice_id, due_at);

CREATE INDEX IF NOT EXISTS idx_accounting_activities_contact
  ON public.accounting_activities (contact_id, due_at);

CREATE INDEX IF NOT EXISTS idx_accounting_activities_org_status
  ON public.accounting_activities (organization_id, status, due_at);

-- Immutable accounting audit log (never delete in app)
CREATE TABLE IF NOT EXISTS public.accounting_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  performed_by TEXT,
  previous_value JSONB,
  new_value JSONB,
  details JSONB,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_audit_logs_org_time
  ON public.accounting_audit_logs (organization_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_audit_logs_entity
  ON public.accounting_audit_logs (entity_type, entity_id, performed_at DESC);

-- Seed system email templates (org_id NULL)
INSERT INTO public.accounting_email_templates (organization_id, template_key, name, subject, body, is_active)
SELECT NULL, v.template_key, v.name, v.subject, v.body, true
FROM (VALUES
  (
    'invoice_sent',
    'Invoice Sent',
    'Invoice {{invoice_number}} from {{company_name}}',
    E'Dear {{customer_name}},\n\nPlease find invoice {{invoice_number}} for {{total_amount}}.\nDue date: {{due_date}}.\n\nThank you,\n{{company_name}}'
  ),
  (
    'payment_reminder',
    'Payment Reminder',
    'Payment reminder for invoice {{invoice_number}}',
    E'Dear {{customer_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{outstanding_amount}} is due on {{due_date}}.\n\nThank you,\n{{company_name}}'
  ),
  (
    'overdue_reminder',
    'Overdue Reminder',
    'Overdue invoice {{invoice_number}}',
    E'Dear {{customer_name}},\n\nInvoice {{invoice_number}} for {{outstanding_amount}} is overdue (due {{due_date}}).\nPlease arrange payment at your earliest convenience.\n\nThank you,\n{{company_name}}'
  ),
  (
    'credit_note',
    'Credit Note',
    'Credit note {{credit_note_number}} from {{company_name}}',
    E'Dear {{customer_name}},\n\nPlease find credit note {{credit_note_number}} referencing invoice {{invoice_number}} for {{total_amount}}.\n\nThank you,\n{{company_name}}'
  ),
  (
    'refund',
    'Refund Notification',
    'Refund processed for {{invoice_number}}',
    E'Dear {{customer_name}},\n\nA refund of {{refund_amount}} has been processed for invoice {{invoice_number}}.\n\nThank you,\n{{company_name}}'
  )
) AS v(template_key, name, subject, body)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_email_templates t
  WHERE t.organization_id IS NULL AND t.template_key = v.template_key
);

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
