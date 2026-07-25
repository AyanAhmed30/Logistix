"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  LeadInquiryWorkspace,
  type LeadInquiryWorkspaceTab,
} from "@/components/sales-agent/LeadInquiryWorkspace";
import type { CrmOpportunityInquiryBootstrap } from "@/app/actions/crm/inquiries";
import { setCachedLeadInquiries } from "@/lib/sales-agent-lead-inquiries-cache";
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";

function tabFromSearchParams(searchParams: URLSearchParams): LeadInquiryWorkspaceTab | undefined {
  const raw = searchParams.get("tab");
  if (raw === "create" || raw === "view" || raw === "status") return raw;
  return undefined;
}

export function CrmOpportunityInquiryClient({
  bootstrap,
}: {
  bootstrap: CrmOpportunityInquiryBootstrap;
}) {
  const searchParams = useSearchParams();
  const initialTab = tabFromSearchParams(searchParams);
  const initialInquiryId = searchParams.get("inquiryId") || undefined;
  const { opportunity, lead, inquiries, approvedInquiryId, allowInquiry } = bootstrap;

  const remountKey = `${opportunity.id}-${initialTab ?? "create"}-${initialInquiryId ?? "none"}-${allowInquiry ? "1" : "0"}`;

  useEffect(() => {
    setCachedLeadInquiries(lead.id, {
      inquiries,
      approvedInquiryId,
    });
  }, [lead.id, inquiries, approvedInquiryId]);

  return (
    <ClientErrorBoundary
      resetKey={remountKey}
      title="Inquiry workspace unavailable"
      description="Something went wrong while loading inquiries for this opportunity."
    >
      <div className="-mx-1 bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden min-h-[calc(100vh-180px)]">
        <LeadInquiryWorkspace
          key={remountKey}
          lead={lead}
          mode="view"
          active
          layout="crm"
          initialMainTab={initialTab ?? (allowInquiry ? "create" : "view")}
          initialInquiryId={initialInquiryId}
          allowInquiry={allowInquiry}
          boardStatus={opportunity.stage_name}
          initialInquiryBootstrap={{ inquiries, approvedInquiryId }}
          crmContext={{
            opportunityId: opportunity.id,
            opportunityName: opportunity.name,
            stageName: opportunity.stage_name,
            customerName: opportunity.customer_name,
            contactPersonName: opportunity.contact_person_name,
            email: opportunity.email,
            phone: opportunity.phone || opportunity.mobile,
            salespersonName: opportunity.salesperson_name,
            backHref: `/crm/opportunities/${opportunity.id}`,
          }}
        />
      </div>
    </ClientErrorBoundary>
  );
}
