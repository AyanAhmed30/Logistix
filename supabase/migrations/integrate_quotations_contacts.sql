-- =====================================================
-- Integrate Quotations module with Contacts module.
--
-- - Adds `contact_id` on quotations (FK -> contacts.id)
-- - Keeps the legacy `customer_name` + `partner_id` columns
--   so existing data / flows stay intact.
-- - Backfill: when a quotation's customer_name matches
--   exactly one active contact name, link it automatically.
--
-- Safe to run multiple times.
-- =====================================================

-- 1. Add the column + index
alter table public.quotations
  add column if not exists contact_id uuid references public.contacts(id) on delete set null;

create index if not exists idx_quotations_contact_id
  on public.quotations(contact_id);

-- 2. Best-effort backfill for historic rows with a unique name match
with unique_contact as (
  select lower(trim(name)) as normalized_name,
         min(id::text)::uuid as contact_id
  from public.contacts
  group by lower(trim(name))
  having count(*) = 1
)
update public.quotations q
set contact_id = u.contact_id
from unique_contact u
where q.contact_id is null
  and lower(trim(q.customer_name)) = u.normalized_name;
