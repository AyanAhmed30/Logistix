-- Ensure every organization has the default CRM pipeline boards:
-- New, Qualified, Proposition, Won (+ Lost).
-- Safe / idempotent. Does not delete opportunities.

INSERT INTO public.crm_pipeline_stages (
  organization_id,
  name,
  sequence,
  is_won,
  is_lost,
  is_folded,
  updated_at
)
SELECT
  o.id,
  d.name,
  d.sequence,
  d.is_won,
  d.is_lost,
  false,
  NOW()
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('New', 10, false, false),
    ('Qualified', 20, false, false),
    ('Proposition', 30, false, false),
    ('Won', 40, true, false),
    ('Lost', 50, false, true)
) AS d(name, sequence, is_won, is_lost)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.crm_pipeline_stages s
  WHERE s.organization_id = o.id
    AND lower(s.name) = lower(d.name)
);

-- Backfill default_probability when column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'crm_pipeline_stages'
      AND column_name = 'default_probability'
  ) THEN
    UPDATE public.crm_pipeline_stages SET default_probability = 10
      WHERE lower(name) = 'new' AND (default_probability IS NULL OR default_probability = 0);
    UPDATE public.crm_pipeline_stages SET default_probability = 40
      WHERE lower(name) = 'qualified';
    UPDATE public.crm_pipeline_stages SET default_probability = 70
      WHERE lower(name) = 'proposition';
    UPDATE public.crm_pipeline_stages SET default_probability = 100
      WHERE lower(name) = 'won';
    UPDATE public.crm_pipeline_stages SET default_probability = 0
      WHERE lower(name) = 'lost';
  END IF;
END $$;
