-- =====================================================
-- Accounting Phase 10 — Search / list performance indexes
-- Idempotent.
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_org_number
  ON public.accounting_customer_invoices (organization_id, invoice_number);

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_org_customer_name
  ON public.accounting_customer_invoices (organization_id, customer_name);

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_org_lead_id
  ON public.accounting_customer_invoices (organization_id, customer_lead_id);

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_org_so_number
  ON public.accounting_customer_invoices (organization_id, sales_order_number);

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_org_date
  ON public.accounting_customer_invoices (organization_id, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_org_status_date
  ON public.accounting_customer_invoices (organization_id, status, invoice_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_payments_invoice_date
  ON public.accounting_invoice_payments (invoice_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_org_customer_rank_name
  ON public.contacts (organization_id, name)
  WHERE customer_rank > 0 AND parent_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_lead_id_formatted
  ON public.contacts (lead_id_formatted)
  WHERE lead_id_formatted IS NOT NULL;

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
