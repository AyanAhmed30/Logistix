-- =====================================================
-- CONTACTS MODULE — Complete Schema (Odoo-style)
-- Purpose:
--   Full contacts directory supporting:
--     - Individual / Company toggle
--     - Structured address (street, street2, city, state, zip, country)
--     - Tags (many-to-many)
--     - Child / related contacts (parent_id self-reference)
--     - Sales & Purchase configuration
--     - Accounting configuration
--     - Notes
--     - Chatter activity log (created / updated / note / message / activity)
--
-- How to apply:
--   Run in Supabase SQL Editor (New query -> paste -> Run).
--   Safe to run multiple times (idempotent).
-- =====================================================

-- -----------------------------------------------------
-- 1. Main contacts table
-- -----------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),

  -- Hierarchy (parent company <-> related contact)
  parent_id uuid references public.contacts(id) on delete cascade,
  contact_kind text not null default 'contact'
    check (contact_kind in ('contact', 'invoice', 'delivery', 'other')),

  -- Identity
  company_type text not null default 'person'
    check (company_type in ('person', 'company')),
  name text not null,
  company_name text,
  job_position text,
  title text,
  image_url text,

  -- Contact information
  email text,
  phone text,
  mobile text,
  website text,

  -- Structured address
  street text,
  street2 text,
  city text,
  state text,
  zip text,
  country text,

  -- Business identity
  tax_id text,
  company_ref text,
  industry text,

  -- Sales & Purchase configuration
  salesperson_id uuid references public.sales_agents(id) on delete set null,
  payment_terms text,
  pricelist text,
  delivery_method text,
  customer_rank integer not null default 0,
  vendor_rank integer not null default 0,
  sales_payment_method text,
  incoterm text,
  incoterm_location text,
  group_rfq text default 'On Order',
  buyer text,
  purchase_payment_terms text,
  purchase_payment_method text,
  receipt_reminder boolean not null default false,

  -- Accounting configuration
  receivable_account text,
  payable_account text,
  tax_settings text,
  fiscal_position text,

  -- Notes
  notes text,

  -- Metadata
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint contacts_name_not_blank check (btrim(name) <> '')
);

create index if not exists idx_contacts_name         on public.contacts (lower(name));
create index if not exists idx_contacts_email        on public.contacts (lower(email));
create index if not exists idx_contacts_parent_id    on public.contacts (parent_id);
create index if not exists idx_contacts_company_type on public.contacts (company_type);
create index if not exists idx_contacts_created_at   on public.contacts (created_at desc);

alter table public.contacts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contacts'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contacts for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 2. Tags catalogue
-- -----------------------------------------------------
create table if not exists public.contact_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#8b5cf6',
  created_at timestamptz not null default now(),
  constraint contact_tags_name_not_blank check (btrim(name) <> '')
);

alter table public.contact_tags enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_tags'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contact_tags for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 3. Many-to-many: contacts <-> tags
-- -----------------------------------------------------
create table if not exists public.contact_tag_links (
  contact_id uuid not null references public.contacts(id)     on delete cascade,
  tag_id     uuid not null references public.contact_tags(id) on delete cascade,
  primary key (contact_id, tag_id)
);

create index if not exists idx_contact_tag_links_contact on public.contact_tag_links (contact_id);
create index if not exists idx_contact_tag_links_tag     on public.contact_tag_links (tag_id);

alter table public.contact_tag_links enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_tag_links'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contact_tag_links for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 4. Chatter / activity log
-- -----------------------------------------------------
create table if not exists public.contact_activity_logs (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  action_type text not null
    check (action_type in ('created', 'updated', 'note', 'message', 'activity', 'tag', 'child_added')),
  body text,
  performed_by text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_contact_activity_logs_contact on public.contact_activity_logs (contact_id);
create index if not exists idx_contact_activity_logs_created on public.contact_activity_logs (created_at desc);

alter table public.contact_activity_logs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contact_activity_logs'
      and policyname = 'Full access for service role'
  ) then
    execute $policy$
      create policy "Full access for service role"
      on public.contact_activity_logs for all
      using (true) with check (true)
    $policy$;
  end if;
end $$;

-- -----------------------------------------------------
-- 5. Auto-update `updated_at` on every UPDATE
-- -----------------------------------------------------
create or replace function public.set_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'trg_contacts_set_updated_at'
      and tgrelid = 'public.contacts'::regclass
  ) then
    execute $trg$
      create trigger trg_contacts_set_updated_at
        before update on public.contacts
        for each row execute function public.set_contacts_updated_at()
    $trg$;
  end if;
end $$;

-- -----------------------------------------------------
-- Done.
-- If the app still shows "Could not find the table 'public.contacts'",
-- reload the PostgREST schema cache in Supabase:
--   Dashboard -> Database -> API Docs -> "Reload schema"
-- or just wait ~10 seconds and refresh the app.
-- -----------------------------------------------------
