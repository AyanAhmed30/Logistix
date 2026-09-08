import test from 'node:test';
import assert from 'node:assert/strict';
import {
  pickLeastLoadedSalesAgent,
  simulateBalancedAssignments,
} from './mobile-agent-assignment';

test('2 agents / 4 customers → 2 and 2', () => {
  const counts = simulateBalancedAssignments(['a', 'b'], 4);
  assert.equal(counts.a, 2);
  assert.equal(counts.b, 2);
});

test('3 agents / 7 customers → 3, 2, 2', () => {
  const counts = simulateBalancedAssignments(['a', 'b', 'c'], 7);
  const values = Object.values(counts).sort((x, y) => y - x);
  assert.deepEqual(values, [3, 2, 2]);
  assert.equal(counts.a + counts.b + counts.c, 7);
});

test('tie-break prefers longest wait then stable id', () => {
  const picked = pickLeastLoadedSalesAgent([
    {
      id: 'b',
      mobileCustomerCount: 1,
      lastMobileAutoAssignedAt: '2026-01-02T00:00:00.000Z',
    },
    {
      id: 'a',
      mobileCustomerCount: 1,
      lastMobileAutoAssignedAt: '2026-01-01T00:00:00.000Z',
    },
  ]);
  assert.equal(picked, 'a');
});

test('null last_auto_assigned beats any timestamp at same load', () => {
  const picked = pickLeastLoadedSalesAgent([
    {
      id: 'z',
      mobileCustomerCount: 0,
      lastMobileAutoAssignedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'm',
      mobileCustomerCount: 0,
      lastMobileAutoAssignedAt: null,
    },
  ]);
  assert.equal(picked, 'm');
});

test('empty agent list returns null', () => {
  assert.equal(pickLeastLoadedSalesAgent([]), null);
});
