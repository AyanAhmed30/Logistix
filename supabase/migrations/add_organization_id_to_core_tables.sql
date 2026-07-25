-- Multi-organization data isolation: organization_id on core business tables
-- Run on project matching .env.local (uoavdzggnqhypdyenigd)

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations') THEN
    -- Sales
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'leads') THEN
      ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_leads_organization_id ON public.leads (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
      ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_customers_organization_id ON public.customers (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contacts') THEN
      ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON public.contacts (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'quotations') THEN
      ALTER TABLE public.quotations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_quotations_organization_id ON public.quotations (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'lead_inquiries') THEN
      ALTER TABLE public.lead_inquiries ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_lead_inquiries_organization_id ON public.lead_inquiries (organization_id);
    END IF;

    -- Operations
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'orders') THEN
      ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_orders_organization_id ON public.orders (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'consoles') THEN
      ALTER TABLE public.consoles ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_consoles_organization_id ON public.consoles (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'packing_lists') THEN
      ALTER TABLE public.packing_lists ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_packing_lists_organization_id ON public.packing_lists (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'import_invoices') THEN
      ALTER TABLE public.import_invoices ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_import_invoices_organization_id ON public.import_invoices (organization_id);
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'inquiry_confirmations') THEN
      ALTER TABLE public.inquiry_confirmations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_inquiry_confirmations_organization_id ON public.inquiry_confirmations (organization_id);
    END IF;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
