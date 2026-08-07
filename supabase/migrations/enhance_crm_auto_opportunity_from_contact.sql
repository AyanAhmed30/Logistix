-- =====================================================
-- Contact → CRM auto-opportunity: at most one per contact
-- source = 'contact_auto' marks Opportunities created by
-- ensureAutoOpportunityForNewContact after Contact create.
-- Idempotent. Does not affect manually created Opportunities.
-- =====================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_opportunities_one_auto_per_contact
  ON public.crm_opportunities (organization_id, contact_id)
  WHERE source = 'contact_auto'
    AND contact_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_crm_opportunities_contact_source
  ON public.crm_opportunities (organization_id, contact_id, source)
  WHERE contact_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
