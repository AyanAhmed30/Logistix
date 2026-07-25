import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getLeadForSalesAgentById } from "@/app/actions/leads";
import { sessionHasSalesAccess } from "@/lib/auth/require-access";

/** @deprecated Use `/sales-agent/leads/[leadId]` — inquiries live on the lead detail page only. */
export default async function SalesAgentLeadInquiryPageRedirect({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await getSession();
  if (!session || !sessionHasSalesAccess(session)) {
    redirect("/access-denied");
  }

  const { leadId } = await params;
  const result = await getLeadForSalesAgentById(leadId);
  if ("error" in result || !result.lead) {
    redirect(session.role === "user" ? "/user/dashboard" : "/sales-agent/dashboard");
  }

  redirect(`/sales-agent/leads/${leadId}?tab=view`);
}
