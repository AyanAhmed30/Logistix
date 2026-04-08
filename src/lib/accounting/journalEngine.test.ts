import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  assertDraftForPosting,
  assertMutableEntry,
  buildReversalLines,
  validateJournalEntry,
} from './journalEngine';

test('Valid entry posts successfully', () => {
  assert.doesNotThrow(() =>
    validateJournalEntry({
      lines: [
        { debit_amount: 5000, credit_amount: 0 },
        { debit_amount: 0, credit_amount: 5000 },
      ],
    })
  );
});

test('Imbalanced entry fails', () => {
  assert.throws(
    () =>
      validateJournalEntry({
        lines: [
          { debit_amount: 5000, credit_amount: 0 },
          { debit_amount: 0, credit_amount: 4000 },
        ],
      }),
    /Total debit and credit must be equal/
  );
});

test('Editing posted entry fails', () => {
  assert.throws(() => assertMutableEntry('posted'), /Posted entries cannot be modified. Use reversal\./);
});

test('Reversal creates correct mirror entry', () => {
  const reversed = buildReversalLines([
    { debit_amount: 10000, credit_amount: 0 },
    { debit_amount: 0, credit_amount: 10000 },
  ]);
  assert.equal(reversed[0].debit_amount, 0);
  assert.equal(reversed[0].credit_amount, 10000);
  assert.equal(reversed[1].debit_amount, 10000);
  assert.equal(reversed[1].credit_amount, 0);
});

test('Double posting prevented', () => {
  assert.throws(() => assertDraftForPosting('posted'), /Only draft entries can be posted/);
});

test('Negative values rejected', () => {
  assert.throws(
    () =>
      validateJournalEntry({
        lines: [
          { debit_amount: -10, credit_amount: 0 },
          { debit_amount: 0, credit_amount: 10 },
        ],
      }),
    /Invalid negative values in entry/
  );
});

test('Single-line entry rejected', () => {
  assert.throws(
    () =>
      validateJournalEntry({
        lines: [{ debit_amount: 10, credit_amount: 0 }],
      }),
    /Journal entry must have at least two lines/
  );
});
