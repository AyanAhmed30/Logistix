-- =====================================================
-- Run this on project: uoavdzggnqhypdyenigd
-- AFTER columns already exist (ENSURE_PORTAL_USER_SCHEMA)
-- =====================================================
-- Symptom: SQL Editor shows full_name / user_organizations,
-- but the app still says "Missing: app_users.full_name..."
-- Cause: PostgREST API schema cache is stale.
-- =====================================================

NOTIFY pgrst, 'reload schema';
SELECT pg_notify('pgrst', 'reload schema');

-- Optional verify (API still needs ~10–15s after this):
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'app_users'
ORDER BY ordinal_position;

SELECT to_regclass('public.user_organizations') AS user_organizations_table;
