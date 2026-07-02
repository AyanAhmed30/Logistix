import type { LeadInquiry } from "@/app/actions/inquiries";
import { getInquiriesForLead } from "@/app/actions/inquiries";

export type LeadInquiriesCacheEntry = {
  inquiries: LeadInquiry[];
  approvedInquiryId: string | null;
  fetchedAt: number;
};

const CLIENT_CACHE_TTL_MS = 30000;

const cache = new Map<string, LeadInquiriesCacheEntry>();

function isFresh(entry: LeadInquiriesCacheEntry) {
  return Date.now() - entry.fetchedAt < CLIENT_CACHE_TTL_MS;
}

export function getCachedLeadInquiries(leadId: string): LeadInquiriesCacheEntry | null {
  const entry = cache.get(leadId);
  if (!entry || !isFresh(entry)) return null;
  return entry;
}

export function setCachedLeadInquiries(
  leadId: string,
  data: Omit<LeadInquiriesCacheEntry, "fetchedAt">
) {
  cache.set(leadId, {
    ...data,
    fetchedAt: Date.now(),
  });
}

export function invalidateCachedLeadInquiries(leadId?: string) {
  if (leadId) {
    cache.delete(leadId);
    return;
  }
  cache.clear();
}

export async function prefetchLeadInquiries(leadId: string) {
  if (!leadId || getCachedLeadInquiries(leadId)) return;
  const result = await getInquiriesForLead(leadId);
  if ("error" in result) return;
  setCachedLeadInquiries(leadId, {
    inquiries: result.inquiries || [],
    approvedInquiryId:
      ("approvedInquiryId" in result ? result.approvedInquiryId : null) || null,
  });
}
