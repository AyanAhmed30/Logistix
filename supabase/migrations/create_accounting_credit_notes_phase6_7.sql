-- =====================================================
-- Accounting Phase 6/7 — Credit Notes & Refunds
-- Idempotent.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.accounting_credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  credit_note_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  invoice_id UUID REFERENCES public.accounting_customer_invoices(id) ON DELETE SET NULL,
  invoice_number TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL DEFAULT '',
  customer_lead_id TEXT,
  reason TEXT,
  refund_type TEXT NOT NULL DEFAULT 'full'
    CHECK (refund_type IN ('full', 'partial')),
  salesperson_name TEXT,
  credit_note_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billing_address TEXT,
  shipping_address TEXT,
  contact_person_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  customer_notes TEXT,
  untaxed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_refunded NUMERIC(14, 2) NOT NULL DEFAULT 0,
  posted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_credit_notes_org_number
  ON public.accounting_credit_notes (organization_id, credit_note_number);

CREATE INDEX IF NOT EXISTS idx_accounting_credit_notes_contact
  ON public.accounting_credit_notes (contact_id);

CREATE INDEX IF NOT EXISTS idx_accounting_credit_notes_invoice
  ON public.accounting_credit_notes (invoice_id);

CREATE INDEX IF NOT EXISTS idx_accounting_credit_notes_org_status
  ON public.accounting_credit_notes (organization_id, status);

CREATE TABLE IF NOT EXISTS public.accounting_credit_note_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  credit_note_id UUID NOT NULL REFERENCES public.accounting_credit_notes(id) ON DELETE CASCADE,
  invoice_line_id UUID,
  sequence INTEGER NOT NULL DEFAULT 10,
  product_name TEXT NOT NULL DEFAULT '',
  description TEXT,
  quantity NUMERIC(12, 2) NOT NULL DEFAULT 1,
  uom TEXT NOT NULL DEFAULT 'Units',
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  discount NUMERIC(8, 2) NOT NULL DEFAULT 0,
  taxes NUMERIC(8, 2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_credit_note_lines_cn
  ON public.accounting_credit_note_lines (credit_note_id, sequence);

CREATE TABLE IF NOT EXISTS public.accounting_credit_note_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'RINV',
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  invoice_id UUID REFERENCES public.accounting_customer_invoices(id) ON DELETE SET NULL,
  credit_note_id UUID REFERENCES public.accounting_credit_notes(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  refund_type TEXT NOT NULL DEFAULT 'full'
    CHECK (refund_type IN ('full', 'partial', 'cash')),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque')),
  reference TEXT,
  notes TEXT,
  refunded_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_refunds_invoice
  ON public.accounting_refunds (invoice_id, refund_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_refunds_credit_note
  ON public.accounting_refunds (credit_note_id);

CREATE INDEX IF NOT EXISTS idx_accounting_refunds_contact
  ON public.accounting_refunds (contact_id);

CREATE INDEX IF NOT EXISTS idx_accounting_refunds_org
  ON public.accounting_refunds (organization_id);

-- Mark invoices that were fully refunded (keep history)
ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT 'none';

ALTER TABLE public.accounting_customer_invoices
  DROP CONSTRAINT IF EXISTS accounting_customer_invoices_refund_status_check;

ALTER TABLE public.accounting_customer_invoices
  ADD CONSTRAINT accounting_customer_invoices_refund_status_check
  CHECK (refund_status IS NULL OR refund_status IN ('none', 'partial', 'refunded'));

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
