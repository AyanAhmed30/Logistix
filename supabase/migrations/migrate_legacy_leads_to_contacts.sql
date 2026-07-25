-- =====================================================
-- Migrate legacy Sales Agent Leads → Contacts
-- =====================================================
-- Safe, idempotent, zero data loss.
--
-- - Does NOT delete or mutate lead business fields
-- - Does NOT touch CRM opportunities, quotations, or sales orders
-- - Creates Contacts (or merges into matching Contacts by phone + org)
-- - Preserves salesperson, organization, creator, timestamps, source
--
-- How to apply:
--   Run in Supabase SQL Editor (New query → paste → Run).
--   Safe to re-run: already-migrated leads are skipped.
--
-- Optional re-run / stats:
--   SELECT * FROM public.migrate_legacy_leads_to_contacts();
--   SELECT * FROM public.legacy_leads_to_contacts_migration_stats();
-- =====================================================

-- -----------------------------------------------------
-- 0) Prerequisites
-- -----------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) THEN
    RAISE EXCEPTION 'public.leads table is required before running this migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contacts'
  ) THEN
    RAISE EXCEPTION 'public.contacts table is required before running this migration';
  END IF;
END $$;

-- Ensure phone normalizer exists (same rules as leads)
CREATE OR REPLACE FUNCTION public.normalize_lead_phone(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d text;
BEGIN
  d := regexp_replace(coalesce(trim(p_phone), ''), '[^0-9]', '', 'g');

  IF length(d) = 0 THEN
    RETURN NULL;
  END IF;

  IF left(d, 4) = '0092' THEN
    d := substring(d FROM 3);
  END IF;

  IF length(d) = 11 AND left(d, 1) = '0' THEN
    RETURN '92' || substring(d FROM 2);
  END IF;

  IF length(d) = 10 AND left(d, 1) = '3' THEN
    RETURN '92' || d;
  END IF;

  IF left(d, 2) = '92' THEN
    RETURN d;
  END IF;

  RETURN NULL;
END;
$$;

-- -----------------------------------------------------
-- 1) Tracking + metadata columns (idempotent)
-- -----------------------------------------------------
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS legacy_lead_id uuid;

-- Ensure lead columns the migrator reads are present (no-op if already applied)
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS lead_id_formatted text,
  ADD COLUMN IF NOT EXISTS created_by_sales_agent_id uuid,
  ADD COLUMN IF NOT EXISTS number_normalized text,
  ADD COLUMN IF NOT EXISTS organization_id uuid,
  ADD COLUMN IF NOT EXISTS contact_id uuid;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- Back-reference on leads already covered above; keep legacy FK block below
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_legacy_lead_id_fkey'
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_legacy_lead_id_fkey
      FOREIGN KEY (legacy_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'contacts_legacy_lead_id_key'
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_legacy_lead_id_key UNIQUE (legacy_lead_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_contact_id_fkey'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_contact_id_fkey
      FOREIGN KEY (contact_id) REFERENCES public.contacts(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_legacy_lead_id
  ON public.contacts (legacy_lead_id)
  WHERE legacy_lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_source
  ON public.contacts (source)
  WHERE source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_phone_normalized
  ON public.contacts (public.normalize_lead_phone(phone))
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_contact_id
  ON public.leads (contact_id)
  WHERE contact_id IS NOT NULL;

-- Migration audit (one row per lead → supports many leads → one contact merges)
CREATE TABLE IF NOT EXISTS public.lead_to_contact_migrations (
  lead_id uuid PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('created', 'merged')),
  migrated_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

CREATE INDEX IF NOT EXISTS idx_lead_to_contact_migrations_contact
  ON public.lead_to_contact_migrations (contact_id);

ALTER TABLE public.lead_to_contact_migrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lead_to_contact_migrations'
      AND policyname = 'Full access for service role'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "Full access for service role"
      ON public.lead_to_contact_migrations FOR ALL
      USING (true) WITH CHECK (true)
    $policy$;
  END IF;
END $$;

-- -----------------------------------------------------
-- 2) Seed tags used for source + legacy marker
-- -----------------------------------------------------
INSERT INTO public.contact_tags (name, color)
VALUES
  ('Legacy Lead', '#017e84'),
  ('Lead Source: Meta', '#1877F2'),
  ('Lead Source: LinkedIn', '#0A66C2'),
  ('Lead Source: WhatsApp', '#25D366'),
  ('Lead Source: Others', '#6B7280')
ON CONFLICT (name) DO NOTHING;

-- -----------------------------------------------------
-- 3) Stats helper
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.legacy_leads_to_contacts_migration_stats()
RETURNS TABLE (
  total_leads bigint,
  migrated_leads bigint,
  pending_leads bigint,
  contacts_created bigint,
  contacts_merged bigint,
  contacts_with_legacy_lead bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*)::bigint FROM public.leads) AS total_leads,
    (SELECT count(*)::bigint FROM public.lead_to_contact_migrations) AS migrated_leads,
    (
      SELECT count(*)::bigint
      FROM public.leads l
      WHERE NOT EXISTS (
        SELECT 1 FROM public.lead_to_contact_migrations m WHERE m.lead_id = l.id
      )
    ) AS pending_leads,
    (
      SELECT count(*)::bigint
      FROM public.lead_to_contact_migrations
      WHERE action = 'created'
    ) AS contacts_created,
    (
      SELECT count(*)::bigint
      FROM public.lead_to_contact_migrations
      WHERE action = 'merged'
    ) AS contacts_merged,
    (
      SELECT count(*)::bigint
      FROM public.contacts
      WHERE legacy_lead_id IS NOT NULL
    ) AS contacts_with_legacy_lead;
$$;

REVOKE ALL ON FUNCTION public.legacy_leads_to_contacts_migration_stats() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.legacy_leads_to_contacts_migration_stats() TO service_role;

-- -----------------------------------------------------
-- 4) Main migration function (idempotent, batch-safe)
-- -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_legacy_leads_to_contacts()
RETURNS TABLE (
  created_count integer,
  merged_count integer,
  skipped_count integer,
  error_count integer,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_org_id uuid;
  v_sole_org_id uuid;
  v_creator_username text;
  v_owner_agent_id uuid;
  v_phone_norm text;
  v_phone_display text;
  v_contact_id uuid;
  v_existing_contact_id uuid;
  v_action text;
  v_name text;
  v_migration_note text;
  v_tag_legacy uuid;
  v_tag_source uuid;
  v_source text;
  v_has_app_user_id boolean;
  v_has_default_org boolean;
  v_default_org_col text;
  v_created int := 0;
  v_merged int := 0;
  v_skipped int := 0;
  v_errors int := 0;
  v_error_detail text := '';
BEGIN
  SELECT count(*)::int INTO v_skipped
  FROM public.lead_to_contact_migrations;

  -- Backfill number_normalized when values are empty
  UPDATE public.leads
  SET number_normalized = public.normalize_lead_phone(number)
  WHERE number_normalized IS NULL
     OR number_normalized <> public.normalize_lead_phone(number);

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'sales_agents' AND column_name = 'app_user_id'
  ) INTO v_has_app_user_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users'
      AND column_name = 'default_organization'
  ) THEN
    v_has_default_org := true;
    v_default_org_col := 'default_organization';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'app_users'
      AND column_name = 'default_organization_id'
  ) THEN
    v_has_default_org := true;
    v_default_org_col := 'default_organization_id';
  ELSE
    v_has_default_org := false;
    v_default_org_col := NULL;
  END IF;

  SELECT id INTO v_sole_org_id
  FROM public.organizations
  WHERE status = 'active' OR status IS NULL
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1;

  IF v_sole_org_id IS NULL THEN
    SELECT id INTO v_sole_org_id
    FROM public.organizations
    ORDER BY created_at ASC NULLS LAST, id ASC
    LIMIT 1;
  END IF;

  SELECT id INTO v_tag_legacy
  FROM public.contact_tags
  WHERE name = 'Legacy Lead'
  LIMIT 1;

  -- Preserve historical updated_at during merges
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_contacts_set_updated_at'
      AND tgrelid = 'public.contacts'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE public.contacts DISABLE TRIGGER trg_contacts_set_updated_at';
  END IF;

  BEGIN
  FOR r IN
    SELECT
      l.id,
      l.name,
      l.number,
      l.source,
      l.sales_agent_id,
      l.created_at,
      l.updated_at,
      l.status,
      l.lead_id_formatted,
      l.created_by_sales_agent_id,
      l.organization_id,
      COALESCE(
        NULLIF(l.number_normalized, ''),
        public.normalize_lead_phone(l.number)
      ) AS phone_norm
    FROM public.leads l
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.lead_to_contact_migrations m
      WHERE m.lead_id = l.id
    )
    ORDER BY l.created_at ASC NULLS LAST, l.id ASC
  LOOP
    BEGIN
      v_phone_norm := r.phone_norm;
      v_phone_display := NULLIF(btrim(r.number), '');
      v_source := NULLIF(btrim(r.source), '');
      v_owner_agent_id := r.sales_agent_id;

      -- Creator username (for contacts.created_by ownership visibility)
      SELECT sa.username INTO v_creator_username
      FROM public.sales_agents sa
      WHERE sa.id = COALESCE(r.created_by_sales_agent_id, r.sales_agent_id)
      LIMIT 1;

      IF v_creator_username IS NULL OR btrim(v_creator_username) = '' THEN
        SELECT sa.username INTO v_creator_username
        FROM public.sales_agents sa
        WHERE sa.id = r.sales_agent_id
        LIMIT 1;
      END IF;

      -- Organization: lead → agent portal default → sole org
      v_org_id := r.organization_id;

      IF v_org_id IS NULL AND v_has_app_user_id AND v_has_default_org THEN
        EXECUTE format(
          $q$
            SELECT au.%I
            FROM public.sales_agents sa
            JOIN public.app_users au ON au.id = sa.app_user_id
            WHERE sa.id = $1
            LIMIT 1
          $q$,
          v_default_org_col
        )
        INTO v_org_id
        USING r.sales_agent_id;
      END IF;

      IF v_org_id IS NULL THEN
        v_org_id := v_sole_org_id;
      END IF;

      v_name := NULLIF(btrim(r.name), '');
      IF v_name IS NULL THEN
        v_name := 'Lead ' || COALESCE(
          NULLIF(btrim(r.lead_id_formatted), ''),
          left(r.id::text, 8)
        );
      END IF;

      v_migration_note := format(
        E'Migrated from legacy Sales Agent Lead\nLead UUID: %s\nLead #: %s\nStatus: %s\nSource: %s\nMigrated at: %s',
        r.id::text,
        COALESCE(NULLIF(btrim(r.lead_id_formatted), ''), '—'),
        COALESCE(NULLIF(btrim(r.status), ''), '—'),
        COALESCE(v_source, '—'),
        to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      );

      -- Match existing contact by phone (normalized) within same organization
      v_existing_contact_id := NULL;
      IF v_phone_norm IS NOT NULL THEN
        SELECT c.id INTO v_existing_contact_id
        FROM public.contacts c
        WHERE public.normalize_lead_phone(c.phone) = v_phone_norm
          AND c.organization_id IS NOT DISTINCT FROM v_org_id
          AND c.parent_id IS NULL
        ORDER BY
          CASE WHEN c.salesperson_id = v_owner_agent_id THEN 0 ELSE 1 END,
          c.created_at ASC NULLS LAST
        LIMIT 1;
      END IF;

      IF v_existing_contact_id IS NOT NULL THEN
        -- MERGE: fill gaps only; preserve existing ownership & org when set
        UPDATE public.contacts c
        SET
          phone = COALESCE(NULLIF(btrim(c.phone), ''), v_phone_display),
          source = COALESCE(NULLIF(btrim(c.source), ''), v_source),
          salesperson_id = COALESCE(c.salesperson_id, v_owner_agent_id),
          created_by = COALESCE(NULLIF(btrim(c.created_by), ''), v_creator_username),
          organization_id = COALESCE(c.organization_id, v_org_id),
          customer_rank = GREATEST(COALESCE(c.customer_rank, 0), 1),
          is_active = true,
          notes = CASE
            WHEN c.notes IS NULL OR btrim(c.notes) = '' THEN v_migration_note
            WHEN position(r.id::text IN c.notes) > 0 THEN c.notes
            ELSE c.notes || E'\n\n' || v_migration_note
          END,
          legacy_lead_id = COALESCE(c.legacy_lead_id, r.id),
          updated_at = GREATEST(COALESCE(c.updated_at, r.updated_at), COALESCE(r.updated_at, c.updated_at))
        WHERE c.id = v_existing_contact_id;

        v_contact_id := v_existing_contact_id;
        v_action := 'merged';
        v_merged := v_merged + 1;
      ELSE
        -- CREATE
        INSERT INTO public.contacts (
          contact_kind,
          company_type,
          name,
          phone,
          source,
          salesperson_id,
          customer_rank,
          vendor_rank,
          notes,
          is_active,
          organization_id,
          created_by,
          created_at,
          updated_at,
          legacy_lead_id
        ) VALUES (
          'contact',
          'person',
          v_name,
          v_phone_display,
          v_source,
          v_owner_agent_id,
          1,
          0,
          v_migration_note,
          true,
          v_org_id,
          v_creator_username,
          COALESCE(r.created_at, now()),
          COALESCE(r.updated_at, r.created_at, now()),
          r.id
        )
        RETURNING id INTO v_contact_id;

        v_action := 'created';
        v_created := v_created + 1;
      END IF;

      -- Back-link lead → contact (non-destructive)
      UPDATE public.leads
      SET contact_id = v_contact_id
      WHERE id = r.id
        AND (contact_id IS NULL OR contact_id IS DISTINCT FROM v_contact_id);

      -- Audit row
      INSERT INTO public.lead_to_contact_migrations (lead_id, contact_id, action, notes)
      VALUES (r.id, v_contact_id, v_action, v_migration_note)
      ON CONFLICT (lead_id) DO NOTHING;

      -- Tags: Legacy Lead + Lead Source:*
      IF v_tag_legacy IS NOT NULL THEN
        INSERT INTO public.contact_tag_links (contact_id, tag_id)
        VALUES (v_contact_id, v_tag_legacy)
        ON CONFLICT DO NOTHING;
      END IF;

      IF v_source IS NOT NULL THEN
        SELECT id INTO v_tag_source
        FROM public.contact_tags
        WHERE name = 'Lead Source: ' || v_source
        LIMIT 1;

        IF v_tag_source IS NOT NULL THEN
          INSERT INTO public.contact_tag_links (contact_id, tag_id)
          VALUES (v_contact_id, v_tag_source)
          ON CONFLICT DO NOTHING;
        END IF;
      END IF;

      -- Chatter note (best-effort)
      BEGIN
        INSERT INTO public.contact_activity_logs (
          contact_id, action_type, body, performed_by, metadata
        ) VALUES (
          v_contact_id,
          'note',
          v_migration_note,
          COALESCE(v_creator_username, 'system'),
          jsonb_build_object(
            'legacy_lead_id', r.id,
            'migration_action', v_action,
            'source', v_source
          )
        );
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
      v_error_detail := left(
        COALESCE(v_error_detail || E'\n', '') ||
        format('lead %s: %s', r.id::text, SQLERRM),
        4000
      );
    END;
  END LOOP;
  EXCEPTION WHEN OTHERS THEN
    -- Always re-enable trigger if the batch aborts
    IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_contacts_set_updated_at'
        AND tgrelid = 'public.contacts'::regclass
    ) THEN
      EXECUTE 'ALTER TABLE public.contacts ENABLE TRIGGER trg_contacts_set_updated_at';
    END IF;
    RAISE;
  END;

  -- Re-enable timestamp trigger
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_contacts_set_updated_at'
      AND tgrelid = 'public.contacts'::regclass
  ) THEN
    EXECUTE 'ALTER TABLE public.contacts ENABLE TRIGGER trg_contacts_set_updated_at';
  END IF;

  created_count := v_created;
  merged_count := v_merged;
  skipped_count := v_skipped;
  error_count := v_errors;
  detail := COALESCE(NULLIF(v_error_detail, ''), 'ok');
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.migrate_legacy_leads_to_contacts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.migrate_legacy_leads_to_contacts() TO service_role;

-- -----------------------------------------------------
-- 5) Run migration now
-- -----------------------------------------------------
DO $$
DECLARE
  result RECORD;
BEGIN
  SELECT * INTO result FROM public.migrate_legacy_leads_to_contacts();
  RAISE NOTICE
    'Legacy leads → contacts: created=%, merged=%, previously_migrated≈%, errors=% (% )',
    result.created_count,
    result.merged_count,
    result.skipped_count,
    result.error_count,
    result.detail;
END $$;

-- Quick verification (visible in Results if your client returns SELECT)
SELECT * FROM public.legacy_leads_to_contacts_migration_stats();
