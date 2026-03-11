/**
 * WhatsApp Integration
 *
 * Two modes:
 *   1. WhatsApp Business Cloud API (automatic sending) — if env vars are set
 *   2. WhatsApp Web fallback (opens WhatsApp with pre-filled message) — if env vars are NOT set
 *
 * For automatic sending, set these in .env.local:
 *   WHATSAPP_PHONE_NUMBER_ID  – Your WhatsApp Business phone-number ID
 *   WHATSAPP_ACCESS_TOKEN     – Access token from Meta dashboard
 */

const GRAPH_API_VERSION = 'v21.0';

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  /** When true, the API isn't configured — frontend should open WhatsApp Web instead */
  useWebFallback?: boolean;
  error?: string;
}

/**
 * Check if the WhatsApp Business Cloud API credentials are configured.
 */
export function isWhatsAppApiConfigured(): boolean {
  return !!(process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_ACCESS_TOKEN);
}

/**
 * Send a text message to a WhatsApp number via the Cloud API.
 * Returns { useWebFallback: true } if credentials are not set.
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<WhatsAppSendResult> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  // If credentials are not set, signal the frontend to use WhatsApp Web
  if (!phoneNumberId || !accessToken) {
    console.log('[WhatsApp] API credentials not configured — using WhatsApp Web fallback.');
    return {
      success: true, // Not an error — just a different delivery method
      useWebFallback: true,
    };
  }

  // Clean the phone number — digits only
  const cleanPhone = to.replace(/[^0-9]/g, '');
  if (!cleanPhone || cleanPhone.length < 10) {
    return {
      success: false,
      error: `Invalid phone number: "${to}". Provide a number with country code (e.g. 923001234567).`,
    };
  }

  const url = `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: cleanPhone,
    type: 'text',
    text: {
      preview_url: false,
      body: message,
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    if (!response.ok) {
      const apiError =
        data?.error?.message ||
        data?.error?.error_user_msg ||
        `HTTP ${response.status}: ${response.statusText}`;
      console.error('[WhatsApp] API error:', JSON.stringify(data, null, 2));
      return {
        success: false,
        error: `WhatsApp API error: ${apiError}`,
      };
    }

    const messageId = data?.messages?.[0]?.id || null;
    console.log('[WhatsApp] Message sent successfully. ID:', messageId);
    return {
      success: true,
      messageId,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Unknown network error';
    console.error('[WhatsApp] Network error:', errMsg);
    return {
      success: false,
      error: `Failed to connect to WhatsApp API: ${errMsg}`,
    };
  }
}
