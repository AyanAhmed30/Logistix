import {
  getAllInquiriesForOperations,
  getOperationsInquiriesBootstrap,
  type LeadInquiryWithLead,
} from '@/app/actions/inquiries';

type OperationsInquiriesPage = {
  inquiries: LeadInquiryWithLead[];
  hasMore: boolean;
  nextOffset: number;
};

type BootstrapCacheEntry = OperationsInquiriesPage & {
  calculatorValues: Record<string, string>;
};

const CLIENT_CACHE_TTL_MS = 30000;

let bootstrapCache: {
  search: string;
  organizationId: string | null;
  fetchedAt: number;
  data: BootstrapCacheEntry;
} | null = null;

function isFresh(entry: { fetchedAt: number }) {
  return Date.now() - entry.fetchedAt < CLIENT_CACHE_TTL_MS;
}

export function getCachedOperationsBootstrap(
  search = '',
  organizationId: string | null = null
) {
  if (
    !bootstrapCache ||
    bootstrapCache.search !== search ||
    bootstrapCache.organizationId !== (organizationId ?? null) ||
    !isFresh(bootstrapCache)
  ) {
    return null;
  }
  return bootstrapCache.data;
}

export function setCachedOperationsBootstrap(
  search: string,
  data: BootstrapCacheEntry,
  organizationId: string | null = null
) {
  bootstrapCache = {
    search,
    organizationId: organizationId ?? null,
    fetchedAt: Date.now(),
    data,
  };
}

export function invalidateCachedOperationsBootstrap() {
  bootstrapCache = null;
}

export async function prefetchOperationsInquiries(
  search = '',
  organizationId: string | null = null
) {
  const cached = getCachedOperationsBootstrap(search, organizationId);
  if (cached) return cached;

  const result = await getOperationsInquiriesBootstrap({
    limit: 20,
    offset: 0,
    search,
  });

  if ('error' in result) {
    throw new Error(result.error);
  }

  const entry: BootstrapCacheEntry = {
    inquiries: result.inquiries,
    hasMore: result.hasMore,
    nextOffset: result.nextOffset,
    calculatorValues: result.calculatorValues,
  };
  setCachedOperationsBootstrap(search, entry, organizationId);
  return entry;
}

export async function prefetchOperationsInquiriesList(
  search = '',
  organizationId: string | null = null
) {
  const cached = getCachedOperationsBootstrap(search, organizationId);
  if (cached) {
    return {
      inquiries: cached.inquiries,
      hasMore: cached.hasMore,
      nextOffset: cached.nextOffset,
    } satisfies OperationsInquiriesPage;
  }

  const result = await getAllInquiriesForOperations({
    limit: 20,
    offset: 0,
    search,
  });

  if ('error' in result) {
    throw new Error(result.error);
  }

  return result;
}
