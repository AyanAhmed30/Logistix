/**
 * Validation for the authenticated user's own profile phone number.
 * Stores the trimmed value the user entered (no silent rewrite of valid numbers).
 */

export type UserProfilePhoneResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

const ALLOWED_CHARS = /^[+\d\s().\-]+$/;

export function normalizeUserProfilePhone(raw: string): UserProfilePhoneResult {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Enter your phone number.' };
  }
  if (!ALLOWED_CHARS.test(trimmed)) {
    return { ok: false, error: 'Phone number contains invalid characters.' };
  }

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return {
      ok: false,
      error: 'Enter a valid phone number (7–15 digits).',
    };
  }

  return { ok: true, value: trimmed };
}
