'use server';

import { cookies } from 'next/headers';
import {
    decrypt,
    encrypt,
    getSessionCookieOptions,
    isSessionInactive,
    type SessionPayload,
} from '@/lib/auth/session';
import { actionError } from '@/lib/user-facing-error';
import { endTrackedSession, recordHeartbeat } from '@/lib/auth/activity-tracking';

export type RefreshSessionResult =
    | { success: true; tracked?: boolean; idleTimeoutMs?: number }
    | { expired: true }
    | { error: string };

/**
 * Extends the session for an actively working user.
 * Silently re-issues the JWT with a fresh expiry and updated lastActivity.
 *
 * Tracked sales agent sessions are only extended when the agent really used
 * the app (`interacted`: a visible tab with input in the last 90 seconds); the
 * heartbeat is recorded on the server. Other sessions behave as before.
 */
export async function refreshSession(input?: { interacted?: boolean }): Promise<RefreshSessionResult> {
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
            if (payload.sid) await endTrackedSession(payload.sid, 'inactivity');
            return { expired: true };
        }

        if (payload.sid) {
            const tracked = { tracked: true, idleTimeoutMs: payload.idleTimeoutMs };
            if (!input?.interacted) return { success: true, ...tracked };
            if ((await recordHeartbeat(payload.sid)) === 'ended') {
                cookieStore.set('session', '', { expires: new Date(0) });
                return { expired: true };
            }
            const token = await encrypt({ ...payload, lastActivity: Date.now() });
            cookieStore.set('session', token, getSessionCookieOptions());
            return { success: true, ...tracked };
        }

        const refreshed = await encrypt({
            username: payload.username,
            role: payload.role,
            appUserId: payload.appUserId,
            appUserRole: payload.appUserRole,
            fullName: payload.fullName,
            organizationName: payload.organizationName,
            organizationId: payload.organizationId,
            organizationIds: payload.organizationIds,
            permissions: payload.permissions,
            lastActivity: Date.now(),
        });

        cookieStore.set('session', refreshed, getSessionCookieOptions());
        return { success: true };
    } catch (err) {
        return {
            error: actionError(err, 'Unable to refresh session'),
        };
    }
}
