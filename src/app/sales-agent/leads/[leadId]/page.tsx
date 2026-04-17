import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getLeadForSalesAgentById } from "@/app/actions/leads";
import { LeadDetailPageClient } from "@/components/sales-agent/LeadDetailPageClient";
import { Suspense } from "react";

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
  const result = await getLeadForSalesAgentById(leadId);
  if ("error" in result || !result.lead) {
    redirect("/sales-agent/dashboard");
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-slate-50 flex items-center justify-center text-sm text-slate-500">Loading lead…</div>}>
      <LeadDetailPageClient lead={result.lead} />
    </Suspense>
  );
}
