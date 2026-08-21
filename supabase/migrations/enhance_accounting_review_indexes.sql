-- Review module performance indexes (Phase 1 + Phase 2)
-- Supports server-side journal item filtering by entry date + org via parent entry.

CREATE INDEX IF NOT EXISTS idx_accounting_je_org_status_date
  ON public.accounting_journal_entries (organization_id, status, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_je_lines_account
  ON public.accounting_journal_entry_lines (account_id, journal_entry_id);

CREATE INDEX IF NOT EXISTS idx_accounting_je_logs_org_created
  ON public.accounting_journal_entry_logs (organization_id, created_at DESC);

-- Phase 2 — Loans Analysis, Invoices To Be Issued, Working Files
CREATE INDEX IF NOT EXISTS idx_accounting_loans_org_status_start
  ON public.accounting_loans (organization_id, status, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_review_invoiceable
  ON public.quotations (organization_id, status, invoice_status, quotation_date DESC)
  WHERE status = 'sales_order';

CREATE INDEX IF NOT EXISTS idx_accounting_tax_returns_org_status_created
  ON public.accounting_tax_returns (organization_id, status, created_at DESC);

NOTIFY pgrst, 'reload schema';
