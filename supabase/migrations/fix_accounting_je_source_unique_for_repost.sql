-- Allow recreating automatic journal entries after cancel (Reset to Draft → Post again).
-- Previous unique index blocked a second active row for the same source forever.

DROP INDEX IF EXISTS public.idx_accounting_je_source_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_je_source_unique_active
  ON public.accounting_journal_entries (organization_id, source_type, source_id)
  WHERE source_id IS NOT NULL
    AND source_type IS NOT NULL
    AND source_type <> 'manual'
    AND status <> 'cancelled';
