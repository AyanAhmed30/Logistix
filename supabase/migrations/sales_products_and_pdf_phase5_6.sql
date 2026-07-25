-- =====================================================
-- Sales Products Module + Quotation line product_id
-- Idempotent. Preserves existing data.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  sequence INTEGER NOT NULL DEFAULT 10,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_categories_org
  ON public.product_categories (organization_id, name);

CREATE TABLE IF NOT EXISTS public.product_uoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_uoms_org
  ON public.product_uoms (organization_id, code);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  default_code TEXT,
  category_id UUID REFERENCES public.product_categories(id) ON DELETE SET NULL,
  uom_id UUID REFERENCES public.product_uoms(id) ON DELETE SET NULL,
  uom TEXT NOT NULL DEFAULT 'Units',
  list_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  standard_price NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  description_sale TEXT,
  image_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_org_name
  ON public.products (organization_id, name);

CREATE INDEX IF NOT EXISTS idx_products_org_active
  ON public.products (organization_id, active);

CREATE INDEX IF NOT EXISTS idx_products_default_code
  ON public.products (organization_id, default_code);

-- Link quotation lines to products (nullable for legacy free-text lines)
ALTER TABLE public.quotation_lines
  ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES public.products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quotation_lines_product_id
  ON public.quotation_lines (product_id);

-- Seed default UOMs when table is empty (global / null org defaults)
INSERT INTO public.product_uoms (organization_id, name, code)
SELECT NULL, v.name, v.code
FROM (
  VALUES
    ('Units', 'Units'),
    ('Piece', 'Piece'),
    ('Kg', 'Kg'),
    ('Box', 'Box'),
    ('Hour', 'Hour'),
    ('pcs / u', 'pcs / u'),
    ('m³', 'm³'),
    ('pairs (2u)', 'pairs (2u)')
) AS v(name, code)
WHERE NOT EXISTS (SELECT 1 FROM public.product_uoms LIMIT 1);

-- RLS
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_uoms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
