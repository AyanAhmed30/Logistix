"use client";

import { useSearchParams } from "next/navigation";
import type { Lead } from "@/app/actions/leads";
import { LeadInquiryWorkspace, type LeadInquiryWorkspaceTab } from "@/components/sales-agent/LeadInquiryWorkspace";

function tabFromSearchParams(searchParams: URLSearchParams): LeadInquiryWorkspaceTab | undefined {
  const raw = searchParams.get("tab");
  if (raw === "create" || raw === "view" || raw === "status") return raw;
  if (searchParams.get("inquiry") === "create") return "create";
  return undefined;
}

export function LeadDetailPageClient({ lead }: { lead: Lead }) {
  const searchParams = useSearchParams();
  const initialTab = tabFromSearchParams(searchParams);
  const initialInquiryId = searchParams.get("inquiryId") || undefined;
  const remountKey = `${lead.id}-${initialTab ?? "default"}`;
  
  // Get workflow constraint information from URL params
  const allowInquiry = searchParams.get("allowInquiry") === "true";
  const boardStatus = searchParams.get("boardStatus") || lead.status;

  return (
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
    />
  );
}
