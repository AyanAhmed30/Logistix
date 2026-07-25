-- =====================================================
-- Backfill organization (+ repair ownership) for legacy
-- Sales Agent → Contacts migration (Production-safe)
-- =====================================================
-- Context (diagnosed on Production):
--   - All legacy leads had organization_id NULL
--   - Migration created contacts with organization_id NULL
--   - Contacts UI filters STRICTLY by active organization_id
--     → NULL-org contacts are invisible
--   - Ownership (created_by / salesperson_id) is largely correct
--
-- This script:
--   1) Stamps NULL contacts.organization_id with the sole active org
--   2) Stamps NULL leads.organization_id the same way
--   3) Repairs missing salesperson_id / created_by from legacy leads
--   4) Does NOT delete or duplicate rows
--
-- Safe to re-run (only updates NULL / mismatched ownership gaps).
--
-- How to apply:
--   Run in Supabase SQL Editor on Production (New query → paste → Run).
-- =====================================================

DO $$
DECLARE
  org_count integer;
  target_org_id uuid;
  contacts_updated integer := 0;
  leads_updated integer := 0;
  salesperson_fixed integer := 0;
  created_by_fixed integer := 0;
BEGIN
  SELECT count(*) INTO org_count FROM public.organizations;

  IF org_count = 0 THEN
    RAISE EXCEPTION 'No organizations found. Create the company first, then re-run this script.';
  END IF;

  -- Prefer single active org; if multiple, use the oldest active row
  -- (Production currently has exactly one: Logistix Express).
  IF org_count = 1 THEN
    SELECT id INTO target_org_id
    FROM public.organizations
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1;
  ELSE
    SELECT id INTO target_org_id
    FROM public.organizations
    WHERE status = 'active' OR status IS NULL
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1;

    RAISE NOTICE
      'Multiple organizations exist (%). Using oldest active org: %',
      org_count,
      target_org_id;
  END IF;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve a target organization_id.';
  END IF;

  RAISE NOTICE 'Backfill target organization_id = %', target_org_id;

  -- ---------------------------------------------------
  -- 1) Contacts: stamp NULL organization_id
  -- ---------------------------------------------------
  UPDATE public.contacts
  SET organization_id = target_org_id
  WHERE organization_id IS NULL;

  GET DIAGNOSTICS contacts_updated = ROW_COUNT;
  RAISE NOTICE 'contacts.organization_id backfilled: % rows', contacts_updated;

  -- ---------------------------------------------------
  -- 2) Leads: stamp NULL organization_id (source of truth)
  -- ---------------------------------------------------
  UPDATE public.leads
  SET organization_id = target_org_id
  WHERE organization_id IS NULL;

  GET DIAGNOSTICS leads_updated = ROW_COUNT;
  RAISE NOTICE 'leads.organization_id backfilled: % rows', leads_updated;

  -- ---------------------------------------------------
  -- 3) Repair salesperson_id from legacy lead owner
  --    (only when contact salesperson is NULL)
  -- ---------------------------------------------------
  UPDATE public.contacts c
  SET salesperson_id = l.sales_agent_id
  FROM public.lead_to_contact_migrations m
  JOIN public.leads l ON l.id = m.lead_id
  WHERE c.id = m.contact_id
    AND c.salesperson_id IS NULL
    AND l.sales_agent_id IS NOT NULL;

  GET DIAGNOSTICS salesperson_fixed = ROW_COUNT;
  RAISE NOTICE 'contacts.salesperson_id repaired: % rows', salesperson_fixed;

  -- Also from legacy_lead_id when migration audit path missed
  UPDATE public.contacts c
  SET salesperson_id = l.sales_agent_id
  FROM public.leads l
  WHERE c.legacy_lead_id = l.id
    AND c.salesperson_id IS NULL
    AND l.sales_agent_id IS NOT NULL;

  -- ---------------------------------------------------
  -- 4) Repair blank created_by from sales_agents.username
  -- ---------------------------------------------------
  UPDATE public.contacts c
  SET created_by = sa.username
  FROM public.sales_agents sa
  WHERE c.salesperson_id = sa.id
    AND (c.created_by IS NULL OR btrim(c.created_by) = '')
    AND sa.username IS NOT NULL
    AND btrim(sa.username) <> '';

  GET DIAGNOSTICS created_by_fixed = ROW_COUNT;
  RAISE NOTICE 'contacts.created_by repaired: % rows', created_by_fixed;

  RAISE NOTICE
    'DONE — contacts_org=%, leads_org=%, salesperson_fixed=%, created_by_fixed=%',
    contacts_updated,
    leads_updated,
    salesperson_fixed,
    created_by_fixed;
END $$;

-- =====================================================
-- Verification (run after the DO block)
-- =====================================================

-- Org coverage should be ~0 NULL for migrated contacts
SELECT
  count(*) AS migrated_contacts,
  count(*) FILTER (WHERE organization_id IS NULL) AS still_null_org,
  count(*) FILTER (WHERE salesperson_id IS NULL) AS null_salesperson,
  count(*) FILTER (WHERE created_by IS NULL OR btrim(created_by) = '') AS null_created_by
FROM public.contacts
WHERE legacy_lead_id IS NOT NULL
   OR notes ILIKE '%Migrated from legacy%';

-- Per-owner counts (should match historical lead ownership)
SELECT
  COALESCE(c.created_by, sa.username, '(unknown)') AS owner,
  count(*) AS contacts
FROM public.contacts c
LEFT JOIN public.sales_agents sa ON sa.id = c.salesperson_id
WHERE c.organization_id IS NOT NULL
  AND (
    c.legacy_lead_id IS NOT NULL
    OR c.notes ILIKE '%Migrated from legacy%'
  )
GROUP BY 1
ORDER BY contacts DESC;

-- Compare lead counts vs contact counts per sales agent
SELECT
  sa.username,
  lead_counts.leads,
  contact_counts.contacts
FROM public.sales_agents sa
LEFT JOIN (
  SELECT sales_agent_id, count(*) AS leads
  FROM public.leads
  GROUP BY sales_agent_id
) lead_counts ON lead_counts.sales_agent_id = sa.id
LEFT JOIN (
  SELECT salesperson_id, count(*) AS contacts
  FROM public.contacts
  WHERE organization_id IS NOT NULL
    AND (
      legacy_lead_id IS NOT NULL
      OR notes ILIKE '%Migrated from legacy%'
      OR salesperson_id IS NOT NULL
    )
  GROUP BY salesperson_id
) contact_counts ON contact_counts.salesperson_id = sa.id
WHERE lead_counts.leads IS NOT NULL
ORDER BY lead_counts.leads DESC NULLS LAST;
