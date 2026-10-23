/**
 * WhatsApp OTP for mobile signup.
 * Sender display number is hardcoded (product requirement).
 * Graph API credentials stay in WHATSAPP_* env vars only.
 */

import { isWhatsAppApiConfigured, sendWhatsAppMessage } from '@/lib/whatsapp';
import { normalizePakistaniPhone } from '@/lib/pakistan-phone';

/** Hardcoded sender WhatsApp number — do not move to .env */
export const WHATSAPP_OTP_SENDER_NUMBER = '03004676787';

export const SIGNUP_OTP_COOLDOWN_SECONDS = 60;

export function toE164Plus92(raw: string): string | null {
  const normalized = normalizePakistaniPhone(raw);
  if (!normalized.ok) return null;
  return `+${normalized.value}`;
}

export function buildSignupOtpWhatsAppMessage(code: string): string {
  return (
    `Logistix verification code: ${code}\n\n` +
    `This code expires in 10 minutes. Do not share it with anyone.\n` +
    `Sent via WhatsApp from ${WHATSAPP_OTP_SENDER_NUMBER}.`
  );
}

export async function deliverSignupOtpWhatsApp(
  phoneE164: string,
  code: string
): Promise<{ ok: true; messageId?: string } | { ok: false; error: string; missingConfig?: boolean }> {
  if (!isWhatsAppApiConfigured()) {
    return {
      ok: false,
      missingConfig: true,
      error:
        'WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN on the backend.',
    };
  }

  const result = await sendWhatsAppMessage(phoneE164, buildSignupOtpWhatsAppMessage(code));

  if (result.useWebFallback) {
    return {
      ok: false,
      missingConfig: true,
      error:
        'WhatsApp API is not configured. Set WHATSAPP_PHONE_NUMBER_ID and WHATSAPP_ACCESS_TOKEN on the backend.',
    };
  }

  if (!result.success) {
    return { ok: false, error: result.error || 'Failed to send WhatsApp OTP.' };
  }

  return { ok: true, messageId: result.messageId };
}
