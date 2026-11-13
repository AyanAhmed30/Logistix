/**
 * Sales agent activity sessions (migration 057). Server only.
 *
 * A tracked login carries `sid` and `idleTimeoutMs` in its session token. The
 * token check (isSessionInactive) ends the session on the server after 25
 * minutes without real activity. These helpers keep the matching database
 * record: active seconds from heartbeats, inactive periods, logout and expiry.
 *
 * Every helper is best effort: if the tables are missing (migration not run)
 * or the database fails, login and normal work carry on untracked.
 */

import { createAdminClient } from '@/utils/supabase/server';
import { getSalesAccessLevel } from '@/lib/module-permissions';
import { ACTIVITY_IDLE_GAP_MS, SALES_AGENT_IDLE_TIMEOUT_MS } from '@/lib/auth/session-config';
import type { SessionPayload } from '@/lib/auth/session';

type Supabase = Awaited<ReturnType<typeof createAdminClient>>;

const SESSIONS = 'sales_agent_sessions';
const EVENTS = 'sales_agent_session_events';

/** Sales agents: legacy agent logins, or portal users with Sales "own" or "all documents". */
export function isTrackedSalesAgent(session: Pick<SessionPayload, 'role' | 'appUserRole' | 'permissions' | 'username'>): boolean {
  if (session.role === 'admin' || session.role === 'organization') return false;
  if (session.appUserRole === 'administrator') return false;
  if (session.role === 'sales_agent') return true;
  if (session.role !== 'user') return false;
  const level = getSalesAccessLevel(session.permissions || []);
  return level === 'own' || level === 'all';
}

async function resolveAgentId(supabase: Supabase, session: Pick<SessionPayload, 'username' | 'appUserId'>): Promise<string | null> {
  const { resolveSalesAgentForSession } = await import('@/lib/legacy-user-bridge');
  const agent = await resolveSalesAgentForSession(supabase, session as SessionPayload);
  return agent?.id ? String(agent.id) : null;
}

/** Starts a tracked session at login. Returns the claims to put in the token, or null. */
export async function startTrackedSession(
  session: SessionPayload,
  userAgent: string | null
): Promise<{ sid: string; idleTimeoutMs: number } | null> {
  if (!isTrackedSalesAgent(session)) return null;
  try {
    const supabase = await createAdminClient();
    const agentId = await resolveAgentId(supabase, session);
    if (!agentId) return null;
    await closeStaleSessions(supabase, { agentId });
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from(SESSIONS)
      .insert({
        sales_agent_id: agentId,
        app_user_id: session.appUserId ?? null,
        username: session.username,
        organization_id: session.organizationId ?? null,
        started_at: now,
        last_activity_at: now,
        user_agent: userAgent ? userAgent.slice(0, 300) : null,
      })
      .select('id')
      .single();
    if (error || !data) return null;
    await supabase.from(EVENTS).insert({ session_id: data.id, sales_agent_id: agentId, event_type: 'login', occurred_at: now });
    return { sid: String(data.id), idleTimeoutMs: SALES_AGENT_IDLE_TIMEOUT_MS };
  } catch (err) {
    console.error('[activity] session not started', err instanceof Error ? err.message : err);
    return null;
  }
}

export type HeartbeatResult = 'ok' | 'ended';

/**
 * Records real activity now. Time since the previous heartbeat counts as
 * active unless the gap was long enough to be an inactive period. Several tabs
 * share one session, so time is never counted twice: the update only applies
 * when last_activity_at is still the value that was read.
 */
export async function recordHeartbeat(sid: string): Promise<HeartbeatResult> {
  try {
    const supabase = await createAdminClient();
    const { data: row, error } = await supabase
      .from(SESSIONS)
      .select('id, sales_agent_id, last_activity_at, active_seconds, ended_at')
      .eq('id', sid)
      .maybeSingle();
    if (error || !row) return 'ok'; // table missing or row gone: keep working untracked
    if (row.ended_at) return 'ended';

    const now = Date.now();
    const last = Date.parse(String(row.last_activity_at));
    const gap = now - last;
    if (gap > SALES_AGENT_IDLE_TIMEOUT_MS) {
      await endSession(supabase, row, 'inactivity', new Date(last + SALES_AGENT_IDLE_TIMEOUT_MS).toISOString());
      return 'ended';
    }
    const nowIso = new Date(now).toISOString();
    const activeAdd = gap <= ACTIVITY_IDLE_GAP_MS ? Math.max(0, Math.round(gap / 1000)) : 0;
    const { data: updated } = await supabase
      .from(SESSIONS)
      .update({ last_activity_at: nowIso, active_seconds: Number(row.active_seconds || 0) + activeAdd })
      .eq('id', sid)
      .eq('last_activity_at', row.last_activity_at)
      .is('ended_at', null)
      .select('id');
    if (updated?.length && gap > ACTIVITY_IDLE_GAP_MS) {
      await supabase.from(EVENTS).insert([
        { session_id: sid, sales_agent_id: row.sales_agent_id, event_type: 'inactive', occurred_at: String(row.last_activity_at) },
        { session_id: sid, sales_agent_id: row.sales_agent_id, event_type: 'active', occurred_at: nowIso },
      ]);
    }
    return 'ok';
  } catch (err) {
    console.error('[activity] heartbeat not saved', err instanceof Error ? err.message : err);
    return 'ok';
  }
}

async function endSession(
  supabase: Supabase,
  row: { id: string; sales_agent_id: string },
  reason: 'logout' | 'inactivity',
  at: string
) {
  const { data } = await supabase
    .from(SESSIONS)
    .update({ ended_at: at, end_reason: reason })
    .eq('id', row.id)
    .is('ended_at', null)
    .select('id');
  if (data?.length) {
    await supabase.from(EVENTS).insert({
      session_id: row.id,
      sales_agent_id: row.sales_agent_id,
      event_type: reason === 'logout' ? 'logout' : 'expired',
      occurred_at: at,
    });
  }
}

/** Manual logout, or an expired token seen by the server. */
export async function endTrackedSession(sid: string, reason: 'logout' | 'inactivity'): Promise<void> {
  try {
    const supabase = await createAdminClient();
    const { data: row } = await supabase
      .from(SESSIONS)
      .select('id, sales_agent_id, last_activity_at, ended_at')
      .eq('id', sid)
      .maybeSingle();
    if (!row || row.ended_at) return;
    const last = Date.parse(String(row.last_activity_at));
    const expiresAt = last + SALES_AGENT_IDLE_TIMEOUT_MS;
    // A logout after the session already timed out is recorded as the timeout.
    if (reason === 'inactivity' || Date.now() > expiresAt) {
      await endSession(supabase, row, 'inactivity', new Date(expiresAt).toISOString());
    } else {
      await endSession(supabase, row, 'logout', new Date().toISOString());
    }
  } catch (err) {
    console.error('[activity] session not closed', err instanceof Error ? err.message : err);
  }
}

/**
 * Sessions nobody closed (browser closed, network lost) ended when their 25
 * minutes ran out after the last activity. Records that moment, never a guess.
 */
export async function closeStaleSessions(supabase: Supabase, filter: { agentId?: string } = {}): Promise<void> {
  const cutoff = new Date(Date.now() - SALES_AGENT_IDLE_TIMEOUT_MS).toISOString();
  let query = supabase
    .from(SESSIONS)
    .select('id, sales_agent_id, last_activity_at')
    .is('ended_at', null)
    .lt('last_activity_at', cutoff)
    .limit(500);
  if (filter.agentId) query = query.eq('sales_agent_id', filter.agentId);
  const { data } = await query;
  for (const row of data || []) {
    const at = new Date(Date.parse(String(row.last_activity_at)) + SALES_AGENT_IDLE_TIMEOUT_MS).toISOString();
    await endSession(supabase, row as { id: string; sales_agent_id: string }, 'inactivity', at);
  }
}
