-- 021 — Mobile signup: link/create contacts + atomic least-loaded Sales Agent assignment
-- Prerequisites: 010/013 (phones_match), 014 (register_user), contacts + sales_agents tables
--
-- Rules:
--   Existing contact by phone → keep salesperson_id (never rebalance)
--   No contact → create person contact, assign least-loaded active sales agent
--   Assignment is customer-level (contacts.salesperson_id), concurrent-safe via advisory lock

-- ---------------------------------------------------------------------------
-- Schema extensions
-- ---------------------------------------------------------------------------

ALTER TABLE public.sales_agents
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

ALTER TABLE public.sales_agents
  ADD COLUMN IF NOT EXISTS last_mobile_auto_assigned_at timestamptz NULL;

COMMENT ON COLUMN public.sales_agents.is_active IS
  'When false, agent is excluded from automatic mobile customer assignment.';
COMMENT ON COLUMN public.sales_agents.last_mobile_auto_assigned_at IS
  'Timestamp of last automatic mobile-customer assignment (tie-break).';

CREATE INDEX IF NOT EXISTS idx_sales_agents_is_active
  ON public.sales_agents (is_active)
  WHERE is_active = true;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS source text NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS mobile_registered_at timestamptz NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS mobile_user_id uuid NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'users'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'contacts'
      AND constraint_name = 'contacts_mobile_user_id_fkey'
  ) THEN
    ALTER TABLE public.contacts
      ADD CONSTRAINT contacts_mobile_user_id_fkey
      FOREIGN KEY (mobile_user_id) REFERENCES public.users (id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_salesperson_mobile
  ON public.contacts (salesperson_id)
  WHERE mobile_registered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_mobile_registered_at
  ON public.contacts (mobile_registered_at)
  WHERE mobile_registered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_source
  ON public.contacts (source)
  WHERE source IS NOT NULL;

-- Assignment audit (append-only)
CREATE TABLE IF NOT EXISTS public.contact_sales_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES public.contacts (id) ON DELETE CASCADE,
  sales_agent_id uuid NULL REFERENCES public.sales_agents (id) ON DELETE SET NULL,
  previous_sales_agent_id uuid NULL REFERENCES public.sales_agents (id) ON DELETE SET NULL,
  assignment_type text NOT NULL
    CHECK (assignment_type IN ('automatic', 'manual')),
  changed_by text NULL,
  reason text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_sales_assignments_contact
  ON public.contact_sales_assignments (contact_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_sales_assignments_agent
  ON public.contact_sales_assignments (sales_agent_id, created_at DESC);

ALTER TABLE public.contact_sales_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.contact_sales_assignments;
CREATE POLICY "Full access for service role"
  ON public.contact_sales_assignments
  FOR ALL
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.contact_sales_assignments FROM anon, authenticated;
GRANT ALL ON public.contact_sales_assignments TO service_role;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._default_organization_id_for_mobile()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  SELECT o.id
  INTO v_org
  FROM public.organizations o
  WHERE coalesce(o.status, 'active') = 'active'
  ORDER BY o.created_at ASC NULLS LAST, o.id ASC
  LIMIT 1;

  RETURN v_org;
END;
$$;

CREATE OR REPLACE FUNCTION public._allocate_contact_lead_id_safe()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'allocate_contact_lead_id_formatted'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RETURN public.allocate_contact_lead_id_formatted();
  END IF;

  -- Fallback when allocation RPC is not installed yet
  LOOP
    v_id := lpad((100000 + floor(random() * 900000)::int)::text, 6, '0');
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.contacts c WHERE c.lead_id_formatted = v_id
    );
  END LOOP;
  RETURN v_id;
END;
$$;

-- Least-loaded active sales agent. Caller MUST hold advisory lock for concurrency.
CREATE OR REPLACE FUNCTION public._pick_least_loaded_sales_agent()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_id uuid;
BEGIN
  SELECT sa.id
  INTO v_agent_id
  FROM public.sales_agents sa
  WHERE coalesce(sa.is_active, true) = true
    AND nullif(btrim(coalesce(sa.username, '')), '') IS NOT NULL
  ORDER BY (
    SELECT count(*)::bigint
    FROM public.contacts c
    WHERE c.salesperson_id = sa.id
      AND c.mobile_registered_at IS NOT NULL
      AND coalesce(c.is_active, true) = true
  ) ASC,
  sa.last_mobile_auto_assigned_at ASC NULLS FIRST,
  sa.id ASC
  LIMIT 1;

  RETURN v_agent_id;
END;
$$;

CREATE OR REPLACE FUNCTION public._record_contact_sales_assignment(
  p_contact_id uuid,
  p_sales_agent_id uuid,
  p_previous_sales_agent_id uuid,
  p_assignment_type text,
  p_changed_by text,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contact_sales_assignments (
    contact_id,
    sales_agent_id,
    previous_sales_agent_id,
    assignment_type,
    changed_by,
    reason
  ) VALUES (
    p_contact_id,
    p_sales_agent_id,
    p_previous_sales_agent_id,
    p_assignment_type,
    p_changed_by,
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public._default_organization_id_for_mobile() FROM public;
REVOKE ALL ON FUNCTION public._allocate_contact_lead_id_safe() FROM public;
REVOKE ALL ON FUNCTION public._pick_least_loaded_sales_agent() FROM public;
REVOKE ALL ON FUNCTION public._record_contact_sales_assignment(uuid, uuid, uuid, text, text, text) FROM public;

GRANT EXECUTE ON FUNCTION public._default_organization_id_for_mobile() TO service_role;
GRANT EXECUTE ON FUNCTION public._allocate_contact_lead_id_safe() TO service_role;
GRANT EXECUTE ON FUNCTION public._pick_least_loaded_sales_agent() TO service_role;
GRANT EXECUTE ON FUNCTION public._record_contact_sales_assignment(uuid, uuid, uuid, text, text, text) TO service_role;

-- Manual reassignment audit is recorded from the ERP updateContact action
-- (has authenticated username). Automatic assignments are recorded in register_user.

-- ---------------------------------------------------------------------------
-- Extended register_user
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.register_user(
  p_phone text,
  p_email text,
  p_first_name text,
  p_last_name text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.users%rowtype;
  v_phone text;
  v_contact public.contacts%rowtype;
  v_agent_id uuid;
  v_agent_username text;
  v_org_id uuid;
  v_display_name text;
  v_lead_id text;
  v_created_contact boolean := false;
  v_assigned_now boolean := false;
BEGIN
  v_phone := trim(coalesce(p_phone, ''));

  IF length(v_phone) < 7
     OR public.normalize_phone_digits(v_phone) IS NULL
     OR length(public.normalize_phone_digits(v_phone)) < 7 THEN
    RAISE EXCEPTION 'invalid_phone';
  END IF;

  IF length(coalesce(p_password, '')) < 8 THEN
    RAISE EXCEPTION 'weak_password';
  END IF;

  -- Prevent duplicate mobile accounts across phone format variants
  IF EXISTS (
    SELECT 1
    FROM public.users u
    WHERE public.phones_match(u.phone, v_phone)
  ) THEN
    RAISE EXCEPTION 'duplicate_phone';
  END IF;

  BEGIN
    INSERT INTO public.users (phone, email, first_name, last_name, password_hash)
    VALUES (
      v_phone,
      lower(trim(p_email)),
      trim(p_first_name),
      trim(p_last_name),
      extensions.crypt(p_password, extensions.gen_salt('bf'::text))
    )
    RETURNING * INTO v_user;
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%users_phone_key%' OR SQLERRM ILIKE '%phone%' THEN
        RAISE EXCEPTION 'duplicate_phone';
      ELSIF SQLERRM ILIKE '%users_email_key%' OR SQLERRM ILIKE '%email%' THEN
        RAISE EXCEPTION 'duplicate_email';
      ELSE
        RAISE EXCEPTION 'duplicate_account';
      END IF;
  END;

  v_display_name := trim(both FROM concat_ws(' ', trim(p_first_name), trim(p_last_name)));
  IF v_display_name = '' THEN
    v_display_name := v_phone;
  END IF;

  -- Serialize contact create + load-balanced assignment across concurrent signups
  PERFORM pg_advisory_xact_lock(872314001);

  SELECT c.*
  INTO v_contact
  FROM public.contacts c
  WHERE public.phones_match(c.phone, v_phone)
     OR public.phones_match(c.mobile, v_phone)
  ORDER BY
    CASE WHEN c.salesperson_id IS NOT NULL THEN 0 ELSE 1 END,
    c.created_at ASC NULLS LAST,
    c.id ASC
  LIMIT 1;

  IF FOUND THEN
    -- Existing CRM / WhatsApp / manual contact: keep salesperson
    UPDATE public.contacts
    SET
      mobile_registered_at = coalesce(mobile_registered_at, now()),
      mobile_user_id = coalesce(mobile_user_id, v_user.id),
      email = coalesce(nullif(btrim(email), ''), lower(trim(p_email))),
      updated_at = now()
    WHERE id = v_contact.id
    RETURNING * INTO v_contact;

    IF v_contact.salesperson_id IS NULL THEN
      v_agent_id := public._pick_least_loaded_sales_agent();
      IF v_agent_id IS NULL THEN
        RAISE EXCEPTION 'no_active_sales_agent';
      END IF;

      SELECT sa.username INTO v_agent_username
      FROM public.sales_agents sa
      WHERE sa.id = v_agent_id;

      UPDATE public.contacts
      SET
        salesperson_id = v_agent_id,
        created_by = coalesce(nullif(btrim(created_by), ''), v_agent_username),
        updated_at = now()
      WHERE id = v_contact.id
      RETURNING * INTO v_contact;

      UPDATE public.sales_agents
      SET last_mobile_auto_assigned_at = now(), updated_at = now()
      WHERE id = v_agent_id;

      PERFORM public._record_contact_sales_assignment(
        v_contact.id,
        v_agent_id,
        NULL,
        'automatic',
        'mobile_register',
        'existing_contact_missing_salesperson'
      );
      v_assigned_now := true;
    END IF;
  ELSE
    -- Brand-new mobile customer
    v_agent_id := public._pick_least_loaded_sales_agent();
    IF v_agent_id IS NULL THEN
      RAISE EXCEPTION 'no_active_sales_agent';
    END IF;

    SELECT sa.username INTO v_agent_username
    FROM public.sales_agents sa
    WHERE sa.id = v_agent_id;

    v_org_id := public._default_organization_id_for_mobile();
    v_lead_id := public._allocate_contact_lead_id_safe();

    INSERT INTO public.contacts (
      contact_kind,
      company_type,
      name,
      email,
      phone,
      mobile,
      salesperson_id,
      source,
      mobile_registered_at,
      mobile_user_id,
      organization_id,
      lead_id_formatted,
      created_by,
      customer_rank,
      is_active
    ) VALUES (
      'contact',
      'person',
      v_display_name,
      lower(trim(p_email)),
      v_phone,
      v_phone,
      v_agent_id,
      'mobile_app',
      now(),
      v_user.id,
      v_org_id,
      v_lead_id,
      v_agent_username,
      1,
      true
    )
    RETURNING * INTO v_contact;

    UPDATE public.sales_agents
    SET last_mobile_auto_assigned_at = now(), updated_at = now()
    WHERE id = v_agent_id;

    PERFORM public._record_contact_sales_assignment(
      v_contact.id,
      v_agent_id,
      NULL,
      'automatic',
      'mobile_register',
      'new_mobile_customer'
    );

    v_created_contact := true;
    v_assigned_now := true;
  END IF;

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'phone', v_user.phone,
      'email', v_user.email,
      'first_name', v_user.first_name,
      'last_name', v_user.last_name,
      'created_at', v_user.created_at
    ),
    'contact_id', v_contact.id,
    'salesperson_id', v_contact.salesperson_id,
    'created_contact', v_created_contact,
    'assigned_now', v_assigned_now
  );
END;
$$;

REVOKE ALL ON FUNCTION public.register_user(text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.register_user(text, text, text, text, text) TO anon, authenticated, service_role;

-- login still issues session only — no reassignment
-- Improve phone lookup with phones_match so format variants still authenticate
CREATE OR REPLACE FUNCTION public.login_user(p_phone text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_user public.users%rowtype;
  v_session record;
BEGIN
  SELECT * INTO v_user
  FROM public.users u
  WHERE public.phones_match(u.phone, trim(p_phone))
     OR u.phone = trim(p_phone)
  ORDER BY CASE WHEN u.phone = trim(p_phone) THEN 0 ELSE 1 END, u.created_at ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  IF v_user.password_hash IS DISTINCT FROM extensions.crypt(p_password, v_user.password_hash) THEN
    RAISE EXCEPTION 'invalid_credentials';
  END IF;

  SELECT * INTO v_session FROM public._issue_user_session(v_user.id);

  RETURN jsonb_build_object(
    'user', jsonb_build_object(
      'id', v_user.id,
      'phone', v_user.phone,
      'email', v_user.email,
      'first_name', v_user.first_name,
      'last_name', v_user.last_name,
      'created_at', v_user.created_at
    ),
    'session_token', v_session.session_token,
    'expires_at', v_session.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.login_user(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.login_user(text, text) TO anon, authenticated, service_role;
