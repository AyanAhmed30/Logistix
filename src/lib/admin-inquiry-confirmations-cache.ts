import {
  getAllInquiryConfirmations,
  type InquiryConfirmationListItem,
} from "@/app/actions/inquiry_confirmations";

export type InquiryConfirmationsCacheEntry = {
  confirmations: InquiryConfirmationListItem[];
  fetchedAt: number;
};

const CLIENT_CACHE_TTL_MS = 120000;
let memoryCache: InquiryConfirmationsCacheEntry | null = null;
let inFlight: Promise<void> | null = null;

function isFresh(entry: InquiryConfirmationsCacheEntry) {
  return Date.now() - entry.fetchedAt < CLIENT_CACHE_TTL_MS;
}

export function getCachedInquiryConfirmations(): InquiryConfirmationsCacheEntry | null {
  if (!memoryCache || !isFresh(memoryCache)) return null;
  return memoryCache;
}

export function setCachedInquiryConfirmations(confirmations: InquiryConfirmationListItem[]) {
  memoryCache = {
    confirmations,
    fetchedAt: Date.now(),
  };
}

export function invalidateCachedInquiryConfirmations() {
  memoryCache = null;
}

export async function prefetchInquiryConfirmationsList() {
  if (getCachedInquiryConfirmations()) return;

  if (inFlight) {
    await inFlight;
    return;
  }

  inFlight = (async () => {
    const result = await getAllInquiryConfirmations();
    if (!("error" in result)) {
      setCachedInquiryConfirmations(result.confirmations || []);
    }
  })();

  try {
    await inFlight;
  } finally {
    inFlight = null;
  }
}
