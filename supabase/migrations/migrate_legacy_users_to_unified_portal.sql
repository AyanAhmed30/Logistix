-- Migrate legacy Sales Person (sales_agents) and Operations Person (operations_users)
-- into the unified app_users portal system. Preserves all sales_agent_id FKs.

-- Bridge columns (legacy rows stay for data relationships)
ALTER TABLE public.sales_agents
  ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES public.app_users (id) ON DELETE SET NULL;

ALTER TABLE public.operations_users
  ADD COLUMN IF NOT EXISTS app_user_id UUID REFERENCES public.app_users (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sales_agents_app_user_id
  ON public.sales_agents (app_user_id);

CREATE INDEX IF NOT EXISTS idx_operations_users_app_user_id
  ON public.operations_users (app_user_id);

-- Full Sales module keys (legacy empty permissions = full sales access)
DO $$
DECLARE
  full_sales_perms JSONB := '[
    "lead","pipeline","customer-list","lead-transfer-tracking",
    "accounting","inquiry-tracking","customers","quotations","sales"
  ]'::jsonb;
  full_ops_perms JSONB := '[
    "leads-inquiry","management","console","loading-instruction",
    "import-packing-list","import-invoice","inquiry-confirmation",
    "calculator-config","operations"
  ]'::jsonb;
  default_org_id UUID;
  agent RECORD;
  ops RECORD;
  existing_user_id UUID;
  new_user_id UUID;
  merged_perms JSONB;
  org_ids UUID[];
  org_id UUID;
BEGIN
  SELECT id INTO default_org_id
  FROM public.organizations
  WHERE status = 'active'
  ORDER BY organization_name ASC
  LIMIT 1;

  -- ── Sales agents ──────────────────────────────────────────────────────────
  FOR agent IN
    SELECT sa.id, sa.name, sa.username, sa.password, sa.email, sa.permissions, sa.app_user_id
    FROM public.sales_agents sa
    WHERE COALESCE(TRIM(sa.username), '') <> ''
  LOOP
    IF agent.app_user_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT au.id INTO existing_user_id
    FROM public.app_users au
    WHERE au.username = agent.username
    LIMIT 1;

    IF existing_user_id IS NULL THEN
      merged_perms := COALESCE(agent.permissions, '[]'::jsonb);
      IF jsonb_array_length(merged_perms) = 0 THEN
        merged_perms := full_sales_perms;
      ELSIF NOT merged_perms ? 'sales' THEN
        merged_perms := merged_perms || '["sales"]'::jsonb;
      END IF;

      INSERT INTO public.app_users (
        username, password, role, full_name, email, permissions, default_organization
      ) VALUES (
        agent.username,
        agent.password,
        'user',
        COALESCE(NULLIF(TRIM(agent.name), ''), agent.username),
        agent.email,
        merged_perms,
        default_org_id
      )
      RETURNING id INTO new_user_id;

      existing_user_id := new_user_id;
    ELSE
      -- Merge sales permissions into existing portal user
      SELECT permissions INTO merged_perms FROM public.app_users WHERE id = existing_user_id;
      merged_perms := COALESCE(merged_perms, '[]'::jsonb);
      IF jsonb_array_length(COALESCE(agent.permissions, '[]'::jsonb)) = 0 THEN
        merged_perms := (
          SELECT jsonb_agg(DISTINCT v)
          FROM (
            SELECT jsonb_array_elements_text(merged_perms) AS v
            UNION
            SELECT jsonb_array_elements_text(full_sales_perms)
          ) s
        );
      ELSE
        merged_perms := (
          SELECT jsonb_agg(DISTINCT v)
          FROM (
            SELECT jsonb_array_elements_text(merged_perms) AS v
            UNION
            SELECT jsonb_array_elements_text(COALESCE(agent.permissions, '[]'::jsonb))
            UNION SELECT 'sales'
          ) s
        );
      END IF;
      UPDATE public.app_users SET permissions = merged_perms WHERE id = existing_user_id;
    END IF;

    UPDATE public.sales_agents SET app_user_id = existing_user_id WHERE id = agent.id;

    -- Assign organizations from leads owned by this agent, else default org
    org_ids := ARRAY[]::UUID[];
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'organization_id'
    ) THEN
      SELECT ARRAY_AGG(DISTINCT l.organization_id) INTO org_ids
      FROM public.leads l
      WHERE l.sales_agent_id = agent.id AND l.organization_id IS NOT NULL;
    END IF;

    IF org_ids IS NULL OR array_length(org_ids, 1) IS NULL THEN
      IF default_org_id IS NOT NULL THEN
        org_ids := ARRAY[default_org_id];
      END IF;
    END IF;

    IF org_ids IS NOT NULL THEN
      FOREACH org_id IN ARRAY org_ids LOOP
        INSERT INTO public.user_organizations (user_id, organization_id)
        VALUES (existing_user_id, org_id)
        ON CONFLICT DO NOTHING;
      END LOOP;

      UPDATE public.app_users
      SET default_organization = COALESCE(default_organization, org_ids[1])
      WHERE id = existing_user_id AND default_organization IS NULL;
    END IF;
  END LOOP;

  -- ── Operations users ──────────────────────────────────────────────────────
  -- operations_users may or may not have a permissions column
  FOR ops IN
    EXECUTE format(
      'SELECT ou.id, ou.name, ou.username, ou.password, ou.app_user_id, %s AS permissions FROM public.operations_users ou WHERE COALESCE(TRIM(ou.username), '''') <> ''''',
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'operations_users' AND column_name = 'permissions'
      ) THEN 'ou.permissions' ELSE 'NULL::jsonb' END
    )
  LOOP
    IF ops.app_user_id IS NOT NULL THEN
      CONTINUE;
    END IF;

    SELECT au.id INTO existing_user_id
    FROM public.app_users au
    WHERE au.username = ops.username
    LIMIT 1;

    IF existing_user_id IS NULL THEN
      merged_perms := COALESCE(ops.permissions, '[]'::jsonb);
      IF jsonb_array_length(merged_perms) = 0 THEN
        merged_perms := full_ops_perms;
      ELSIF NOT merged_perms ? 'operations' THEN
        merged_perms := merged_perms || '["operations"]'::jsonb;
      END IF;

      INSERT INTO public.app_users (
        username, password, role, full_name, permissions, default_organization
      ) VALUES (
        ops.username,
        ops.password,
        'user',
        COALESCE(NULLIF(TRIM(ops.name), ''), ops.username),
        merged_perms,
        default_org_id
      )
      RETURNING id INTO new_user_id;

      existing_user_id := new_user_id;
    ELSE
      SELECT permissions INTO merged_perms FROM public.app_users WHERE id = existing_user_id;
      merged_perms := COALESCE(merged_perms, '[]'::jsonb);
      IF jsonb_array_length(COALESCE(ops.permissions, '[]'::jsonb)) = 0 THEN
        merged_perms := (
          SELECT jsonb_agg(DISTINCT v)
          FROM (
            SELECT jsonb_array_elements_text(merged_perms) AS v
            UNION
            SELECT jsonb_array_elements_text(full_ops_perms)
          ) s
        );
      ELSE
        merged_perms := (
          SELECT jsonb_agg(DISTINCT v)
          FROM (
            SELECT jsonb_array_elements_text(merged_perms) AS v
            UNION
            SELECT jsonb_array_elements_text(COALESCE(ops.permissions, '[]'::jsonb))
            UNION SELECT 'operations'
          ) s
        );
      END IF;
      UPDATE public.app_users SET permissions = merged_perms WHERE id = existing_user_id;
    END IF;

    UPDATE public.operations_users SET app_user_id = existing_user_id WHERE id = ops.id;

    IF default_org_id IS NOT NULL THEN
      INSERT INTO public.user_organizations (user_id, organization_id)
      VALUES (existing_user_id, default_org_id)
      ON CONFLICT DO NOTHING;

      UPDATE public.app_users
      SET default_organization = COALESCE(default_organization, default_org_id)
      WHERE id = existing_user_id AND default_organization IS NULL;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
