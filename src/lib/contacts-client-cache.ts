/**
 * Client-side memoization for Contacts list loads (per org + refresh generation
 * + page/filter key). Source counts are cached per search/date key so paging
 * does not re-count.
 */

import type { ContactWithRelations, ContactsSourceCounts } from '@/app/actions/contacts';

type ContactsListResult =
  | {
      contacts: ContactWithRelations[];
      totalCount?: number;
      page?: number;
      pageSize?: number;
      sourceCounts?: ContactsSourceCounts | null;
      createdAtGte?: string | null;
      createdAtLt?: string | null;
    }
  | { error: string };

type CacheEntry = {
  expiresAt: number;
  data: ContactsListResult;
};

const CACHE_TTL_MS = 120_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ContactsListResult>>();
const sourceCountsCache = new Map<string, ContactsSourceCounts>();

function hasUsableCustomerIds(data: ContactsListResult): boolean {
  if (!('contacts' in data) || !data.contacts.length) return true;
  // Reject stale cache entries that painted every Customer ID as "—"
  return data.contacts.some((c) => /^\d{6}$/.test(String(c.lead_id_formatted || '').trim()));
}

export function invalidateContactsClientCache() {
  cache.clear();
  inflight.clear();
  sourceCountsCache.clear();
}

/** Synchronous peek — used to paint the table immediately. */
export function peekContactsClientCache(cacheKey: string): ContactsListResult | null {
  const hit = cache.get(cacheKey);
  if (!hit) return null;
  if (!hasUsableCustomerIds(hit.data)) {
    cache.delete(cacheKey);
    return null;
  }
  return hit.data;
}

export function peekContactsSourceCounts(countsKey: string): ContactsSourceCounts | null {
  return sourceCountsCache.get(countsKey) ?? null;
}

export function rememberContactsSourceCounts(countsKey: string, counts: ContactsSourceCounts) {
  sourceCountsCache.set(countsKey, counts);
}

export async function getCachedContactsList(
  cacheKey: string,
  fetcher: () => Promise<ContactsListResult>,
  options?: { force?: boolean }
): Promise<ContactsListResult> {
  const now = Date.now();
  const hit = cache.get(cacheKey);
  if (
    !options?.force &&
    hit &&
    hit.expiresAt > now &&
    hasUsableCustomerIds(hit.data)
  ) {
    return hit.data;
  }

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const promise = fetcher().then((result) => {
    inflight.delete(cacheKey);
    if (!('error' in result && result.error) && hasUsableCustomerIds(result)) {
      cache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    } else if (!('error' in result && result.error)) {
      // Still cache briefly so we don't hammer, but short TTL until IDs exist
      cache.set(cacheKey, { data: result, expiresAt: Date.now() + 5_000 });
    }
    return result;
  });

  inflight.set(cacheKey, promise);
  return promise;
}
