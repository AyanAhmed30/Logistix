-- STEP 042 â€” Allow empty "Other details" on customer inquiry submit
-- lead_inquiries.description is NOT NULL DEFAULT ''.
-- Mobile RPCs were inserting NULL when notes were blank, which violates NOT NULL.
-- This trigger normalizes NULL â†’ '' so submit works with or without other details.
-- Safe to re-run (CREATE OR REPLACE only; no DROP).

create or replace function public.trg_lead_inquiries_normalize_description()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.description := coalesce(new.description, '');
  return new;
end;
$$;

create or replace trigger trg_lead_inquiries_normalize_description
  before insert or update
  on public.lead_inquiries
  for each row
  execute function public.trg_lead_inquiries_normalize_description();
