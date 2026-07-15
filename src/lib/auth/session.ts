'use strict';

import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import {
    INACTIVITY_TIMEOUT_MS,
    SESSION_MAX_AGE_MS,
    SESSION_MAX_AGE_SECONDS,
} from '@/lib/auth/session-config';

const SECRET_KEY = Buffer.from(process.env.SUPABASE_SERVICE_ROLE_KEY || 'default_secret_key_for_development', 'utf-8');

export type SessionRole = 'admin' | 'user' | 'sales_agent' | 'operations' | 'organization';

export type SessionPayload = {
    username: string;
    role: SessionRole;
    organizationName?: string;
    /** Sales-agent module permissions captured at login for instant dashboard chrome. */
    permissions?: string[];
    /** Unix timestamp (ms) of the user's last recorded activity. */
    lastActivity?: number;
    /** Legacy informational field — real expiry is JWT `exp`. */
    expires?: Date;
};

export function getSessionCookieOptions() {
    return {
        expires: new Date(Date.now() + SESSION_MAX_AGE_MS),
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax' as const,
        path: '/',
    };
}

export function isSessionInactive(payload: SessionPayload): boolean {
    const lastActivity = payload.lastActivity;
    if (typeof lastActivity !== 'number' || !Number.isFinite(lastActivity)) {
        // Legacy tokens without lastActivity rely on JWT exp only.
        return false;
    }
    return Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS;
}

export async function encrypt(payload: SessionPayload): Promise<string> {
    const lastActivity = payload.lastActivity ?? Date.now();
    return await new SignJWT({ ...payload, lastActivity })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
        .sign(SECRET_KEY);
}

export async function decrypt(input: string): Promise<SessionPayload> {
    const { payload } = await jwtVerify(input, SECRET_KEY, {
        algorithms: ['HS256'],
    });
    return payload as SessionPayload;
}

/** Safely parse a session token — returns null on expiry, tampering, or inactivity. */
export async function parseSessionToken(token: string): Promise<SessionPayload | null> {
    try {
        const payload = await decrypt(token);
        if (isSessionInactive(payload)) return null;
        return payload;
    } catch {
        return null;
    }
}

export async function getSession(): Promise<SessionPayload | null> {
    const session = (await cookies()).get('session')?.value;
    if (!session) return null;
    return parseSessionToken(session);
}
