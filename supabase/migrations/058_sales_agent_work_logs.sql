-- =============================================================================
-- 058 — Sales agent manual work logs (the "Logs" page) with attachments
--
-- What it does
--   1. sales_agent_work_logs: one row per activity a Sales Agent records
--      (follow-up, WhatsApp, email, call, meeting, quotation follow-up, other),
--      optionally linked to one of the agent's contacts. logged_at is set by
--      the server; there is no edit path in the app.
--      Attachments are listed in the row (attachments jsonb: storage path,
--      file name, type, size); the files live in the private bucket below.
--   2. Storage bucket sales-activity-attachments: PRIVATE (not public). Files
--      are opened only through short-lived signed links that the app creates
--      after checking the viewer's access.
--
-- Safe to run
--   Additive and idempotent. Creates one new table and one new bucket; no
--   existing table, row or bucket is changed or deleted. The table is closed
--   to everything except the service role (the app checks access in its
--   server actions).
-- =============================================================================

create table if not exists public.sales_agent_work_logs (
  id uuid primary key default gen_random_uuid(),
  sales_agent_id uuid not null references public.sales_agents(id) on delete cascade,
  app_user_id uuid references public.app_users(id) on delete set null,
  username text not null,
  organization_id uuid references public.organizations(id) on delete set null,
  activity_type text not null
    check (activity_type in (
      'follow_up', 'whatsapp', 'email', 'phone_call',
      'customer_meeting', 'quotation_follow_up', 'other'
    )),
  -- Only for activity_type = 'other'.
  custom_type text,
  contact_id uuid references public.contacts(id) on delete set null,
  -- Name at the time of logging, so the entry stays readable.
  contact_name text,
  description text not null,
  attachments jsonb not null default '[]'::jsonb,
  -- Recorded by the server when the agent saves.
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists sales_agent_work_logs_agent_time_idx
  on public.sales_agent_work_logs (sales_agent_id, logged_at desc);
create index if not exists sales_agent_work_logs_org_time_idx
  on public.sales_agent_work_logs (organization_id, logged_at desc);
create index if not exists sales_agent_work_logs_contact_idx
  on public.sales_agent_work_logs (contact_id)
  where contact_id is not null;

alter table public.sales_agent_work_logs enable row level security;
revoke all on table public.sales_agent_work_logs from anon, authenticated;
grant all on table public.sales_agent_work_logs to service_role;

-- Private bucket for the attachments (10 MB per file).
insert into storage.buckets (id, name, public, file_size_limit)
values ('sales-activity-attachments', 'sales-activity-attachments', false, 10485760)
on conflict (id) do nothing;

notify pgrst, 'reload schema';
