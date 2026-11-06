-- STEP 053 — Analytics timing view, aggregation functions and indexes
-- Prerequisites: 051 (inquiry_workflow_events).
--
-- Read-only. Totals are calculated in the database so dashboards never load
-- every record into the browser. These objects are callable by the service role
-- only: server actions must check the user's role and organization first, and
-- must pass the organization. p_organization_id NULL means every organization and
-- is for Super Admin only.
--
-- Date filters are half-open: p_from <= value < p_to. NULL means no limit.
-- Idempotent. Safe to run multiple times.

-- ---------------------------------------------------------------------------
-- Indexes for commonly filtered columns
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_leads_sales_agent_org
  ON public.leads (sales_agent_id, organization_id);

CREATE INDEX IF NOT EXISTS idx_lead_inquiries_org_sent_at
  ON public.lead_inquiries (organization_id, sent_at DESC)
  WHERE sent_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quotations_salesperson_created
  ON public.quotations (salesperson_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quotations_salesperson_sent
  ON public.quotations (salesperson_id, sent_to_customer_at DESC)
  WHERE sent_to_customer_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_activities_assignee_status_due
  ON public.crm_activities (assigned_to, status, due_date);

CREATE INDEX IF NOT EXISTS idx_crm_activities_assignee_completed
  ON public.crm_activities (assigned_to, completed_at DESC)
  WHERE completed_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Per-inquiry timing
--
-- operations_seconds: first send to first Operations submission. Nothing records
--   when work started, so this includes time waiting in the queue.
-- admin_decision_seconds: latest calculation submitted to latest decision.
-- turnaround_seconds: first send to latest decision.
-- Admin-calculated inquiries have no Operations time. A value stays NULL when
-- either end is missing; durations are never estimated.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.analytics_inquiry_timings AS
WITH per_inquiry AS (
  SELECT
    e.inquiry_id,
    min(e.occurred_at) FILTER (WHERE e.event_type IN ('submitted', 'resubmitted')) AS first_submitted_at,
    max(e.occurred_at) FILTER (WHERE e.event_type IN ('submitted', 'resubmitted')) AS last_submitted_at,
    min(e.occurred_at) FILTER (WHERE e.event_type = 'operations_submitted') AS first_operations_submitted_at,
    max(e.occurred_at) FILTER (WHERE e.event_type = 'operations_submitted') AS last_operations_submitted_at,
    max(e.occurred_at) FILTER (WHERE e.event_type IN ('operations_submitted', 'admin_calculated')) AS last_calculation_at,
    max(e.occurred_at) FILTER (WHERE e.event_type IN ('approved', 'rejected')) AS decided_at,
    (array_agg(e.event_type ORDER BY e.occurred_at DESC)
      FILTER (WHERE e.event_type IN ('approved', 'rejected')))[1] AS decision,
    (array_agg(e.actor ORDER BY e.occurred_at DESC)
      FILTER (WHERE e.event_type = 'operations_submitted'))[1] AS operations_actor,
    (array_agg(e.actor ORDER BY e.occurred_at DESC)
      FILTER (WHERE e.event_type IN ('approved', 'rejected')))[1] AS decided_by,
    count(*) FILTER (WHERE e.event_type IN ('operations_submitted', 'admin_calculated')) AS calculation_rounds,
    count(*) FILTER (WHERE e.event_type = 'flagged') AS flag_count,
    bool_or(e.event_type = 'admin_calculated') AS admin_calculated,
    bool_or(e.source = 'backfill') AS has_backfilled_events
  FROM public.inquiry_workflow_events e
  GROUP BY e.inquiry_id
)
SELECT
  p.inquiry_id,
  li.organization_id,
  li.lead_id,
  l.sales_agent_id,
  li.approval_status,
  p.first_submitted_at,
  p.last_submitted_at,
  p.first_operations_submitted_at,
  p.last_operations_submitted_at,
  p.last_calculation_at,
  p.decided_at,
  p.decision,
  p.operations_actor,
  p.decided_by,
  p.calculation_rounds,
  p.flag_count,
  COALESCE(p.admin_calculated, false) AS admin_calculated,
  COALESCE(p.has_backfilled_events, false) AS has_backfilled_events,
  CASE WHEN p.first_operations_submitted_at >= p.first_submitted_at
    THEN extract(epoch FROM p.first_operations_submitted_at - p.first_submitted_at) END AS operations_seconds,
  CASE WHEN p.decided_at >= p.last_calculation_at
    THEN extract(epoch FROM p.decided_at - p.last_calculation_at) END AS admin_decision_seconds,
  CASE WHEN p.decided_at >= p.first_submitted_at
    THEN extract(epoch FROM p.decided_at - p.first_submitted_at) END AS turnaround_seconds
FROM per_inquiry p
JOIN public.lead_inquiries li ON li.id = p.inquiry_id
LEFT JOIN public.leads l ON l.id = li.lead_id;

REVOKE ALL ON TABLE public.analytics_inquiry_timings FROM anon, authenticated;
GRANT SELECT ON TABLE public.analytics_inquiry_timings TO service_role;

-- ---------------------------------------------------------------------------
-- Sales: one row per agent
-- Follow-ups are crm_activities of every type assigned to the agent.
-- *_pending, *_overdue and inquiries_pending are the current state and ignore
-- the date filter; everything else counts within the period.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_sales_agent_metrics(
  p_organization_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_sales_agent_id uuid DEFAULT NULL
)
RETURNS TABLE (
  sales_agent_id uuid,
  total_contacts bigint,
  new_contacts bigint,
  followups_scheduled bigint,
  followups_completed bigint,
  followups_pending bigint,
  followups_overdue bigint,
  inquiries_submitted bigint,
  inquiries_pending bigint,
  inquiries_approved bigint,
  inquiries_rejected bigint,
  quotations_created bigint,
  quotations_sent bigint,
  quotations_open bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH agents AS (
    SELECT a.id FROM public.sales_agents a
    WHERE p_sales_agent_id IS NULL OR a.id = p_sales_agent_id
  ),
  contact_stats AS (
    SELECT
      c.salesperson_id AS agent_id,
      count(*) AS total_contacts,
      count(*) FILTER (
        WHERE (p_from IS NULL OR c.created_at >= p_from)
          AND (p_to IS NULL OR c.created_at < p_to)
      ) AS new_contacts
    FROM public.contacts c
    WHERE c.salesperson_id IN (SELECT id FROM agents)
      AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
      AND (c.parent_id IS NULL OR c.company_type = 'person')
    GROUP BY c.salesperson_id
  ),
  followup_stats AS (
    SELECT
      a.assigned_to AS agent_id,
      count(*) FILTER (
        WHERE (p_from IS NULL OR a.created_at >= p_from)
          AND (p_to IS NULL OR a.created_at < p_to)
      ) AS scheduled,
      count(*) FILTER (
        WHERE a.status = 'done'
          AND a.completed_at IS NOT NULL
          AND (p_from IS NULL OR a.completed_at >= p_from)
          AND (p_to IS NULL OR a.completed_at < p_to)
      ) AS completed,
      count(*) FILTER (WHERE a.status = 'scheduled') AS pending,
      count(*) FILTER (WHERE a.status = 'scheduled' AND a.due_date < now()) AS overdue
    FROM public.crm_activities a
    WHERE a.assigned_to IN (SELECT id FROM agents)
      AND (p_organization_id IS NULL OR a.organization_id = p_organization_id)
    GROUP BY a.assigned_to
  ),
  inquiry_stats AS (
    SELECT
      l.sales_agent_id AS agent_id,
      count(*) FILTER (
        WHERE li.sent_at IS NOT NULL
          AND (p_from IS NULL OR li.sent_at >= p_from)
          AND (p_to IS NULL OR li.sent_at < p_to)
      ) AS submitted,
      count(*) FILTER (
        WHERE li.approval_status IN ('sent', 'sent_to_admin', 'calculated_by_admin')
      ) AS pending
    FROM public.lead_inquiries li
    JOIN public.leads l ON l.id = li.lead_id
    WHERE l.sales_agent_id IN (SELECT id FROM agents)
      AND (p_organization_id IS NULL OR li.organization_id = p_organization_id)
      AND COALESCE(li.is_current_version, true)
    GROUP BY l.sales_agent_id
  ),
  decision_stats AS (
    SELECT
      e.sales_agent_id AS agent_id,
      count(DISTINCT e.inquiry_id) FILTER (WHERE e.event_type = 'approved') AS approved,
      count(DISTINCT e.inquiry_id) FILTER (WHERE e.event_type = 'rejected') AS rejected
    FROM public.inquiry_workflow_events e
    WHERE e.sales_agent_id IN (SELECT id FROM agents)
      AND e.event_type IN ('approved', 'rejected')
      AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
      AND (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
    GROUP BY e.sales_agent_id
  ),
  quotation_stats AS (
    SELECT
      q.salesperson_id AS agent_id,
      count(*) FILTER (
        WHERE (p_from IS NULL OR q.created_at >= p_from)
          AND (p_to IS NULL OR q.created_at < p_to)
      ) AS created,
      count(*) FILTER (
        WHERE q.sent_to_customer_at IS NOT NULL
          AND (p_from IS NULL OR q.sent_to_customer_at >= p_from)
          AND (p_to IS NULL OR q.sent_to_customer_at < p_to)
      ) AS sent,
      count(*) FILTER (WHERE q.status = 'quotation') AS open
    FROM public.quotations q
    WHERE q.salesperson_id IN (SELECT id FROM agents)
      AND (p_organization_id IS NULL OR q.organization_id = p_organization_id)
    GROUP BY q.salesperson_id
  )
  SELECT
    a.id,
    COALESCE(cs.total_contacts, 0),
    COALESCE(cs.new_contacts, 0),
    COALESCE(fs.scheduled, 0),
    COALESCE(fs.completed, 0),
    COALESCE(fs.pending, 0),
    COALESCE(fs.overdue, 0),
    COALESCE(ins.submitted, 0),
    COALESCE(ins.pending, 0),
    COALESCE(ds.approved, 0),
    COALESCE(ds.rejected, 0),
    COALESCE(qs.created, 0),
    COALESCE(qs.sent, 0),
    COALESCE(qs.open, 0)
  FROM agents a
  LEFT JOIN contact_stats cs ON cs.agent_id = a.id
  LEFT JOIN followup_stats fs ON fs.agent_id = a.id
  LEFT JOIN inquiry_stats ins ON ins.agent_id = a.id
  LEFT JOIN decision_stats ds ON ds.agent_id = a.id
  LEFT JOIN quotation_stats qs ON qs.agent_id = a.id;
$$;

-- ---------------------------------------------------------------------------
-- Operations: overview (single row)
-- received, submitted_to_admin, approved, rejected, flagged and the averages
-- count within the period. at_operations, with_admin and admin_calculating are
-- the current queues and ignore the date filter.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_operations_overview(
  p_organization_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
  received bigint,
  submitted_to_admin bigint,
  approved bigint,
  rejected bigint,
  flagged bigint,
  at_operations bigint,
  with_admin bigint,
  admin_calculating bigint,
  avg_operations_seconds numeric,
  avg_admin_decision_seconds numeric,
  avg_turnaround_seconds numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH events AS (
    SELECT e.inquiry_id, e.event_type
    FROM public.inquiry_workflow_events e
    WHERE (p_organization_id IS NULL OR e.organization_id = p_organization_id)
      AND (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
  ),
  counts AS (
    SELECT
      count(DISTINCT inquiry_id) FILTER (WHERE event_type = 'submitted') AS received,
      count(DISTINCT inquiry_id) FILTER (WHERE event_type = 'operations_submitted') AS submitted_to_admin,
      count(DISTINCT inquiry_id) FILTER (WHERE event_type = 'approved') AS approved,
      count(DISTINCT inquiry_id) FILTER (WHERE event_type = 'rejected') AS rejected,
      count(DISTINCT inquiry_id) FILTER (WHERE event_type = 'flagged') AS flagged
    FROM events
  ),
  queues AS (
    SELECT
      count(*) FILTER (WHERE li.approval_status = 'sent') AS at_operations,
      count(*) FILTER (WHERE li.approval_status = 'sent_to_admin') AS with_admin,
      count(*) FILTER (WHERE li.approval_status = 'calculated_by_admin') AS admin_calculating
    FROM public.lead_inquiries li
    WHERE (p_organization_id IS NULL OR li.organization_id = p_organization_id)
      AND COALESCE(li.is_current_version, true)
  ),
  averages AS (
    SELECT
      avg(t.operations_seconds) FILTER (
        WHERE NOT t.admin_calculated
          AND (p_from IS NULL OR t.first_operations_submitted_at >= p_from)
          AND (p_to IS NULL OR t.first_operations_submitted_at < p_to)
      ) AS operations,
      avg(t.admin_decision_seconds) FILTER (
        WHERE (p_from IS NULL OR t.decided_at >= p_from)
          AND (p_to IS NULL OR t.decided_at < p_to)
      ) AS admin_decision,
      avg(t.turnaround_seconds) FILTER (
        WHERE (p_from IS NULL OR t.decided_at >= p_from)
          AND (p_to IS NULL OR t.decided_at < p_to)
      ) AS turnaround
    FROM public.analytics_inquiry_timings t
    WHERE p_organization_id IS NULL OR t.organization_id = p_organization_id
  )
  SELECT
    c.received, c.submitted_to_admin, c.approved, c.rejected, c.flagged,
    q.at_operations, q.with_admin, q.admin_calculating,
    round(a.operations::numeric, 0),
    round(a.admin_decision::numeric, 0),
    round(a.turnaround::numeric, 0)
  FROM counts c, queues q, averages a;
$$;

-- ---------------------------------------------------------------------------
-- Operations: one row per person who submitted work
-- There is no assignment in the workflow, so a person is credited only for
-- inquiries they submitted or flagged. Pending work is a shared team queue.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_operations_employee_metrics(
  p_organization_id uuid DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_actor text DEFAULT NULL
)
RETURNS TABLE (
  actor text,
  inquiries_processed bigint,
  submissions bigint,
  approved bigint,
  rejected bigint,
  flags_raised bigint,
  avg_operations_seconds numeric
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH work AS (
    SELECT lower(e.actor) AS actor, e.inquiry_id, e.occurred_at
    FROM public.inquiry_workflow_events e
    WHERE e.event_type = 'operations_submitted'
      AND e.actor IS NOT NULL
      AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
      AND (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND (p_actor IS NULL OR lower(e.actor) = lower(p_actor))
  ),
  flags AS (
    SELECT lower(e.actor) AS actor, count(*) AS raised
    FROM public.inquiry_workflow_events e
    WHERE e.event_type = 'flagged'
      AND e.actor_role = 'operations'
      AND e.actor IS NOT NULL
      AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
      AND (p_from IS NULL OR e.occurred_at >= p_from)
      AND (p_to IS NULL OR e.occurred_at < p_to)
      AND (p_actor IS NULL OR lower(e.actor) = lower(p_actor))
    GROUP BY lower(e.actor)
  ),
  per_actor AS (
    SELECT
      w.actor,
      count(DISTINCT w.inquiry_id) AS inquiries_processed,
      count(*) AS submissions,
      count(DISTINCT w.inquiry_id) FILTER (WHERE t.decision = 'approved') AS approved,
      count(DISTINCT w.inquiry_id) FILTER (WHERE t.decision = 'rejected') AS rejected,
      round(avg(t.operations_seconds) FILTER (
        WHERE NOT t.admin_calculated AND w.occurred_at = t.first_operations_submitted_at
      )::numeric, 0) AS avg_operations_seconds
    FROM work w
    LEFT JOIN public.analytics_inquiry_timings t ON t.inquiry_id = w.inquiry_id
    GROUP BY w.actor
  )
  SELECT
    COALESCE(p.actor, f.actor),
    COALESCE(p.inquiries_processed, 0),
    COALESCE(p.submissions, 0),
    COALESCE(p.approved, 0),
    COALESCE(p.rejected, 0),
    COALESCE(f.raised, 0),
    p.avg_operations_seconds
  FROM per_actor p
  FULL JOIN flags f ON f.actor = p.actor;
$$;

-- ---------------------------------------------------------------------------
-- Daily trend for charts. Filter by agent (Sales) or actor (Operations).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.analytics_daily_series(
  p_from timestamptz,
  p_to timestamptz,
  p_timezone text DEFAULT 'Asia/Karachi',
  p_organization_id uuid DEFAULT NULL,
  p_sales_agent_id uuid DEFAULT NULL,
  p_actor text DEFAULT NULL
)
RETURNS TABLE (
  day date,
  contacts_added bigint,
  followups_completed bigint,
  quotations_sent bigint,
  inquiries_received bigint,
  operations_submitted bigint,
  approved bigint,
  rejected bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH days AS (
    SELECT generate_series(
      (p_from AT TIME ZONE p_timezone)::date,
      ((p_to - interval '1 microsecond') AT TIME ZONE p_timezone)::date,
      interval '1 day'
    )::date AS day
  ),
  points AS (
    SELECT (c.created_at AT TIME ZONE p_timezone)::date AS day, 'contacts_added' AS metric
    FROM public.contacts c
    WHERE c.created_at >= p_from AND c.created_at < p_to
      AND p_actor IS NULL
      AND (p_organization_id IS NULL OR c.organization_id = p_organization_id)
      AND (p_sales_agent_id IS NULL OR c.salesperson_id = p_sales_agent_id)
      AND (c.parent_id IS NULL OR c.company_type = 'person')
    UNION ALL
    SELECT (a.completed_at AT TIME ZONE p_timezone)::date, 'followups_completed'
    FROM public.crm_activities a
    WHERE a.status = 'done'
      AND a.completed_at >= p_from AND a.completed_at < p_to
      AND p_actor IS NULL
      AND (p_organization_id IS NULL OR a.organization_id = p_organization_id)
      AND (p_sales_agent_id IS NULL OR a.assigned_to = p_sales_agent_id)
    UNION ALL
    SELECT (q.sent_to_customer_at AT TIME ZONE p_timezone)::date, 'quotations_sent'
    FROM public.quotations q
    WHERE q.sent_to_customer_at >= p_from AND q.sent_to_customer_at < p_to
      AND p_actor IS NULL
      AND (p_organization_id IS NULL OR q.organization_id = p_organization_id)
      AND (p_sales_agent_id IS NULL OR q.salesperson_id = p_sales_agent_id)
    UNION ALL
    SELECT (e.occurred_at AT TIME ZONE p_timezone)::date,
      CASE e.event_type
        WHEN 'submitted' THEN 'inquiries_received'
        ELSE e.event_type
      END
    FROM public.inquiry_workflow_events e
    WHERE e.occurred_at >= p_from AND e.occurred_at < p_to
      AND e.event_type IN ('submitted', 'operations_submitted', 'approved', 'rejected')
      AND (p_organization_id IS NULL OR e.organization_id = p_organization_id)
      AND (p_sales_agent_id IS NULL OR e.sales_agent_id = p_sales_agent_id)
      AND (p_actor IS NULL OR lower(e.actor) = lower(p_actor))
  )
  SELECT
    d.day,
    count(p.metric) FILTER (WHERE p.metric = 'contacts_added'),
    count(p.metric) FILTER (WHERE p.metric = 'followups_completed'),
    count(p.metric) FILTER (WHERE p.metric = 'quotations_sent'),
    count(p.metric) FILTER (WHERE p.metric = 'inquiries_received'),
    count(p.metric) FILTER (WHERE p.metric = 'operations_submitted'),
    count(p.metric) FILTER (WHERE p.metric = 'approved'),
    count(p.metric) FILTER (WHERE p.metric = 'rejected')
  FROM days d
  LEFT JOIN points p ON p.day = d.day
  GROUP BY d.day
  ORDER BY d.day;
$$;

REVOKE ALL ON FUNCTION public.analytics_sales_agent_metrics(uuid, timestamptz, timestamptz, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_operations_overview(uuid, timestamptz, timestamptz) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_operations_employee_metrics(uuid, timestamptz, timestamptz, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.analytics_daily_series(timestamptz, timestamptz, text, uuid, uuid, text) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.analytics_sales_agent_metrics(uuid, timestamptz, timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_operations_overview(uuid, timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_operations_employee_metrics(uuid, timestamptz, timestamptz, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.analytics_daily_series(timestamptz, timestamptz, text, uuid, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
