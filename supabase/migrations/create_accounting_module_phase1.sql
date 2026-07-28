-- =====================================================
-- Accounting Phase 1 — Customer Invoices foundation
-- Odoo-inspired draft invoices linked to Sales Orders / Contacts.
-- Idempotent.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.accounting_customer_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled', 'paid')),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_lead_id TEXT,
  sales_order_id UUID REFERENCES public.quotations(id) ON DELETE SET NULL,
  sales_order_number TEXT,
  quotation_number TEXT,
  salesperson_id UUID,
  salesperson_name TEXT,
  payment_terms TEXT DEFAULT 'Immediate',
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  billing_address TEXT,
  shipping_address TEXT,
  contact_person_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  untaxed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_invoice_id UUID,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_customer_invoices_org_number
  ON public.accounting_customer_invoices (organization_id, invoice_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_customer_invoices_sales_order
  ON public.accounting_customer_invoices (sales_order_id)
  WHERE sales_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_customer_invoices_org
  ON public.accounting_customer_invoices (organization_id);

CREATE INDEX IF NOT EXISTS idx_accounting_customer_invoices_contact
  ON public.accounting_customer_invoices (contact_id);

CREATE INDEX IF NOT EXISTS idx_accounting_customer_invoices_status
  ON public.accounting_customer_invoices (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_customer_invoices_date
  ON public.accounting_customer_invoices (invoice_date DESC);

CREATE TABLE IF NOT EXISTS public.accounting_customer_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES public.accounting_customer_invoices(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 10,
  product_name TEXT NOT NULL DEFAULT '',
  description TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  uom TEXT NOT NULL DEFAULT 'Units',
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(8, 2) NOT NULL DEFAULT 0,
  taxes NUMERIC(8, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  sales_order_line_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_customer_invoice_lines_invoice
  ON public.accounting_customer_invoice_lines (invoice_id, sequence);

CREATE TABLE IF NOT EXISTS public.accounting_invoice_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'INV',
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link sales preview invoices to Accounting drafts when column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'sales_invoices'
  ) THEN
    -- finance_invoice_id already exists on sales_invoices from sales_to_invoice_phase
    NULL;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
