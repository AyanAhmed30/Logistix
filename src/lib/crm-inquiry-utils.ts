/** True when an opportunity is in the Qualified stage (Send Inquiry eligible). */
export function isCrmQualifiedStage(stageName: string | null | undefined): boolean {
  return String(stageName || '')
    .trim()
    .toLowerCase() === 'qualified';
}

/** CRM inquiry workspace route for an opportunity. */
export function crmOpportunityInquiryUrl(
  opportunityId: string,
  tab: 'create' | 'view' | 'customer' | 'status' = 'create',
  inquiryId?: string | null
): string {
  const params = new URLSearchParams({ tab });
  if (inquiryId) params.set('inquiryId', inquiryId);
  return `/crm/opportunities/${opportunityId}/inquiry?${params.toString()}`;
}

import {
  INQUIRY_APPROVAL_STATUS_LABELS,
  formatInquiryApprovalDisplayLabel,
  type InquiryApprovalStatus,
} from '@/lib/inquiry-workflow';

export function formatInquiryStatusLabel(
  status: string | null | undefined,
  options?: { calculatedByAdmin?: boolean }
): string {
  const raw = String(status || '').trim();
  if (!raw) return '—';
  const mapped =
    INQUIRY_APPROVAL_STATUS_LABELS[raw as keyof typeof INQUIRY_APPROVAL_STATUS_LABELS];
  if (mapped) {
    if (
      options?.calculatedByAdmin &&
      (raw === 'approved' || raw === 'rejected')
    ) {
      return formatInquiryApprovalDisplayLabel({
        approvalStatus: raw as InquiryApprovalStatus,
        calculatedByAdmin: true,
      });
    }
    return mapped;
  }
  return raw
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
