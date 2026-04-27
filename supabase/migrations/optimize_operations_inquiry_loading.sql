-- Performance hardening for Operations Inquiry loading path.
-- Safe, idempotent indexes targeted at the high-traffic query patterns.

create extension if not exists pg_trgm;

create index if not exists idx_lead_inquiries_ops_feed
  on public.lead_inquiries (sent_to_accounting, sent_at desc, id);

create index if not exists idx_lead_inquiries_lead_id
  on public.lead_inquiries (lead_id);

create index if not exists idx_inquiry_confirmations_inquiry_created
  on public.inquiry_confirmations (inquiry_id, created_at desc);

create index if not exists idx_lead_inquiries_search_product_name_trgm
  on public.lead_inquiries using gin (product_name gin_trgm_ops);

create index if not exists idx_lead_inquiries_search_description_trgm
  on public.lead_inquiries using gin (description gin_trgm_ops);

create index if not exists idx_leads_search_name_trgm
  on public.leads using gin (name gin_trgm_ops);

create index if not exists idx_leads_search_number_trgm
  on public.leads using gin (number gin_trgm_ops);

create index if not exists idx_leads_search_source_trgm
  on public.leads using gin (source gin_trgm_ops);

create index if not exists idx_leads_search_formatted_trgm
  on public.leads using gin (lead_id_formatted gin_trgm_ops);
