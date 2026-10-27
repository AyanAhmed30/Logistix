-- STEP 050 — Contacts / CRM pipeline list + search indexes
-- Supports server-side Contacts pagination (newest first, id tie-breaker) and
-- the existing ILIKE '%term%' search on name / company / email / phone /
-- mobile / Customer ID used by Contacts and the CRM pipeline contact lookup.
-- Indexes only — no data or behavior changes.
-- Idempotent. Safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- List paging: organization (admin / manager browse) and salesperson
-- (Own Documents browse) scopes, ordered created_at DESC, id DESC.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contacts_org_created_id
  ON public.contacts (organization_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_contacts_salesperson_created_id
  ON public.contacts (salesperson_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Substring search (ILIKE '%term%'). Every column in the OR filter needs a
-- trigram index for the planner to use a BitmapOr instead of a seq scan.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contacts_search_name_trgm
  ON public.contacts USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_search_company_name_trgm
  ON public.contacts USING gin (company_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_search_email_trgm
  ON public.contacts USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_search_phone_trgm
  ON public.contacts USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_search_mobile_trgm
  ON public.contacts USING gin (mobile gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contacts_search_lead_id_formatted_trgm
  ON public.contacts USING gin (lead_id_formatted gin_trgm_ops);

NOTIFY pgrst, 'reload schema';
