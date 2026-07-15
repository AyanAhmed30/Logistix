'use server';

import { cookies } from 'next/headers';
import {
    decrypt,
    encrypt,
    getSessionCookieOptions,
    isSessionInactive,
    type SessionPayload,
} from '@/lib/auth/session';

export type RefreshSessionResult =
    | { success: true }
    | { expired: true }
    | { error: string };

/**
 * Extends the session for an actively working user.
 * Silently re-issues the JWT with a fresh expiry and updated lastActivity.
 */
export async function refreshSession(): Promise<RefreshSessionResult> {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get('session')?.value;
        if (!token) return { expired: true };

        let payload: SessionPayload;
        try {
            payload = await decrypt(token);
        } catch {
            return { expired: true };
        }

        if (isSessionInactive(payload)) {
            return { expired: true };
        }

        const refreshed = await encrypt({
            username: payload.username,
            role: payload.role,
            organizationName: payload.organizationName,
            permissions: payload.permissions,
            lastActivity: Date.now(),
        });

        cookieStore.set('session', refreshed, getSessionCookieOptions());
        return { success: true };
    } catch (err) {
        return {
            error: err instanceof Error ? err.message : 'Unable to refresh session',
        };
    }
}
