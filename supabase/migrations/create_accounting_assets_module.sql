-- =====================================================
-- Accounting Phase 3 — Fixed Assets Management (Odoo-style)
-- Idempotent. Integrates with accounting_journal_entries.
-- =====================================================

-- Extend JE source_type for asset events
ALTER TABLE public.accounting_journal_entries
  DROP CONSTRAINT IF EXISTS accounting_journal_entries_source_type_check;

ALTER TABLE public.accounting_journal_entries
  ADD CONSTRAINT accounting_journal_entries_source_type_check
  CHECK (
    source_type IS NULL
    OR source_type IN (
      'manual',
      'customer_invoice',
      'customer_payment',
      'credit_note',
      'vendor_bill',
      'vendor_payment',
      'asset_purchase',
      'asset_depreciation',
      'asset_disposal'
    )
  );

-- Sequences
CREATE TABLE IF NOT EXISTS public.accounting_asset_sequences (
  organization_id UUID PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'FA',
  next_number INTEGER NOT NULL DEFAULT 1 CHECK (next_number > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Asset categories
CREATE TABLE IF NOT EXISTS public.accounting_asset_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'declining_balance', 'manual')),
  useful_life_months INTEGER NOT NULL DEFAULT 36 CHECK (useful_life_months > 0),
  method_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (method_period IN ('monthly', 'yearly')),
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  asset_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  depreciation_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  expense_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_asset_categories_org
  ON public.accounting_asset_categories (organization_id, name);

-- Assets
CREATE TABLE IF NOT EXISTS public.accounting_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  asset_number TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  category_id UUID REFERENCES public.accounting_asset_categories(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'fully_depreciated', 'disposed', 'cancelled')),
  vendor_name TEXT,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  purchase_reference TEXT,
  purchase_date DATE,
  acquisition_date DATE NOT NULL DEFAULT CURRENT_DATE,
  original_value NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (original_value >= 0),
  salvage_value NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (salvage_value >= 0),
  book_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  accumulated_depreciation NUMERIC(14, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'PKR',
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line'
    CHECK (depreciation_method IN ('straight_line', 'declining_balance', 'manual')),
  method_period TEXT NOT NULL DEFAULT 'monthly'
    CHECK (method_period IN ('monthly', 'yearly')),
  useful_life_months INTEGER NOT NULL DEFAULT 36 CHECK (useful_life_months > 0),
  depreciation_number INTEGER NOT NULL DEFAULT 36 CHECK (depreciation_number > 0),
  first_depreciation_date DATE,
  end_depreciation_date DATE,
  journal_id UUID REFERENCES public.journals(id) ON DELETE SET NULL,
  asset_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  depreciation_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  expense_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  purchase_journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  disposed_at TIMESTAMPTZ,
  disposal_date DATE,
  disposal_value NUMERIC(14, 2),
  disposal_journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  notes TEXT,
  created_by TEXT,
  updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_assets_org_number
  ON public.accounting_assets (organization_id, asset_number);

CREATE INDEX IF NOT EXISTS idx_accounting_assets_org_status
  ON public.accounting_assets (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_accounting_assets_category
  ON public.accounting_assets (category_id);

CREATE INDEX IF NOT EXISTS idx_accounting_assets_acquisition
  ON public.accounting_assets (organization_id, acquisition_date DESC);

-- Depreciation board / schedule lines
CREATE TABLE IF NOT EXISTS public.accounting_asset_depreciations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.accounting_assets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL DEFAULT 1,
  period_label TEXT NOT NULL DEFAULT '',
  depreciation_date DATE NOT NULL,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  remaining_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'posted', 'cancelled')),
  journal_entry_id UUID
    REFERENCES public.accounting_journal_entries(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  posted_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_accounting_asset_depr_asset
  ON public.accounting_asset_depreciations (asset_id, sequence);

CREATE INDEX IF NOT EXISTS idx_accounting_asset_depr_status
  ON public.accounting_asset_depreciations (organization_id, status, depreciation_date);

-- Activity logs
CREATE TABLE IF NOT EXISTS public.accounting_asset_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES public.accounting_assets(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT,
  performed_by TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_asset_logs_asset
  ON public.accounting_asset_logs (asset_id, performed_at DESC);

-- Seed default categories (global / null org — usable by all orgs as templates)
INSERT INTO public.accounting_asset_categories (name, code, useful_life_months, depreciation_method)
SELECT v.name, v.code, v.months, 'straight_line'
FROM (VALUES
  ('Furniture', 'FURN', 60),
  ('Vehicles', 'VEH', 60),
  ('Machinery', 'MACH', 84),
  ('Office Equipment', 'OFF', 36),
  ('Computer Equipment', 'IT', 36),
  ('Buildings', 'BLDG', 240),
  ('Software', 'SOFT', 36),
  ('Other Fixed Assets', 'OTHER', 60)
) AS v(name, code, months)
WHERE NOT EXISTS (
  SELECT 1 FROM public.accounting_asset_categories c
  WHERE c.organization_id IS NULL AND c.code = v.code
);

-- RLS
ALTER TABLE public.accounting_asset_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_asset_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_asset_depreciations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_asset_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_asset_sequences;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_asset_categories;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_assets;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_asset_depreciations;
DROP POLICY IF EXISTS "Full access for service role" ON public.accounting_asset_logs;

CREATE POLICY "Full access for service role"
ON public.accounting_asset_sequences FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_asset_categories FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_assets FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_asset_depreciations FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Full access for service role"
ON public.accounting_asset_logs FOR ALL USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
