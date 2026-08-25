"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  LeadInquiryWorkspace,
  type LeadInquiryWorkspaceTab,
} from "@/components/sales-agent/LeadInquiryWorkspace";
import {
  getCrmOpportunityInquiryBootstrap,
  type CrmOpportunityInquiryBootstrap,
} from "@/app/actions/crm/inquiries";
import { setCachedLeadInquiries } from "@/lib/sales-agent-lead-inquiries-cache";
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";
import { ModuleLoadingOverlay } from "@/components/ui/ModuleLoadingOverlay";

function tabFromSearchParams(searchParams: URLSearchParams): LeadInquiryWorkspaceTab | undefined {
  const raw = searchParams.get("tab");
  if (raw === "create" || raw === "view" || raw === "customer" || raw === "status") return raw;
  return undefined;
}

export function CrmOpportunityInquiryClient({
  opportunityId,
  initialBootstrap,
}: {
  opportunityId: string;
  /** Optional preloaded bootstrap (rare); normally loaded client-side for fast navigation. */
  initialBootstrap?: CrmOpportunityInquiryBootstrap | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = tabFromSearchParams(searchParams);
  const initialInquiryId = searchParams.get("inquiryId") || undefined;

  const [bootstrap, setBootstrap] = useState<CrmOpportunityInquiryBootstrap | null>(
    initialBootstrap || null
  );
  const [loading, setLoading] = useState(!initialBootstrap);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialBootstrap) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    void getCrmOpportunityInquiryBootstrap(opportunityId).then((res) => {
      if (cancelled) return;
      if ("error" in res && res.error) {
        setError(res.error);
        setLoading(false);
        toast.error(res.error);
        router.replace(`/crm/opportunities/${opportunityId}`);
        return;
      }
      if ("bootstrap" in res && res.bootstrap) {
        setBootstrap(res.bootstrap);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [opportunityId, initialBootstrap, router]);

  useEffect(() => {
    if (!bootstrap) return;
    setCachedLeadInquiries(bootstrap.lead.id, {
      inquiries: bootstrap.inquiries,
      approvedInquiryId: bootstrap.approvedInquiryId,
    });
  }, [bootstrap]);

  if (loading || !bootstrap) {
    return <ModuleLoadingOverlay label="Inquiry" />;
  }

  if (error) {
    return null;
  }

  const { opportunity, lead, inquiries, approvedInquiryId, allowInquiry } = bootstrap;
  const remountKey = `${opportunity.id}-${initialTab ?? "create"}-${initialInquiryId ?? "none"}-${allowInquiry ? "1" : "0"}`;

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
