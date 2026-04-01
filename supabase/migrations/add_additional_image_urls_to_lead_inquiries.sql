alter table lead_inquiries
add column if not exists additional_image_urls jsonb not null default '[]'::jsonb;
