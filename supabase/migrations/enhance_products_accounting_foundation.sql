-- =====================================================
-- Products ↔ Accounting foundation (Odoo-style)
-- Income/Expense accounts, customer/vendor taxes, sale/purchase flags.
-- Also persists product_id on transactional document lines for JE posting.
-- Idempotent. Preserves existing product data.
-- =====================================================

-- Product can be sold / purchased (Odoo sale_ok / purchase_ok)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sale_ok BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_ok BOOLEAN NOT NULL DEFAULT true;

-- Product type + inventory stubs (future Inventory module)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'goods';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_product_type_check;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_check
  CHECK (product_type IN ('goods', 'service', 'combo'));

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS track_inventory BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight NUMERIC(14, 4) NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS volume NUMERIC(14, 6) NOT NULL DEFAULT 0;

-- Chart of Accounts links
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS income_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS expense_account_id UUID
    REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

-- Single-tax FKs (may already exist from taxes foundation)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS sales_tax_id UUID
    REFERENCES public.taxes(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS purchase_tax_id UUID
    REFERENCES public.taxes(id) ON DELETE SET NULL;

-- Multi-tax selections (Odoo-style many2many stored as arrays)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS customer_tax_ids UUID[] NOT NULL DEFAULT '{}';

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS vendor_tax_ids UUID[] NOT NULL DEFAULT '{}';

-- Backfill arrays from legacy single FKs
UPDATE public.products
SET customer_tax_ids = ARRAY[sales_tax_id]
WHERE sales_tax_id IS NOT NULL
  AND (customer_tax_ids IS NULL OR cardinality(customer_tax_ids) = 0);

UPDATE public.products
SET vendor_tax_ids = ARRAY[purchase_tax_id]
WHERE purchase_tax_id IS NOT NULL
  AND (vendor_tax_ids IS NULL OR cardinality(vendor_tax_ids) = 0);

-- Keep primary FKs in sync with first array entry when missing
UPDATE public.products
SET sales_tax_id = customer_tax_ids[1]
WHERE sales_tax_id IS NULL
  AND customer_tax_ids IS NOT NULL
  AND cardinality(customer_tax_ids) > 0;

UPDATE public.products
SET purchase_tax_id = vendor_tax_ids[1]
WHERE purchase_tax_id IS NULL
  AND vendor_tax_ids IS NOT NULL
  AND cardinality(vendor_tax_ids) > 0;

CREATE INDEX IF NOT EXISTS idx_products_income_account
  ON public.products (income_account_id)
  WHERE income_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_expense_account
  ON public.products (expense_account_id)
  WHERE expense_account_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_sale_ok
  ON public.products (organization_id, sale_ok)
  WHERE active = true AND sale_ok = true;

CREATE INDEX IF NOT EXISTS idx_products_purchase_ok
  ON public.products (organization_id, purchase_ok)
  WHERE active = true AND purchase_ok = true;

-- Persist product on transactional lines (JE uses product income/expense accounts)
ALTER TABLE public.accounting_customer_invoice_lines
  ADD COLUMN IF NOT EXISTS product_id UUID
    REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_credit_note_lines
  ADD COLUMN IF NOT EXISTS product_id UUID
    REFERENCES public.products(id) ON DELETE SET NULL;

ALTER TABLE public.accounting_vendor_bill_lines
  ADD COLUMN IF NOT EXISTS product_id UUID
    REFERENCES public.products(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'accounting_vendor_refund_lines'
  ) THEN
    ALTER TABLE public.accounting_vendor_refund_lines
      ADD COLUMN IF NOT EXISTS product_id UUID
        REFERENCES public.products(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_aci_lines_product
  ON public.accounting_customer_invoice_lines (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_acn_lines_product
  ON public.accounting_credit_note_lines (product_id)
  WHERE product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_avb_lines_product
  ON public.accounting_vendor_bill_lines (product_id)
  WHERE product_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
