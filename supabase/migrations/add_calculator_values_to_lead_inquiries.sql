-- Persist calculator configuration per inquiry so Admin and Operations share values.
alter table lead_inquiries
add column if not exists calculator_values jsonb not null default '{}'::jsonb;
