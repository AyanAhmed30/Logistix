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

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-12 rounded-lg border border-rose-200 bg-rose-50 p-6 text-center">
        <p className="text-sm font-semibold text-rose-900">Unable to open inquiry</p>
        <p className="text-sm text-rose-800 mt-2">{error}</p>
        <button
          type="button"
          className="mt-4 text-sm font-medium text-[#017e84] hover:underline"
          onClick={() => router.push(`/crm/opportunities/${opportunityId}`)}
        >
          Back to opportunity
        </button>
      </div>
    );
  }

  if (loading || !bootstrap) {
    return <ModuleLoadingOverlay label="Inquiry" />;
  }

  const { opportunity, lead, inquiries, approvedInquiryId, allowInquiry } = bootstrap;
  const boundInquiryId = initialInquiryId || opportunity.lead_inquiry_id || undefined;
  const defaultTab: LeadInquiryWorkspaceTab =
    initialTab ??
    (boundInquiryId ? "view" : allowInquiry ? "create" : "view");
  const remountKey = `${opportunity.id}-${defaultTab}-${boundInquiryId ?? "none"}-${allowInquiry ? "1" : "0"}`;

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
          initialMainTab={defaultTab}
          initialInquiryId={boundInquiryId}
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
