-- =====================================================
-- Accounting — Journal Entries foundation (Odoo-style)
-- Org-scoped entries linked to invoices / payments / CNs / bills.
-- Idempotent. Reuses public.journals + public.chart_of_accounts.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.accounting_journal_entry_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'JE',
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.accounting_journal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  entry_number TEXT NOT NULL,
  journal_id UUID NOT NULL REFERENCES public.journals(id) ON DELETE RESTRICT,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reference TEXT NOT NULL DEFAULT '',
  partner_name TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  currency TEXT NOT NULL DEFAULT 'PKR',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  total_debit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_credit NUMERIC(14, 2) NOT NULL DEFAULT 0,
  source_type TEXT
    CHECK (
      source_type IS NULL
      OR source_type IN (
        'manual',
        'customer_invoice',
        'customer_payment',
        'credit_note',
        'vendor_bill',
        'vendor_payment'
      )
    ),
  source_id UUID,
  source_number TEXT,
  is_manual BOOLEAN NOT NULL DEFAULT true,
  posted_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_je_org_number
  ON public.accounting_journal_entries (organization_id, entry_number);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_je_source_unique
  ON public.accounting_journal_entries (organization_id, source_type, source_id)
  WHERE source_id IS NOT NULL AND source_type IS NOT NULL AND source_type <> 'manual';

CREATE INDEX IF NOT EXISTS idx_accounting_je_org_date
  ON public.accounting_journal_entries (organization_id, entry_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_je_status
  ON public.accounting_journal_entries (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_je_journal
  ON public.accounting_journal_entries (journal_id);

CREATE TABLE IF NOT EXISTS public.accounting_journal_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL
    REFERENCES public.accounting_journal_entries(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 10,
  account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE RESTRICT,
  label TEXT NOT NULL DEFAULT '',
  partner_name TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  debit NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  analytic_account TEXT,
  tax_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT accounting_je_lines_one_side CHECK (
    NOT (debit > 0 AND credit > 0)
  )
);

CREATE INDEX IF NOT EXISTS idx_accounting_je_lines_entry
  ON public.accounting_journal_entry_lines (journal_entry_id, sequence);

CREATE TABLE IF NOT EXISTS public.accounting_journal_entry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  journal_entry_id UUID NOT NULL
    REFERENCES public.accounting_journal_entries(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by TEXT,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  previous_status TEXT,
  new_status TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_je_logs_entry
  ON public.accounting_journal_entry_logs (journal_entry_id, created_at DESC);

-- Link columns on source documents (idempotent)
ALTER TABLE public.accounting_customer_invoices
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_invoice_payments
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_credit_notes
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounting_vendor_bills'
  ) THEN
    ALTER TABLE public.accounting_vendor_bills
      ADD COLUMN IF NOT EXISTS journal_entry_id UUID
        REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.accounting_journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entry_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_journal_entry_sequences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_journal_entries;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_journal_entry_lines;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_journal_entry_logs;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_journal_entry_sequences;

CREATE POLICY "Full access for service role"
ON public.accounting_journal_entries FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_journal_entry_lines FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_journal_entry_logs FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_journal_entry_sequences FOR ALL USING (true) WITH CHECK (true);
