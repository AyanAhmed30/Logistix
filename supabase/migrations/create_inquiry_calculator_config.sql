create table if not exists inquiry_calculator_config (
  id text primary key,
  values jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into inquiry_calculator_config (id, values)
values ('shared', '{}'::jsonb)
on conflict (id) do nothing;
