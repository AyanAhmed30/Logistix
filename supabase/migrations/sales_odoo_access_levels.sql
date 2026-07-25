-- Migrate legacy Sales submodule permissions → Odoo-style Sales access levels.
-- Safe / idempotent. Does NOT delete business data (quotations, orders, etc.).
-- Runtime also maps legacy keys via getSalesAccessLevel().
-- Prefer "Run and enable RLS" if prompted.

-- app_users with legacy sales keys (no new level yet) → sales-all + Contacts + CRM
UPDATE public.app_users
SET permissions = (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x), '[]'::jsonb)
  FROM (
    SELECT DISTINCT x
    FROM (
      SELECT elem AS x
      FROM jsonb_array_elements_text(COALESCE(app_users.permissions, '[]'::jsonb)) AS elem
      WHERE elem NOT IN (
        'lead', 'pipeline', 'customer-list', 'lead-transfer-tracking',
        'accounting', 'inquiry-tracking', 'quotations', 'sales',
        'sales-own', 'sales-all', 'sales-admin', 'customers',
        'crm', 'crm-pipeline', 'crm-customers', 'crm-activities', 'crm-reports'
      )
      UNION ALL
      SELECT unnest(ARRAY[
        'sales-all', 'sales', 'customers',
        'crm', 'crm-pipeline', 'crm-customers', 'crm-activities', 'crm-reports'
      ])
    ) merged
  ) distinct_keys
)
WHERE permissions IS NOT NULL
  AND jsonb_typeof(permissions) = 'array'
  AND (
    permissions ? 'lead'
    OR permissions ? 'pipeline'
    OR permissions ? 'customer-list'
    OR permissions ? 'lead-transfer-tracking'
    OR permissions ? 'accounting'
    OR permissions ? 'inquiry-tracking'
    OR permissions ? 'customers'
    OR permissions ? 'quotations'
    OR permissions ? 'sales'
  )
  AND NOT (
    permissions ? 'sales-own'
    OR permissions ? 'sales-all'
    OR permissions ? 'sales-admin'
  );

-- Ensure deps for users who already have a Sales level key
UPDATE public.app_users
SET permissions = (
  SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x), '[]'::jsonb)
  FROM (
    SELECT DISTINCT x
    FROM (
      SELECT elem AS x
      FROM jsonb_array_elements_text(COALESCE(app_users.permissions, '[]'::jsonb)) AS elem
      UNION ALL
      SELECT unnest(ARRAY[
        'sales', 'customers',
        'crm', 'crm-pipeline', 'crm-customers', 'crm-activities', 'crm-reports'
      ])
    ) merged
  ) distinct_keys
)
WHERE permissions IS NOT NULL
  AND jsonb_typeof(permissions) = 'array'
  AND (
    permissions ? 'sales-own'
    OR permissions ? 'sales-all'
    OR permissions ? 'sales-admin'
  );

-- sales_agents → sales-all when missing a level key
UPDATE public.sales_agents
SET permissions = '["sales-all","sales","customers"]'::jsonb
WHERE permissions IS NULL
   OR jsonb_typeof(permissions) <> 'array'
   OR jsonb_array_length(permissions) = 0
   OR (
     NOT (permissions ? 'sales-own')
     AND NOT (permissions ? 'sales-all')
     AND NOT (permissions ? 'sales-admin')
   );
