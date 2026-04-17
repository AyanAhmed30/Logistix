import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getLeadForSalesAgentById } from "@/app/actions/leads";

/** @deprecated Use `/sales-agent/leads/[leadId]` — inquiries live on the lead detail page only. */
export default async function SalesAgentLeadInquiryPageRedirect({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const session = await getSession();
  if (!session || session.role !== "sales_agent") {
    redirect("/login");
  }

  const { leadId } = await params;
  const result = await getLeadForSalesAgentById(leadId);
  if ("error" in result || !result.lead) {
    redirect("/sales-agent/dashboard");
  }

  redirect(`/sales-agent/leads/${leadId}?tab=view`);
}
