-- =====================================================
-- Accounting Vendors Module — Vendor Bills / Refunds / Payments
-- Contacts-based AP (vendor_rank), mirrors customer invoices.
-- Idempotent.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.accounting_vendor_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  bill_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled', 'paid')),
  payment_state TEXT NOT NULL DEFAULT 'not_paid'
    CHECK (payment_state IN ('not_paid', 'partial', 'paid', 'overdue')),
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL DEFAULT '',
  vendor_lead_id TEXT,
  reference TEXT,
  payment_terms TEXT DEFAULT 'Immediate',
  bill_date DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date DATE,
  billing_address TEXT,
  contact_person_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  vendor_notes TEXT,
  untaxed_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_paid NUMERIC(14, 2) NOT NULL DEFAULT 0,
  amount_residual NUMERIC(14, 2),
  refund_status TEXT DEFAULT 'none'
    CHECK (refund_status IS NULL OR refund_status IN ('none', 'partial', 'refunded')),
  posted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_vendor_bills_org_number
  ON public.accounting_vendor_bills (organization_id, bill_number);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_bills_org
  ON public.accounting_vendor_bills (organization_id);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_bills_contact
  ON public.accounting_vendor_bills (contact_id);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_bills_status
  ON public.accounting_vendor_bills (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_bills_date
  ON public.accounting_vendor_bills (bill_date DESC);

UPDATE public.accounting_vendor_bills
SET amount_residual = COALESCE(total_amount, 0) - COALESCE(amount_paid, 0)
WHERE amount_residual IS NULL;

CREATE TABLE IF NOT EXISTS public.accounting_vendor_bill_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.accounting_vendor_bills(id) ON DELETE CASCADE,
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

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_bill_lines_bill
  ON public.accounting_vendor_bill_lines (bill_id, sequence);

CREATE TABLE IF NOT EXISTS public.accounting_vendor_bill_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'BILL',
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_vendor_bill_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.accounting_vendor_bills(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  performed_by TEXT,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_bill_logs_bill
  ON public.accounting_vendor_bill_logs (bill_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS public.accounting_vendor_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  bill_id UUID NOT NULL REFERENCES public.accounting_vendor_bills(id) ON DELETE CASCADE,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer'
    CHECK (payment_method IN ('cash', 'bank_transfer', 'cheque')),
  reference TEXT,
  notes TEXT,
  paid_by TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_payments_bill
  ON public.accounting_vendor_payments (bill_id, payment_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_payments_org
  ON public.accounting_vendor_payments (organization_id);

CREATE TABLE IF NOT EXISTS public.accounting_vendor_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  refund_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  bill_id UUID REFERENCES public.accounting_vendor_bills(id) ON DELETE SET NULL,
  bill_number TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  vendor_name TEXT NOT NULL DEFAULT '',
  vendor_lead_id TEXT,
  reason TEXT,
  refund_type TEXT NOT NULL DEFAULT 'full'
    CHECK (refund_type IN ('full', 'partial', 'price_adjustment', 'product_return', 'vendor_credit')),
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  billing_address TEXT,
  contact_person_name TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  vendor_notes TEXT,
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_vendor_refunds_org_number
  ON public.accounting_vendor_refunds (organization_id, refund_number);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_refunds_contact
  ON public.accounting_vendor_refunds (contact_id);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_refunds_bill
  ON public.accounting_vendor_refunds (bill_id);

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_refunds_org_status
  ON public.accounting_vendor_refunds (organization_id, status);

CREATE TABLE IF NOT EXISTS public.accounting_vendor_refund_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  refund_id UUID NOT NULL REFERENCES public.accounting_vendor_refunds(id) ON DELETE CASCADE,
  bill_line_id UUID,
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

CREATE INDEX IF NOT EXISTS idx_accounting_vendor_refund_lines_refund
  ON public.accounting_vendor_refund_lines (refund_id, sequence);

CREATE TABLE IF NOT EXISTS public.accounting_vendor_refund_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'RREF',
  next_number INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
