alter table inquiry_confirmations
add column if not exists hs_code text default '';

alter table inquiry_confirmations
add column if not exists calculator_values jsonb not null default '{}'::jsonb;
