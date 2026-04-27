alter table public.inquiry_confirmations
add column if not exists rejection_reason text;

alter table public.inquiry_confirmations
add column if not exists sales_additional_image_urls jsonb not null default '[]'::jsonb;
