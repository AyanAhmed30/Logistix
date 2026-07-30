-- =====================================================
-- Force Odoo-style S##### quotation numbers.
-- Converts existing QT##### → S##### and sequence prefix.
-- Idempotent.
-- =====================================================

-- 1) Sequences always use S
ALTER TABLE public.sales_number_sequences
  ALTER COLUMN prefix SET DEFAULT 'S';

UPDATE public.sales_number_sequences
SET prefix = 'S', updated_at = now()
WHERE prefix IS DISTINCT FROM 'S';

-- 2) Rewrite existing quotation numbers QT##### → S#####
--    (only when the target S number is not already taken)
UPDATE public.quotations q
SET quotation_number = 'S' || substring(q.quotation_number from 3),
    updated_at = now()
WHERE q.quotation_number ~ '^QT[0-9]+$'
  AND NOT EXISTS (
    SELECT 1
    FROM public.quotations x
    WHERE x.quotation_number = 'S' || substring(q.quotation_number from 3)
  );

-- 3) Advance sequence past the highest S/QT numeric suffix per org
UPDATE public.sales_number_sequences s
SET next_number = GREATEST(
  COALESCE(s.next_number, 1),
  COALESCE((
    SELECT MAX(
      CASE
        WHEN q.quotation_number ~ '^[Ss][0-9]+$'
          THEN NULLIF(regexp_replace(q.quotation_number, '[^0-9]', '', 'g'), '')::int
        WHEN q.quotation_number ~ '^[Qq][Tt][0-9]+$'
          THEN NULLIF(regexp_replace(q.quotation_number, '[^0-9]', '', 'g'), '')::int
        ELSE 0
      END
    ) + 1
    FROM public.quotations q
    WHERE q.organization_id = s.organization_id
  ), 1)
),
updated_at = now();

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');
