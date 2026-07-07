/**
 * Normalize Pakistani mobile numbers to canonical digits: 923XXXXXXXXX (12 digits).
 * Strips whitespace, hyphens, parentheses, and "+" before comparison.
 */
export function normalizePhoneDigits(raw: string): string {
  return (raw ?? '').trim().replace(/[^\d]/g, '');
}

export type NormalizePakistaniPhoneResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const PAKISTAN_MOBILE_CANONICAL = /^923\d{9}$/;

/**
 * Convert supported Pakistani phone formats to one canonical value (digits only, 92 prefix).
 *
 * Examples that all become 923001234567:
 * - 03001234567
 * - +923001234567
 * - 92 3001234567
 * - 0300-1234567
 */
export function normalizePakistaniPhone(raw: string): NormalizePakistaniPhoneResult {
  let digits = normalizePhoneDigits(raw);

  if (!digits) {
    return { ok: false, error: 'Phone number is required.' };
  }

  // International dial prefix 00 (e.g. 00923001234567)
  if (digits.startsWith('0092')) {
    digits = digits.slice(2);
  }

  let canonical: string;

  if (digits.length === 11 && digits.startsWith('0')) {
    canonical = `92${digits.slice(1)}`;
  } else if (digits.length === 10 && digits.startsWith('3')) {
    canonical = `92${digits}`;
  } else if (digits.startsWith('92')) {
    canonical = digits;
  } else {
    return {
      ok: false,
      error: 'Enter a valid Pakistani mobile number (e.g. 03001234567).',
    };
  }

  if (!PAKISTAN_MOBILE_CANONICAL.test(canonical)) {
    return {
      ok: false,
      error: 'Enter a valid Pakistani mobile number (e.g. 03001234567).',
    };
  }

  return { ok: true, value: canonical };
}

/**
 * Preserve how the user entered the number for display/storage while duplicate checks
 * use the canonical digits-only value.
 */
export function formatLeadPhoneForStorage(original: string, canonical: string): string {
  const trimmed = (original ?? '').trim();

  if (trimmed.startsWith('+')) {
    return `+${canonical}`;
  }

  const digits = normalizePhoneDigits(trimmed);
  if (digits.length === 11 && digits.startsWith('0')) {
    return digits;
  }

  return canonical;
}

/** Development-only duplicate-check logging (disabled in production). */
export function debugLeadPhoneDuplicate(payload: {
  original: string;
  normalized: string;
  query: string;
  matchingLeadId?: string | null;
}) {
  if (process.env.NODE_ENV !== 'development') return;
  console.log('[lead-phone-duplicate]', payload);
}
