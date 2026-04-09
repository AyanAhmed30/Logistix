-- Safe COA enhancement for logistics accounting.
-- Rules followed:
-- - No delete
-- - No rename
-- - No type changes on existing rows
-- - Only add missing accounts
-- - Safely deactivate dummy/test accounts

-- ----------------------------------------
-- Parent anchors (fallback-safe)
-- ----------------------------------------
-- Income parent: prefer 4000 (Income group), fallback NULL
-- Expense parent: prefer 5000 (Expenses group), fallback NULL
-- Asset parent: prefer 1000 (Assets group), fallback NULL

-- ----------------------------------------
-- Revenue accounts (income)
-- ----------------------------------------
insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Freight Revenue',
  '4001',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4001'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Freight Revenue')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Customs Clearance Revenue',
  '4002',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4002'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Customs Clearance Revenue')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Delivery Revenue',
  '4003',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4003'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Delivery Revenue')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'DDP Service Revenue',
  '4004',
  'income',
  (select id from public.chart_of_accounts where code = '4000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '4004'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('DDP Service Revenue')
);

-- ----------------------------------------
-- Cost accounts (expense)
-- ----------------------------------------
insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Freight Cost',
  '5001',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5001'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Freight Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Customs Duty Cost',
  '5002',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5002'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Customs Duty Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Clearance Cost',
  '5003',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5003'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Clearance Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Delivery Cost',
  '5004',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5004'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Delivery Cost')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Warehouse Cost',
  '5005',
  'expense',
  (select id from public.chart_of_accounts where code = '5000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '5005'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Warehouse Cost')
);

-- ----------------------------------------
-- Supporting asset accounts
-- ----------------------------------------
insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Prepaid Freight',
  '1203',
  'asset',
  (select id from public.chart_of_accounts where code = '1000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '1203'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Prepaid Freight')
);

insert into public.chart_of_accounts (name, code, type, parent_id, allow_reconciliation, is_active)
select
  'Prepaid Duty',
  '1204',
  'asset',
  (select id from public.chart_of_accounts where code = '1000' limit 1),
  false,
  true
where not exists (
  select 1 from public.chart_of_accounts where code = '1204'
)
and not exists (
  select 1 from public.chart_of_accounts where lower(name) = lower('Prepaid Duty')
);

-- ----------------------------------------
-- Safe cleanup: deactivate known dummy/test accounts
-- ----------------------------------------
update public.chart_of_accounts
set is_active = false,
    updated_at = now()
where is_active = true
  and (
    lower(name) = 'my account'
    or lower(name) = 'testing purpose'
  );
