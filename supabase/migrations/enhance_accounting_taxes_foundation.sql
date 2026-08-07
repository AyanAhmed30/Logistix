-- =====================================================
-- Accounting Foundation — Taxes (Odoo-style Tax Engine)
-- Extends existing taxes table. Idempotent.
-- =====================================================

-- Tax groups (Odoo account.tax.group)
CREATE TABLE IF NOT EXISTS public.tax_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 10,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tax_groups_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_groups_shared_name_lower
  ON public.tax_groups (lower(name))
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tax_groups_org_name_lower
  ON public.tax_groups (organization_id, lower(name))
  WHERE organization_id IS NOT NULL;

ALTER TABLE public.tax_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Full access for service role" ON public.tax_groups;
CREATE POLICY "Full access for service role"
  ON public.tax_groups FOR ALL USING (true) WITH CHECK (true);

-- Enhance taxes master
ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS organization_id UUID
    REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS tax_group_id UUID
    REFERENCES public.tax_groups(id) ON DELETE SET NULL;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS invoice_label TEXT;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS description TEXT;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS sequence INTEGER NOT NULL DEFAULT 10;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS amount_type TEXT;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS scope TEXT;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS refund_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS created_by TEXT;

ALTER TABLE public.taxes
  ADD COLUMN IF NOT EXISTS updated_by TEXT;

-- amount_type: percent | fixed (mirror rate_type for Odoo naming)
UPDATE public.taxes
SET amount_type = CASE
  WHEN rate_type = 'fixed' THEN 'fixed'
  ELSE 'percent'
END
WHERE amount_type IS NULL;

ALTER TABLE public.taxes
  DROP CONSTRAINT IF EXISTS taxes_amount_type_check;

ALTER TABLE public.taxes
  ADD CONSTRAINT taxes_amount_type_check
  CHECK (amount_type IS NULL OR amount_type IN ('percent', 'fixed'));

-- scope: sale | purchase | none (service)
UPDATE public.taxes
SET scope = CASE
  WHEN type = 'purchase_tax' THEN 'purchase'
  WHEN type = 'withholding_tax' THEN 'none'
  ELSE 'sale'
END
WHERE scope IS NULL;

ALTER TABLE public.taxes
  DROP CONSTRAINT IF EXISTS taxes_scope_check;

ALTER TABLE public.taxes
  ADD CONSTRAINT taxes_scope_check
  CHECK (scope IS NULL OR scope IN ('sale', 'purchase', 'none'));

-- Org-aware unique code (replace global unique if present)
ALTER TABLE public.taxes DROP CONSTRAINT IF EXISTS taxes_code_key;
DROP INDEX IF EXISTS taxes_code_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_taxes_shared_code
  ON public.taxes (code)
  WHERE organization_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_taxes_org_code
  ON public.taxes (organization_id, code)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_taxes_org_active
  ON public.taxes (organization_id, is_active, type, sequence);

CREATE INDEX IF NOT EXISTS idx_taxes_group
  ON public.taxes (tax_group_id)
  WHERE tax_group_id IS NOT NULL;

-- Make account_id nullable for drafts (legacy rows keep NOT NULL if already set)
DO $$
BEGIN
  ALTER TABLE public.taxes ALTER COLUMN account_id DROP NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

-- Seed default tax group
INSERT INTO public.tax_groups (name, sequence, organization_id, is_active)
SELECT 'GST', 10, NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tax_groups WHERE lower(name) = 'gst' AND organization_id IS NULL
);

INSERT INTO public.tax_groups (name, sequence, organization_id, is_active)
SELECT 'VAT', 20, NULL, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.tax_groups WHERE lower(name) = 'vat' AND organization_id IS NULL
);

-- Seed default taxes (shared) — skip if code exists
INSERT INTO public.taxes (
  name, code, type, rate_type, rate_value, is_inclusive, account_id,
  is_active, organization_id, tax_group_id, invoice_label, amount_type, scope, sequence
)
SELECT
  'GST Sales 18%',
  'GST_S_18',
  'sales_tax',
  'percentage',
  18,
  false,
  (SELECT id FROM public.chart_of_accounts WHERE code = '2200' AND organization_id IS NULL LIMIT 1),
  true,
  NULL,
  (SELECT id FROM public.tax_groups WHERE lower(name) = 'gst' AND organization_id IS NULL LIMIT 1),
  'GST 18%',
  'percent',
  'sale',
  10
WHERE NOT EXISTS (
  SELECT 1 FROM public.taxes WHERE code = 'GST_S_18' AND organization_id IS NULL
);

INSERT INTO public.taxes (
  name, code, type, rate_type, rate_value, is_inclusive, account_id,
  is_active, organization_id, tax_group_id, invoice_label, amount_type, scope, sequence,
  refund_account_id
)
SELECT
  'GST Purchase 18%',
  'GST_P_18',
  'purchase_tax',
  'percentage',
  18,
  false,
  (SELECT id FROM public.chart_of_accounts WHERE code IN ('1400', '1300', '1500') AND organization_id IS NULL ORDER BY code LIMIT 1),
  true,
  NULL,
  (SELECT id FROM public.tax_groups WHERE lower(name) = 'gst' AND organization_id IS NULL LIMIT 1),
  'GST 18%',
  'percent',
  'purchase',
  20,
  (SELECT id FROM public.chart_of_accounts WHERE code = '2200' AND organization_id IS NULL LIMIT 1)
WHERE NOT EXISTS (
  SELECT 1 FROM public.taxes WHERE code = 'GST_P_18' AND organization_id IS NULL
);

INSERT INTO public.taxes (
  name, code, type, rate_type, rate_value, is_inclusive, account_id,
  is_active, organization_id, tax_group_id, invoice_label, amount_type, scope, sequence
)
SELECT
  'GST Sales 0%',
  'GST_S_0',
  'sales_tax',
  'percentage',
  0,
  false,
  (SELECT id FROM public.chart_of_accounts WHERE code = '2200' AND organization_id IS NULL LIMIT 1),
  true,
  NULL,
  (SELECT id FROM public.tax_groups WHERE lower(name) = 'gst' AND organization_id IS NULL LIMIT 1),
  'GST 0%',
  'percent',
  'sale',
  30
WHERE NOT EXISTS (
  SELECT 1 FROM public.taxes WHERE code = 'GST_S_0' AND organization_id IS NULL
);

-- Optional tax_id on document lines (keeps legacy taxes % column)
ALTER TABLE public.accounting_customer_invoice_lines
  ADD COLUMN IF NOT EXISTS tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_vendor_bill_lines
  ADD COLUMN IF NOT EXISTS tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_credit_note_lines
  ADD COLUMN IF NOT EXISTS tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_vendor_refund_lines
  ADD COLUMN IF NOT EXISTS tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL;

-- Product default taxes
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'products'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS sales_tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL;
    ALTER TABLE public.products
      ADD COLUMN IF NOT EXISTS purchase_tax_id UUID REFERENCES public.taxes(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoice_lines_tax_id
  ON public.accounting_customer_invoice_lines (tax_id)
  WHERE tax_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bill_lines_tax_id
  ON public.accounting_vendor_bill_lines (tax_id)
  WHERE tax_id IS NOT NULL;
