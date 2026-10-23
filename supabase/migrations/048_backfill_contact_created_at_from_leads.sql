-- =====================================================
-- Fix Contacts "Added" dates: restore original lead
-- created_at onto contacts (migration / merge may have
-- left batch timestamps). Does not change lead_id or
-- ownership. Safe to re-run.
-- =====================================================

-- 1) Via contacts.legacy_lead_id → leads.id
UPDATE public.contacts c
SET
  created_at = l.created_at,
  updated_at = COALESCE(c.updated_at, l.updated_at, l.created_at, c.created_at)
FROM public.leads l
WHERE c.legacy_lead_id = l.id
  AND l.created_at IS NOT NULL
  AND (
    c.created_at IS NULL
    OR c.created_at > l.created_at
  );

-- 2) Via leads.contact_id → contacts.id (when legacy_lead_id missing)
UPDATE public.contacts c
SET
  created_at = l.created_at,
  updated_at = COALESCE(c.updated_at, l.updated_at, l.created_at, c.created_at)
FROM public.leads l
WHERE l.contact_id = c.id
  AND l.created_at IS NOT NULL
  AND (
    c.created_at IS NULL
    OR c.created_at > l.created_at
  )
  AND (
    c.legacy_lead_id IS NULL
    OR c.legacy_lead_id = l.id
  );

-- Prefer the earliest lead linked to each contact
UPDATE public.contacts c
SET created_at = sub.earliest_lead_at
FROM (
  SELECT
    l.contact_id AS contact_id,
    MIN(l.created_at) AS earliest_lead_at
  FROM public.leads l
  WHERE l.contact_id IS NOT NULL
    AND l.created_at IS NOT NULL
  GROUP BY l.contact_id
) sub
WHERE c.id = sub.contact_id
  AND (
    c.created_at IS NULL
    OR c.created_at > sub.earliest_lead_at
  );

NOTIFY pgrst, 'reload schema';
