import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getSalesAgentLeadDetailBootstrap } from "@/app/actions/leads";
import { LeadDetailPageClient } from "@/components/sales-agent/LeadDetailPageClient";

export default async function SalesAgentLeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "sales_agent") {
    redirect("/login");
  }

  const { leadId } = await params;
  const result = await getSalesAgentLeadDetailBootstrap(leadId);
  if ("error" in result || !result.lead) {
    redirect("/sales-agent/dashboard");
  }

  return (
    <LeadDetailPageClient
      lead={result.lead}
      initialInquiries={result.inquiries}
      initialApprovedInquiryId={result.approvedInquiryId}
    />
  );
}
