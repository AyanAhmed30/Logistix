import test from 'node:test';
import assert from 'node:assert/strict';
import { isSessionInactive, type SessionPayload } from './session';
import { isTrackedSalesAgent } from './activity-tracking';
import { INACTIVITY_TIMEOUT_MS, SALES_AGENT_IDLE_TIMEOUT_MS } from './session-config';

const MIN = 60 * 1000;
const base: SessionPayload = { username: 'u', role: 'user' };

test('sales agent sessions end after 25 minutes without activity (checked on the server)', () => {
  assert.equal(SALES_AGENT_IDLE_TIMEOUT_MS, 25 * MIN);
  const tracked = { ...base, sid: 's1', idleTimeoutMs: SALES_AGENT_IDLE_TIMEOUT_MS };
  assert.equal(isSessionInactive({ ...tracked, lastActivity: Date.now() - 24 * MIN }), false);
  assert.equal(isSessionInactive({ ...tracked, lastActivity: Date.now() - 26 * MIN }), true);
});

test('other sessions keep the existing timeout', () => {
  assert.equal(isSessionInactive({ ...base, lastActivity: Date.now() - 26 * MIN }), INACTIVITY_TIMEOUT_MS < 26 * MIN);
  assert.equal(isSessionInactive({ ...base }), false); // legacy tokens without lastActivity
});

test('who is tracked as a sales agent', () => {
  assert.equal(isTrackedSalesAgent({ ...base, role: 'sales_agent', permissions: [] }), true);
  assert.equal(isTrackedSalesAgent({ ...base, permissions: ['sales', 'sales-own'] }), true);
  assert.equal(isTrackedSalesAgent({ ...base, permissions: ['sales', 'sales-all'] }), true);
  assert.equal(isTrackedSalesAgent({ ...base, permissions: ['sales', 'sales-admin'] }), false);
  assert.equal(isTrackedSalesAgent({ ...base, appUserRole: 'administrator', permissions: ['sales', 'sales-own'] }), false);
  assert.equal(isTrackedSalesAgent({ ...base, role: 'admin', username: 'admin' }), false);
  assert.equal(isTrackedSalesAgent({ ...base, permissions: ['operations'] }), false);
});
