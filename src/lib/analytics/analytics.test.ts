import test from 'node:test';
import assert from 'node:assert/strict';
import type { SessionPayload } from '@/lib/auth/session';
import { canViewEmployee, resolveAnalyticsAccess } from './access';
import { resolveAnalyticsDateRange, type AnalyticsDateRange } from './date-range';
import {
  isLateSubmission,
  resolveDailyReportStatus,
  type DailyReportSettings,
} from './daily-report-status';
import { formatDuration } from './format-duration';

// Wednesday 2026-11-04 12:00 in Karachi
const NOW = new Date('2026-11-04T07:00:00.000Z');
const range = (...args: Parameters<typeof resolveAnalyticsDateRange>) =>
  resolveAnalyticsDateRange(...args) as AnalyticsDateRange;

test('presets use Karachi days with exclusive end', () => {
  const today = range('today', undefined, NOW);
  assert.equal(today.from, '2026-11-03T19:00:00.000Z');
  assert.equal(today.to, '2026-11-04T19:00:00.000Z');
  assert.equal(range('yesterday', undefined, NOW).startYmd, '2026-11-03');
  assert.equal(range('last_7_days', undefined, NOW).startYmd, '2026-10-29');
  assert.equal(range('last_30_days', undefined, NOW).startYmd, '2026-10-06');
});

test('weeks start on Monday and months roll over', () => {
  assert.equal(range('this_week', undefined, NOW).startYmd, '2026-11-02');
  const lastWeek = range('last_week', undefined, NOW);
  assert.equal(lastWeek.startYmd, '2026-10-26');
  assert.equal(lastWeek.endYmd, '2026-11-01');
  const sunday = new Date('2026-11-08T07:00:00.000Z');
  assert.equal(range('this_week', undefined, sunday).startYmd, '2026-11-02');
  const lastMonth = range('last_month', undefined, NOW);
  assert.equal(lastMonth.startYmd, '2026-10-01');
  assert.equal(lastMonth.endYmd, '2026-10-31');
});

test('custom range supports times and rejects bad input', () => {
  const timed = range('custom', {
    startYmd: '2026-11-01',
    endYmd: '2026-11-01',
    startTime: '09:00',
    endTime: '17:30',
  });
  assert.equal(timed.from, '2026-11-01T04:00:00.000Z');
  assert.equal(timed.to, '2026-11-01T12:31:00.000Z');
  assert.ok('error' in resolveAnalyticsDateRange('custom'));
  assert.ok('error' in resolveAnalyticsDateRange('custom', { startYmd: '2026-11-02', endYmd: '2026-11-01' }));
  assert.ok('error' in resolveAnalyticsDateRange('custom', { startYmd: '2026-02-30', endYmd: '2026-03-01' }));
  assert.ok(
    'error' in
      resolveAnalyticsDateRange('custom', {
        startYmd: '2026-11-01',
        endYmd: '2026-11-01',
        startTime: '25:00',
      })
  );
});

test('durations read naturally and missing values stay missing', () => {
  assert.equal(formatDuration(15 * 60), '15 minutes');
  assert.equal(formatDuration(2.5 * 3600), '2 hours 30 minutes');
  assert.equal(formatDuration(28 * 3600), '1 day 4 hours');
  assert.equal(formatDuration(3600), '1 hour');
  assert.equal(formatDuration(86400), '1 day');
  assert.equal(formatDuration(30), 'Under a minute');
  assert.equal(formatDuration(60), '1 minute');
  assert.equal(formatDuration(3599.9), '1 hour');
  assert.equal(formatDuration(null), '—');
  assert.equal(formatDuration(-5), '—');
  assert.equal(formatDuration(0), 'Under a minute');
});

const settings: DailyReportSettings = { deadlineLocal: '19:00', workingDays: [1, 2, 3, 4, 5, 6] };
const beforeDeadline = new Date('2026-11-04T13:00:00.000Z'); // 18:00 Karachi
const afterDeadline = new Date('2026-11-04T15:00:00.000Z'); // 20:00 Karachi
const reportYmd = '2026-11-04';

test('daily report statuses', () => {
  const status = (report: Parameters<typeof resolveDailyReportStatus>[0]['report'], now: Date, ymd = reportYmd) =>
    resolveDailyReportStatus({ reportYmd: ymd, settings, report, now });

  assert.equal(status(null, beforeDeadline), 'not_started');
  assert.equal(status({ status: 'draft', isLate: false }, beforeDeadline), 'draft');
  assert.equal(status(null, afterDeadline), 'missing');
  assert.equal(status({ status: 'draft', isLate: false }, afterDeadline), 'missing');
  assert.equal(status({ status: 'submitted', isLate: false }, afterDeadline), 'submitted');
  assert.equal(status({ status: 'submitted', isLate: true }, afterDeadline), 'late');
  // 2026-11-08 is a Sunday
  assert.equal(status(null, new Date('2026-11-09T00:00:00.000Z'), '2026-11-08'), null);
  assert.equal(status({ status: 'draft', isLate: false }, new Date('2026-11-09T00:00:00.000Z'), '2026-11-08'), 'draft');
});

test('late is measured against the Karachi deadline', () => {
  assert.equal(isLateSubmission(reportYmd, settings, beforeDeadline), false);
  assert.equal(isLateSubmission(reportYmd, settings, afterDeadline), true);
  assert.equal(isLateSubmission('2026-11-08', settings, new Date('2026-11-08T18:00:00.000Z')), false);
});

const session = (over: Partial<SessionPayload>): SessionPayload =>
  ({ username: 'someone', role: 'user', ...over }) as SessionPayload;

test('Super Admin sees everything, or the selected organization', () => {
  assert.deepEqual(resolveAnalyticsAccess(session({ username: 'admin', role: 'admin' })), {
    kind: 'admin',
    organizationId: null,
  });
  assert.deepEqual(
    resolveAnalyticsAccess(session({ username: 'admin', role: 'admin', organizationId: 'o1' })),
    { kind: 'admin', organizationId: 'o1' }
  );
});

test('organization administrators are limited to assigned organizations', () => {
  const base = { appUserId: 'u1', appUserRole: 'administrator' as const };
  assert.deepEqual(
    resolveAnalyticsAccess(session({ ...base, organizationId: 'o1', organizationIds: ['o1', 'o2'] })),
    { kind: 'admin', organizationId: 'o1' }
  );
  assert.deepEqual(
    resolveAnalyticsAccess(session({ ...base, organizationId: 'o9', organizationIds: ['o1'] })),
    { kind: 'denied' }
  );
  assert.deepEqual(resolveAnalyticsAccess(session({ ...base, organizationIds: ['o1'] })), { kind: 'denied' });
});

test('employees get their own scope only', () => {
  const agent = resolveAnalyticsAccess(session({ username: 'ali', role: 'sales_agent', organizationId: 'o1' }));
  assert.equal(agent.kind, 'self');
  assert.equal(canViewEmployee(agent, 'sales', 'ALI'), true);
  assert.equal(canViewEmployee(agent, 'sales', 'sara'), false);
  assert.equal(canViewEmployee(agent, 'operations', 'ali'), false);

  const ops = resolveAnalyticsAccess(session({ username: 'ops1', role: 'operations' }));
  assert.equal(ops.kind, 'self');
  assert.equal(canViewEmployee(ops, 'operations', 'ops1'), true);
  assert.equal(canViewEmployee(ops, 'sales', 'ops1'), false);
});

test('anything that cannot be scoped is denied', () => {
  assert.deepEqual(resolveAnalyticsAccess(null), { kind: 'denied' });
  assert.deepEqual(resolveAnalyticsAccess(session({ role: 'organization' })), { kind: 'denied' });
  assert.deepEqual(resolveAnalyticsAccess(session({ role: 'organization', organizationId: 'o1' })), { kind: 'denied' });
  assert.deepEqual(resolveAnalyticsAccess(session({ role: 'user', permissions: [], organizationId: 'o1' })), { kind: 'denied' });
  assert.deepEqual(resolveAnalyticsAccess(session({ role: 'sales_agent' })), { kind: 'denied' });
  assert.equal(canViewEmployee({ kind: 'denied' }, 'sales', 'x'), false);
  assert.deepEqual(resolveAnalyticsAccess(session({ username: 'notadmin', role: 'admin' })), { kind: 'denied' });
});
