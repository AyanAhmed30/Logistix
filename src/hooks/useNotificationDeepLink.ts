"use client";

import { useSearchParams } from "next/navigation";

export type NotificationDeepLink = {
  tab: string | null;
  opsTab: string | null;
  confirmationId: string | null;
  leadId: string | null;
  inquiryId: string | null;
};

export function useNotificationDeepLink(): NotificationDeepLink {
  const searchParams = useSearchParams();
  return {
    tab: searchParams.get("tab"),
    opsTab: searchParams.get("opsTab"),
    confirmationId: searchParams.get("confirmationId"),
    leadId: searchParams.get("leadId"),
    inquiryId: searchParams.get("inquiryId"),
  };
}
