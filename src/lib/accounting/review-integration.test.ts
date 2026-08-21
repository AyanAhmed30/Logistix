import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePaymentState,
  outstandingFromComponents,
  appliedPaymentAmount,
  documentPaymentSnapshot,
} from '../accounting-payments';
import {
  agingBucketFromDaysOverdue,
  daysOverdueFromDueDate,
} from '../accounting-payment-terms';
import {
  outstandingInterest,
  outstandingPrincipal,
} from '../accounting-loans';
import { monthKeysBetween } from './financial-reporting/periods';
import { resolveAgingBucket } from './financial-reporting/aging-buckets';

test('Invoice outstanding: full payment clears residual', () => {
  const s = computePaymentState({
    total: 100000,
    amountPaid: 100000,
    dueDate: '2026-01-31',
    workflowStatus: 'posted',
    amountResidual: 0,
  });
  assert.equal(s.outstanding, 0);
  assert.equal(s.paymentState, 'paid');
});

test('Invoice outstanding: partial payment leaves remainder', () => {
  const s = computePaymentState({
    total: 100000,
    amountPaid: 60000,
    dueDate: '2026-01-31',
    workflowStatus: 'posted',
    amountResidual: 40000,
  });
  assert.equal(s.outstanding, 40000);
  assert.equal(s.paymentState, 'partial');
});

test('Invoice outstanding prefers residual after credit note', () => {
  const s = computePaymentState({
    total: 100000,
    amountPaid: 0,
    dueDate: '2026-01-31',
    workflowStatus: 'posted',
    amountResidual: 25000,
  });
  assert.equal(s.outstanding, 25000);
});

test('Draft invoices stay not_paid even if residual is set', () => {
  const s = computePaymentState({
    total: 50000,
    amountPaid: 0,
    dueDate: '2026-01-31',
    workflowStatus: 'draft',
    amountResidual: 50000,
  });
  assert.equal(s.paymentState, 'not_paid');
});

test('Loan identity: original principal − principal paid = remaining', () => {
  assert.equal(outstandingPrincipal(120000, 20000), 100000);
  assert.equal(outstandingPrincipal(120000, 120000), 0);
  assert.equal(outstandingInterest(18000, 3000), 15000);
});

test('Aging days overdue matches payment-terms helper', () => {
  assert.equal(daysOverdueFromDueDate('2026-01-01', '2026-01-01'), 0);
  assert.equal(daysOverdueFromDueDate('2026-01-01', '2026-01-31'), 30);
  assert.equal(agingBucketFromDaysOverdue(0), 'current');
  assert.equal(agingBucketFromDaysOverdue(30), '1_30');
  assert.equal(agingBucketFromDaysOverdue(91), '90_plus');
});

test('Odoo aging buckets share the same overdue day count', () => {
  const due = resolveAgingBucket('2026-01-01', '2026-02-15');
  assert.equal(due.daysOverdue, daysOverdueFromDueDate('2026-01-01', '2026-02-15'));
  assert.equal(due.bucket, 'd31_60');
  const current = resolveAgingBucket('2026-08-01', '2026-07-01');
  assert.equal(current.bucket, 'not_due');
});

test('Credit note reduces outstanding independently of payments', () => {
  assert.equal(
    outstandingFromComponents({ total: 100000, amountPaid: 0, adjustments: 25000 }),
    75000
  );
  assert.equal(
    outstandingFromComponents({ total: 100000, amountPaid: 60000, adjustments: 25000 }),
    15000
  );
  assert.equal(
    outstandingFromComponents({ total: 100000, amountPaid: 100000, adjustments: 0 }),
    0
  );
});

test('Unreconciled bank receipts do not reduce document residual', () => {
  assert.equal(
    appliedPaymentAmount({ amount: 60000, reconcile_status: 'outstanding' }),
    0
  );
  assert.equal(
    appliedPaymentAmount({ amount: 60000, reconcile_status: 'reconciled' }),
    60000
  );
  assert.equal(
    appliedPaymentAmount({ amount: 60000, reconcile_status: null }),
    60000
  );
});

test('Document snapshot prefers stored residual after credit note', () => {
  const s = documentPaymentSnapshot({
    total: 100000,
    amountPaid: 0,
    dueDate: '2099-01-31',
    workflowStatus: 'posted',
    amountResidual: 25000,
    storedPaymentState: 'partial',
  });
  assert.equal(s.outstanding, 25000);
});

test('Vendor refund reduces bill outstanding independently of payments', () => {
  assert.equal(
    outstandingFromComponents({ total: 150000, amountPaid: 0, adjustments: 50000 }),
    100000
  );
  assert.equal(
    outstandingFromComponents({ total: 150000, amountPaid: 50000, adjustments: 50000 }),
    50000
  );
});

test('Lock date comparison is inclusive of the lock date', async () => {
  const { isAccountingDateOnOrBeforeLock } = await import(
    '../accounting-lock-date-math'
  );
  assert.equal(isAccountingDateOnOrBeforeLock('2026-01-15', null), false);
  assert.equal(isAccountingDateOnOrBeforeLock('2026-01-15', '2026-01-14'), false);
  assert.equal(isAccountingDateOnOrBeforeLock('2026-01-15', '2026-01-15'), true);
  assert.equal(isAccountingDateOnOrBeforeLock('2026-01-15', '2026-01-31'), true);
});

test('Annual / deferred month keys are inclusive and ordered', () => {
  assert.deepEqual(monthKeysBetween('2026-01-15', '2026-03-02'), [
    '2026-01',
    '2026-02',
    '2026-03',
  ]);
});
