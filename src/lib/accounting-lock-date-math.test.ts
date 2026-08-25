import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAccountingLockSettings,
  isAccountingDateOnOrBeforeLock,
  lockDomainFromJournalSource,
} from './accounting-lock-date-math';

test('lock dates are inclusive on the boundary', () => {
  assert.equal(isAccountingDateOnOrBeforeLock('2026-06-30', '2026-06-30'), true);
  assert.equal(isAccountingDateOnOrBeforeLock('2026-06-29', '2026-06-30'), true);
  assert.equal(isAccountingDateOnOrBeforeLock('2026-07-01', '2026-06-30'), false);
  assert.equal(isAccountingDateOnOrBeforeLock('2026-07-01', null), false);
});

test('period lock blocks sale, purchase, tax, and miscellaneous domains', () => {
  const settings = { period_lock_date: '2026-06-30' };
  for (const domain of ['sale', 'purchase', 'tax', 'general'] as const) {
    const blocked = evaluateAccountingLockSettings({
      date: '2026-06-30',
      domain,
      settings,
    });
    assert.ok(blocked, `${domain} must be blocked on the lock date`);
    const open = evaluateAccountingLockSettings({
      date: '2026-07-01',
      domain,
      settings,
    });
    assert.equal(open, null, `${domain} must be open the day after the lock`);
  }
});

test('sale lock does not block purchase or miscellaneous journals', () => {
  const settings = { sale_lock_date: '2026-06-30' };
  assert.ok(
    evaluateAccountingLockSettings({ date: '2026-06-29', domain: 'sale', settings })
  );
  assert.equal(
    evaluateAccountingLockSettings({
      date: '2026-06-29',
      domain: 'purchase',
      settings,
    }),
    null
  );
  assert.equal(
    evaluateAccountingLockSettings({
      date: '2026-06-29',
      domain: 'general',
      settings,
    }),
    null
  );
});

test('soft lock can be bypassed by accounting administrators only', () => {
  const settings = { soft_lock_date: '2026-06-30' };
  assert.ok(
    evaluateAccountingLockSettings({
      date: '2026-06-30',
      domain: 'general',
      settings,
    })
  );
  assert.equal(
    evaluateAccountingLockSettings({
      date: '2026-06-30',
      domain: 'general',
      settings,
      allowSoftLockBypass: true,
    }),
    null
  );
});

test('journal source types map to the correct lock domain', () => {
  assert.equal(lockDomainFromJournalSource('customer_invoice'), 'sale');
  assert.equal(lockDomainFromJournalSource('credit_note'), 'sale');
  assert.equal(lockDomainFromJournalSource('vendor_bill'), 'purchase');
  assert.equal(lockDomainFromJournalSource('vendor_refund'), 'purchase');
  assert.equal(lockDomainFromJournalSource('tax_return'), 'tax');
  assert.equal(lockDomainFromJournalSource('manual'), 'general');
});
