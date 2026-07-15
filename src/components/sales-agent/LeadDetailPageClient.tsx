"use client";

import { useSearchParams } from "next/navigation";
import type { Lead, LeadDetailBootstrap } from "@/app/actions/leads";
import { LeadInquiryWorkspace, type LeadInquiryWorkspaceTab } from "@/components/sales-agent/LeadInquiryWorkspace";
import { setCachedLeadInquiries } from "@/lib/sales-agent-lead-inquiries-cache";
import { useEffect } from "react";
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";

function tabFromSearchParams(searchParams: URLSearchParams): LeadInquiryWorkspaceTab | undefined {
  const raw = searchParams.get("tab");
  if (raw === "create" || raw === "view" || raw === "status") return raw;
  if (searchParams.get("inquiry") === "create") return "create";
  return undefined;
}

export function LeadDetailPageClient({
  lead,
  initialInquiries,
  initialApprovedInquiryId,
}: {
  lead: Lead;
  initialInquiries?: LeadDetailBootstrap["inquiries"];
  initialApprovedInquiryId?: string | null;
}) {
  const searchParams = useSearchParams();
  const initialTab = tabFromSearchParams(searchParams);
  const initialInquiryId = searchParams.get("inquiryId") || undefined;
  const allowInquiry = searchParams.get("allowInquiry") === "true";
  const boardStatus = searchParams.get("boardStatus") || lead.status;
  const remountKey = `${lead.id}-${initialTab ?? "default"}-${initialInquiryId ?? "none"}-${allowInquiry ? "1" : "0"}-${boardStatus}`;

  useEffect(() => {
    if (!initialInquiries) return;
    setCachedLeadInquiries(lead.id, {
      inquiries: initialInquiries,
      approvedInquiryId: initialApprovedInquiryId ?? null,
    });
  }, [lead.id, initialInquiries, initialApprovedInquiryId]);

  return (
    <ClientErrorBoundary
      resetKey={remountKey}
      title="Lead workspace unavailable"
      description="Something went wrong while loading this lead. Try again or return to your dashboard."
    >
      <LeadInquiryWorkspace
        key={remountKey}
        lead={lead}
        mode="view"
        active
        layout="page"
        initialMainTab={initialTab}
        initialInquiryId={initialInquiryId}
        allowInquiry={allowInquiry}
        boardStatus={boardStatus}
        initialInquiryBootstrap={
          initialInquiries
            ? {
                inquiries: initialInquiries,
                approvedInquiryId: initialApprovedInquiryId ?? null,
              }
            : undefined
        }
      />
    </ClientErrorBoundary>
  );
}
