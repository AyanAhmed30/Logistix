import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addDaysYmd,
  endOfMonthYmd,
  karachiDayEndExclusiveUtc,
  karachiDayStartUtc,
  resolveContactDatePreset,
  startOfMonthYmd,
  toContactDateRangeQuery,
} from './contact-date-range';

test('September 2026 spans start-inclusive / end-exclusive UTC bounds', () => {
  const range = resolveContactDatePreset('month:2026-09');
  assert.equal(range.startYmd, '2026-09-01');
  assert.equal(range.endYmd, '2026-09-30');

  const query = toContactDateRangeQuery(range);
  assert.ok(query);
  assert.equal(query!.createdAtGte, '2026-08-31T19:00:00.000Z'); // Sep 1 00:00 +05
  assert.equal(query!.createdAtLt, '2026-09-30T19:00:00.000Z'); // Oct 1 00:00 +05
});

test('end date includes late-day records via exclusive next midnight', () => {
  assert.equal(
    karachiDayStartUtc('2026-09-15'),
    '2026-09-14T19:00:00.000Z'
  );
  assert.equal(
    karachiDayEndExclusiveUtc('2026-09-15'),
    '2026-09-15T19:00:00.000Z'
  );
});

test('month helpers roll correctly', () => {
  assert.equal(startOfMonthYmd('2026-09-18'), '2026-09-01');
  assert.equal(endOfMonthYmd('2026-09-18'), '2026-09-30');
  assert.equal(endOfMonthYmd('2026-02-01'), '2026-02-28');
  assert.equal(addDaysYmd('2026-09-30', 1), '2026-10-01');
});

test('custom range swaps inverted dates', () => {
  const query = toContactDateRangeQuery({
    startYmd: '2026-09-15',
    endYmd: '2026-09-05',
  });
  assert.ok(query);
  assert.equal(query!.createdAtGte, karachiDayStartUtc('2026-09-05'));
  assert.equal(query!.createdAtLt, karachiDayEndExclusiveUtc('2026-09-15'));
});
