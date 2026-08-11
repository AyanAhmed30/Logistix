-- =====================================================
-- Align leads.source with canonical ERP channel values
-- CHECK: Meta | LinkedIn | WhatsApp | Others
--
-- Root cause of main CRM Send Inquiry failures:
-- crm_opportunities.source can be free-text / markers
-- (e.g. contact_auto from Contact→CRM automation).
-- Bridge lead inserts must NOT copy those into leads.source.
-- App fix: normalizeLeadSource() in CRM inquiry bridge.
--
-- This migration keeps both Supabase envs schema-identical:
-- 1) Normalize any existing invalid leads.source rows
-- 2) Re-assert leads_source_check
-- Idempotent. Preserves all lead rows.
-- =====================================================

UPDATE public.leads
SET source = CASE
  WHEN lower(btrim(COALESCE(source, ''))) IN ('meta', 'facebook', 'fb') THEN 'Meta'
  WHEN lower(btrim(COALESCE(source, ''))) IN ('linkedin', 'linked in') THEN 'LinkedIn'
  WHEN lower(btrim(COALESCE(source, ''))) IN ('whatsapp', 'wa') THEN 'WhatsApp'
  WHEN lower(btrim(COALESCE(source, ''))) IN (
    'others', 'other', 'manual', 'website', 'web', 'crm',
    'contact_auto', 'opportunity', ''
  ) THEN 'Others'
  WHEN source IN ('Meta', 'LinkedIn', 'WhatsApp', 'Others') THEN source
  ELSE 'Others'
END
WHERE source IS NULL
   OR btrim(source) = ''
   OR source NOT IN ('Meta', 'LinkedIn', 'WhatsApp', 'Others');

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_source_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_source_check
  CHECK (source IN ('Meta', 'LinkedIn', 'WhatsApp', 'Others'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.leads
    WHERE source IS NULL
       OR source NOT IN ('Meta', 'LinkedIn', 'WhatsApp', 'Others')
  ) THEN
    RAISE EXCEPTION 'leads.source still has values outside Meta|LinkedIn|WhatsApp|Others after normalization';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
