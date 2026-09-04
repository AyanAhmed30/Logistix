/** True when an opportunity is in the Qualified stage (Send Inquiry eligible). */
export function isCrmQualifiedStage(stageName: string | null | undefined): boolean {
  return String(stageName || '')
    .trim()
    .toLowerCase() === 'qualified';
}

/** CRM inquiry workspace route for an opportunity. */
export function crmOpportunityInquiryUrl(
  opportunityId: string,
  tab: 'create' | 'view' | 'status' = 'create'
): string {
  return `/crm/opportunities/${opportunityId}/inquiry?tab=${tab}`;
}

import { INQUIRY_APPROVAL_STATUS_LABELS } from '@/lib/inquiry-workflow';

export function formatInquiryStatusLabel(status: string | null | undefined): string {
  const raw = String(status || '').trim();
  if (!raw) return '—';
  const mapped =
    INQUIRY_APPROVAL_STATUS_LABELS[raw as keyof typeof INQUIRY_APPROVAL_STATUS_LABELS];
  if (mapped) return mapped;
  return raw
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
