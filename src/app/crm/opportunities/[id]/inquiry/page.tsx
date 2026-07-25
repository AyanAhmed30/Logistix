import { redirect } from "next/navigation";
import { requireCrmPageAccess } from "@/lib/crm-page-access";
import { getCrmOpportunityInquiryBootstrap } from "@/app/actions/crm/inquiries";
import { CrmOpportunityInquiryClient } from "@/components/crm/CrmOpportunityInquiryClient";

export default async function CrmOpportunityInquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireCrmPageAccess("crm-pipeline");

  const { id } = await params;
  const result = await getCrmOpportunityInquiryBootstrap(id);
  if ("error" in result) {
    redirect(`/crm/opportunities/${id}`);
  }

  return <CrmOpportunityInquiryClient bootstrap={result.bootstrap} />;
}
