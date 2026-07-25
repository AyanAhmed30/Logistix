-- Grant Warehouse module access to existing app_users who have order history
-- but no Sales / Operations / Warehouse permissions yet (legacy warehouse accounts).

UPDATE public.app_users au
SET permissions = '[
  "warehouse-book-order",
  "warehouse-history",
  "warehouse-scan-progress",
  "warehouse-loading-instruction",
  "warehouse"
]'::jsonb
WHERE EXISTS (
  SELECT 1 FROM public.orders o WHERE o.username = au.username
)
AND (
  au.permissions IS NULL
  OR au.permissions = '[]'::jsonb
  OR jsonb_array_length(COALESCE(au.permissions, '[]'::jsonb)) = 0
);
