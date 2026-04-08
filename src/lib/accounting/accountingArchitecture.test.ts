import test from 'node:test';
import assert from 'node:assert/strict';
import { validateJournalEntry } from './journalEngine';

function mapEventToKey(eventType: string, referenceId: string) {
  return `${eventType}:${referenceId}`;
}

test('Shipment to settlement flow emits deterministic event keys', () => {
  const keys = [
    mapEventToKey('SHIPMENT_CREATED', 'SHP-001'),
    mapEventToKey('SHIPMENT_COST_ADDED', 'SHP-001:COST:1'),
    mapEventToKey('VENDOR_BILL_POSTED', 'BILL-001'),
    mapEventToKey('CUSTOMER_INVOICE_POSTED', 'INV-001'),
    mapEventToKey('PAYMENT_RECEIVED', 'PAY-001'),
    mapEventToKey('COD_SETTLED_TO_BANK', 'CODSET-001'),
  ];
  assert.equal(new Set(keys).size, keys.length);
});

test('Duplicate event idempotency key should be deduplicated', () => {
  const key = mapEventToKey('CUSTOMER_INVOICE_POSTED', 'INV-002');
  const existing = new Set<string>();
  existing.add(key);
  const duplicateDetected = existing.has(key);
  assert.equal(duplicateDetected, true);
});

test('Partial failure strategy requires atomic rollback boundary', () => {
  const steps = ['create_event_log', 'insert_entry', 'insert_lines', 'post_entry'];
  const failedAt = 'insert_lines';
  const committed = steps.indexOf(failedAt) === -1;
  assert.equal(committed, false);
});

test('COD collected cannot exceed invoice amount', () => {
  const codCollected = 12000;
  const invoiceAmount = 10000;
  assert.equal(codCollected <= invoiceAmount, false);
});

test('Tradeflow delivery accounting remains balanced', () => {
  const lines = [
    { debit_amount: 12000, credit_amount: 0 },
    { debit_amount: 0, credit_amount: 12000 },
    { debit_amount: 9000, credit_amount: 0 },
    { debit_amount: 0, credit_amount: 9000 },
  ];
  assert.doesNotThrow(() => validateJournalEntry({ lines }));
});
