/**
 * Client cache for the All Inquiries list. The CRM shell warms it in the
 * background, so the page paints at once; the page still refreshes it on open.
 * The key is the company switch version, so switching company never shows
 * another company's inquiries.
 */

import { getSalesAllInquiries, type SalesAllInquiryListItem } from '@/app/actions/crm/all-inquiries';

type Result = Awaited<ReturnType<typeof getSalesAllInquiries>>;

let cached: { key: string; inquiries: SalesAllInquiryListItem[] } | null = null;
let inflight: { key: string; promise: Promise<Result> } | null = null;

export function peekAllInquiries(key: string): SalesAllInquiryListItem[] | null {
  return cached?.key === key ? cached.inquiries : null;
}

/** Loads the list once per key at a time; a finished load updates the cache. */
export function loadAllInquiries(key: string): Promise<Result> {
  if (inflight?.key === key) return inflight.promise;
  const promise = getSalesAllInquiries()
    .then((res) => {
      if ('inquiries' in res && res.inquiries) cached = { key, inquiries: res.inquiries };
      return res;
    })
    .finally(() => {
      if (inflight?.promise === promise) inflight = null;
    });
  inflight = { key, promise };
  return promise;
}

/** Background warm-up; errors are ignored because the page loads again on open. */
export function prefetchAllInquiries(key: string) {
  if (peekAllInquiries(key) || inflight?.key === key) return;
  void loadAllInquiries(key).catch(() => undefined);
}
