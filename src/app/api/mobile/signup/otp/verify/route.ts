import { NextResponse } from 'next/server';

import { toE164Plus92 } from '@/lib/whatsapp-otp';
import { createAdminClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';

type VerifyBody = {
  phone?: string;
  code?: string;
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
  if (lower.includes('invalid_phone')) return { status: 400, error: 'invalid_phone' };
  if (lower.includes('otp_expired')) return { status: 400, error: 'otp_expired' };
  if (lower.includes('otp_locked')) return { status: 429, error: 'otp_locked' };
  if (lower.includes('otp_invalid')) return { status: 400, error: 'otp_invalid' };
  return { status: 400, error: 'otp_invalid' };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VerifyBody;
    const phone = toE164Plus92(String(body?.phone || ''));
    const code = String(body?.code || '').trim();

    if (!phone) {
      return json({ error: 'invalid_phone' }, 400);
    }
    if (!/^\d{4}$/.test(code)) {
      return json({ error: 'otp_invalid' }, 400);
    }

    const supabase = await createAdminClient();
    const { data, error } = await supabase.rpc('verify_signup_otp', {
      p_phone: phone,
      p_code: code,
    });

    if (error) {
      const mapped = mapRpcError(error.message || '');
      return json({ error: mapped.error }, mapped.status);
    }

    const payload = data as {
      ok?: boolean;
      signup_proof_token?: string;
      expires_at?: string;
      phone?: string;
    } | null;

    const token = String(payload?.signup_proof_token || '');
    if (token.length < 32) {
      return json({ error: 'otp_invalid' }, 400);
    }

    return json({
      ok: true,
      signupProofToken: token,
      expiresAt: payload?.expires_at || null,
      phone: payload?.phone || phone,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'otp_verify_failed';
    if (message.includes('SUPABASE_SERVICE_ROLE_KEY') || message.includes('Missing')) {
      return json({ error: 'server_misconfigured', message }, 503);
    }
    return json({ error: 'otp_verify_failed' }, 500);
  }
}
