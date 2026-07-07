-- Speed up admin Inquiry Confirmation list (ordered by newest first).
create index if not exists idx_inquiry_confirmations_created_at_desc
  on public.inquiry_confirmations (created_at desc);
