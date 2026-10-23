import { NextResponse } from 'next/server';

import {
  SIGNUP_OTP_COOLDOWN_SECONDS,
  deliverSignupOtpWhatsApp,
  toE164Plus92,
} from '@/lib/whatsapp-otp';
import { createAdminClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type SendBody = {
  phone?: string;
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

function mapRpcError(message: string): { status: number; error: string } {
  const lower = message.toLowerCase();
  if (lower.includes('invalid_phone')) {
    return { status: 400, error: 'invalid_phone' };
  }
  if (lower.includes('duplicate_phone')) {
    return { status: 409, error: 'duplicate_phone' };
  }
  if (lower.includes('otp_cooldown')) {
    const match = message.match(/otp_cooldown:(\d+)/i);
    const seconds = match ? Number(match[1]) : SIGNUP_OTP_COOLDOWN_SECONDS;
    return { status: 429, error: `otp_cooldown:${seconds}` };
  }
  return { status: 400, error: 'otp_send_failed' };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendBody;
    const phone = toE164Plus92(String(body?.phone || ''));
    if (!phone) {
      return json({ error: 'invalid_phone' }, 400);
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase.rpc('create_signup_otp', {
      p_phone: phone,
    });

    if (error) {
      const mapped = mapRpcError(error.message || '');
      return json({ error: mapped.error }, mapped.status);
    }

    const payload = data as {
      ok?: boolean;
      code?: string;
      phone?: string;
      expires_at?: string;
      cooldown_seconds?: number;
    } | null;

    const code = String(payload?.code || '');
    if (!/^\d{4}$/.test(code)) {
      return json({ error: 'otp_send_failed' }, 500);
    }

    const delivery = await deliverSignupOtpWhatsApp(phone, code);
    if (!delivery.ok) {
      // Invalidate the OTP we just created so an undelivered code cannot be used.
      await supabase
        .from('signup_phone_otps')
        .update({ invalidated_at: new Date().toISOString() })
        .eq('phone', payload?.phone || phone)
        .is('consumed_at', null)
        .is('invalidated_at', null);

      return json(
        {
          error: delivery.missingConfig ? 'whatsapp_not_configured' : 'otp_send_failed',
          message: delivery.error,
        },
        delivery.missingConfig ? 503 : 502
      );
    }

    // Never return the OTP code to the client.
    return json({
      ok: true,
      phone: payload?.phone || phone,
      expiresAt: payload?.expires_at || null,
      cooldownSeconds: payload?.cooldown_seconds ?? SIGNUP_OTP_COOLDOWN_SECONDS,
      message: 'A 4-digit verification code has been sent to your WhatsApp.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'otp_send_failed';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Missing')) {
      return json({ error: 'server_misconfigured', message }, 503);
    }
    return json({ error: 'otp_send_failed' }, 500);
  }
}
