import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getSalesAgentLeadDetailBootstrap } from "@/app/actions/leads";
import { LeadDetailPageClient } from "@/components/sales-agent/LeadDetailPageClient";
import { sessionHasSalesAccess } from "@/lib/auth/require-access";

export default async function SalesAgentLeadDetailPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    redirect("/access-denied");
  }

  const { leadId } = await params;
  const result = await getSalesAgentLeadDetailBootstrap(leadId);
  if ("error" in result || !result.lead) {
    redirect(session.role === "user" ? "/user/dashboard" : "/sales-agent/dashboard");
  }

  return (
    <LeadDetailPageClient
      lead={result.lead}
      initialInquiries={result.inquiries}
      initialApprovedInquiryId={result.approvedInquiryId}
    />
  );
}
