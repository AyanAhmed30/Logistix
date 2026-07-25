-- Optional: keep your existing column name (recommended).
-- Your app now uses `default_organization` — NO rename required.
-- Just reload the API schema cache:

NOTIFY pgrst, 'reload schema';

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_users'
ORDER BY ordinal_position;
