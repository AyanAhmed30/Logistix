-- Link legacy Lead Inquiries to CRM Opportunities (Odoo-style CRM integration)
-- Safe to run multiple times.

ALTER TABLE public.lead_inquiries
  ADD COLUMN IF NOT EXISTS crm_opportunity_id UUID
    REFERENCES public.crm_opportunities(id) ON DELETE SET NULL;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS crm_opportunity_id UUID
    REFERENCES public.crm_opportunities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID
    REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_lead_inquiries_crm_opportunity_id
  ON public.lead_inquiries (crm_opportunity_id)
  WHERE crm_opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_crm_opportunity_id
  ON public.leads (crm_opportunity_id)
  WHERE crm_opportunity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_contact_id
  ON public.leads (contact_id)
  WHERE contact_id IS NOT NULL;
