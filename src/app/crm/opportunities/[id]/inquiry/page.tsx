import { requireCrmPageAccess } from "@/lib/crm-page-access";
import { CrmOpportunityInquiryClient } from "@/components/crm/CrmOpportunityInquiryClient";

/**
 * Auth-only server gate. Bootstrap loads on the client so navigation from
 * Pipeline → Send Inquiry feels instant (loader shows immediately).
 */
export default async function CrmOpportunityInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCrmPageAccess("crm-pipeline");
  const { id } = await params;
  return <CrmOpportunityInquiryClient opportunityId={id} />;
}
