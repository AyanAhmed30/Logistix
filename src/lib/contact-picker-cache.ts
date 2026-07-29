/**
 * Client-side cache for CRM contact picker searches (short TTL).
 */

import type { CustomerSearchResult } from '@/app/actions/contacts';

type Entry = { expiresAt: number; contacts: CustomerSearchResult[] };

const TTL_MS = 45_000;
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<CustomerSearchResult[]>>();

function normalizeKey(scope: string, query: string) {
  return `${scope}:${query.trim().toLowerCase()}`;
}

/** Synchronous cache read — use for instant dropdown open. */
export function peekContactPickerCache(
  scope: 'customer' | 'all' | 'vendor',
  query: string
): CustomerSearchResult[] | null {
  const key = normalizeKey(scope, query);
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.contacts;
  return null;
}

export function invalidateContactPickerCache() {
  cache.clear();
  inflight.clear();
}

export async function getCachedContactPickerResults(
  scope: 'customer' | 'all' | 'vendor',
  query: string,
  fetcher: () => Promise<CustomerSearchResult[] | { error: string }>
): Promise<CustomerSearchResult[]> {
  const key = normalizeKey(scope, query);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.contacts;

  const pending = inflight.get(key);
  if (pending) return pending;

  const promise = fetcher().then((res) => {
    inflight.delete(key);
    if ('error' in res) return [];
    cache.set(key, { contacts: res, expiresAt: now + TTL_MS });
    return res;
  });

  inflight.set(key, promise);
  return promise;
}

/** Warm the cache before the user opens the picker (e.g. when quick-create mounts). */
export async function prefetchContactPickerResults(
  scope: 'customer' | 'all' | 'vendor',
  fetcher: () => Promise<CustomerSearchResult[] | { error: string }>
): Promise<void> {
  await getCachedContactPickerResults(scope, '', fetcher);
}
