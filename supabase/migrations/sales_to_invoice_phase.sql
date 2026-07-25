-- =====================================================
-- Sales To Invoice — Odoo-style invoice_status + sales invoices
-- Idempotent. Finance posting remains a future phase.
-- =====================================================

-- Odoo invoice policy on the sales order (quotation confirmed as sales_order)
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS invoice_status TEXT NOT NULL DEFAULT 'no';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_invoice_status_check'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations DROP CONSTRAINT quotations_invoice_status_check;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'quotations_invoice_status_check'
      AND conrelid = 'public.quotations'::regclass
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_invoice_status_check
      CHECK (invoice_status IN ('no', 'to_invoice', 'invoiced'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Confirmed orders default to "To Invoice"
UPDATE public.quotations
SET invoice_status = 'to_invoice'
WHERE status = 'sales_order'
  AND (invoice_status IS NULL OR invoice_status = 'no');

-- Lightweight Sales invoices (preview / PDF) — ready for Finance link later
CREATE TABLE IF NOT EXISTS public.sales_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE RESTRICT,
  invoice_number TEXT NOT NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  contact_id UUID,
  invoice_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  payment_terms TEXT DEFAULT 'Immediate',
  notes TEXT,
  untaxed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  finance_invoice_id UUID,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sales_invoices_quotation_unique UNIQUE (quotation_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_org
  ON public.sales_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_sales_invoices_quotation
  ON public.sales_invoices(quotation_id);

CREATE TABLE IF NOT EXISTS public.sales_invoice_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_invoice_id UUID NOT NULL REFERENCES public.sales_invoices(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 10,
  product_name TEXT NOT NULL DEFAULT '',
  description TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  uom TEXT NOT NULL DEFAULT 'Units',
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(5, 2) NOT NULL DEFAULT 0,
  taxes NUMERIC(5, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quotation_line_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sales_invoice_lines_invoice
  ON public.sales_invoice_lines(sales_invoice_id);

-- Org-scoped invoice numbers
CREATE TABLE IF NOT EXISTS public.sales_invoice_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'INV',
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_invoice_sequences ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
