alter table public.inquiry_confirmations
  add column if not exists operations_additional_image_urls jsonb not null default '[]'::jsonb;
