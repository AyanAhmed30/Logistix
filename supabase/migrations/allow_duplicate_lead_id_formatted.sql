-- Allow multiple leads to share the same lead_id_formatted (duplicate phone → same lead number).
-- Keep a non-unique index for lookups.

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'leads_lead_id_formatted_key'
  ) then
    alter table public.leads drop constraint leads_lead_id_formatted_key;
  end if;
end $$;

create index if not exists idx_leads_lead_id_formatted
  on public.leads (lead_id_formatted);
