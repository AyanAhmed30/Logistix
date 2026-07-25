/**
 * Sales ↔ CRM integration bridge.
 * Prefill paths: /sales/quotations/new?opportunityId=...
 */

export type SalesQuotationFromOpportunityInput = {
  opportunityId: string;
  contactId?: string | null;
  organizationId: string;
  salespersonId?: string | null;
};

export function salesQuotationNewUrlFromOpportunity(opportunityId: string) {
  return `/sales/quotations/new?opportunityId=${encodeURIComponent(opportunityId)}`;
}

export function buildQuotationDraftFromOpportunity(
  input: SalesQuotationFromOpportunityInput
): { ready: true; href: string } {
  return {
    ready: true,
    href: salesQuotationNewUrlFromOpportunity(input.opportunityId),
  };
}
