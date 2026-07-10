alter table public.organizations
  add column if not exists logo_url text,
  add column if not exists street text not null default '',
  add column if not exists street_2 text not null default '',
  add column if not exists state text not null default '',
  add column if not exists zip text not null default '',
  add column if not exists website text not null default '',
  add column if not exists branches jsonb not null default '[]'::jsonb;
