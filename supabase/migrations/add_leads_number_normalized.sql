-- Canonical phone normalization for lead duplicate detection (Pakistan mobile numbers).
-- Canonical format: 923XXXXXXXXX (12 digits, country code 92, no symbols).

create or replace function public.normalize_lead_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  d := regexp_replace(coalesce(trim(p_phone), ''), '[^0-9]', '', 'g');

  if length(d) = 0 then
    return null;
  end if;

  if left(d, 4) = '0092' then
    d := substring(d from 3);
  end if;

  if length(d) = 11 and left(d, 1) = '0' then
    return '92' || substring(d from 2);
  end if;

  if length(d) = 10 and left(d, 1) = '3' then
    return '92' || d;
  end if;

  if left(d, 2) = '92' then
    return d;
  end if;

  return null;
end;
$$;

alter table public.leads
  add column if not exists number_normalized text;

update public.leads
set number_normalized = public.normalize_lead_phone(number)
where number_normalized is null
   or number_normalized <> public.normalize_lead_phone(number);

create index if not exists idx_leads_number_normalized
  on public.leads (number_normalized)
  where number_normalized is not null;

-- Exact duplicate lookup on normalized phone (no LIKE / partial matching).
create or replace function public.find_lead_by_normalized_phone(
  p_phone text,
  p_exclude_id uuid default null
)
returns table (
  id uuid,
  name text,
  lead_id_formatted text
)
language sql
stable
as $$
  select l.id, l.name, l.lead_id_formatted
  from public.leads l
  where public.normalize_lead_phone(l.number) = public.normalize_lead_phone(p_phone)
    and public.normalize_lead_phone(p_phone) is not null
    and (p_exclude_id is null or l.id <> p_exclude_id)
  order by l.created_at asc
  limit 1;
$$;

revoke all on function public.find_lead_by_normalized_phone(text, uuid) from public;
grant execute on function public.find_lead_by_normalized_phone(text, uuid) to service_role;
