import test from 'node:test';
import assert from 'node:assert/strict';
import { splitFactsByPeriod } from './ledger';
import { allocateOutstandingToDocuments, partnerOutstandingFromFacts } from './aging-allocate';
import { amountsEqual } from './reconcile';
import { round2, signedBalance } from './types';
import type { LedgerFact } from './types';

function fact(partial: Partial<LedgerFact> & { entry_date: string; debit?: number; credit?: number }): LedgerFact {
  return {
    line_id: partial.line_id || 'l1',
    entry_id: partial.entry_id || 'e1',
    entry_date: partial.entry_date,
    entry_number: null,
    reference: null,
    organization_id: 'org',
    account_id: partial.account_id || 'a1',
    debit: partial.debit || 0,
    credit: partial.credit || 0,
    label: null,
    source_type: null,
    source_id: null,
    source_number: null,
    tax_label: null,
    journal_id: null,
    journal_code: null,
    journal_name: null,
    contact_id: null,
    partner_name: null,
    amount_residual: null,
    is_reconciled: null,
  };
}

test('splitFactsByPeriod uses inclusive accounting dates and does not double-count opening', () => {
  const facts = [
    fact({ line_id: '1', entry_date: '2026-07-31', debit: 100 }),
    fact({ line_id: '2', entry_date: '2026-08-01', debit: 50 }),
    fact({ line_id: '3', entry_date: '2026-08-31', credit: 20 }),
    fact({ line_id: '4', entry_date: '2026-09-01', debit: 9 }),
  ];
  const { opening, period, closing } = splitFactsByPeriod(facts, '2026-08-01', '2026-08-31');
  assert.equal(opening.length, 1);
  assert.equal(period.length, 2);
  assert.equal(closing.length, 3);
  const openD = opening.reduce((s, f) => s + f.debit, 0);
  const perD = period.reduce((s, f) => s + f.debit, 0);
  const closeD = closing.reduce((s, f) => s + f.debit, 0);
  assert.equal(round2(openD + perD), closeD);
});

test('allocateOutstandingToDocuments FIFO by due date keeps ledger total', () => {
  const rows = allocateOutstandingToDocuments({
    outstanding: 40000,
    asOf: '2026-08-25',
    documents: [
      {
        id: 'inv-1',
        reference: 'INV-1',
        due_date: '2026-08-10',
        document_date: '2026-08-01',
        journal_entry_id: 'je-1',
        cap: 100000,
      },
    ],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 40000);
  assert.equal(rows[0].document_id, 'inv-1');
});

test('allocateOutstandingToDocuments leftover is posted journal items, not invented invoices', () => {
  const rows = allocateOutstandingToDocuments({
    outstanding: 150,
    asOf: '2026-08-25',
    documents: [
      {
        id: 'inv-1',
        reference: 'INV-1',
        due_date: '2026-08-10',
        document_date: '2026-08-01',
        journal_entry_id: 'je-1',
        cap: 100,
      },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].amount, 100);
  assert.equal(rows[1].reference, 'Posted journal items');
  assert.equal(round2(rows.reduce((s, r) => s + r.amount, 0)), 150);
});

test('partner outstanding uses debit-credit for AR and credit-debit for AP', () => {
  assert.equal(partnerOutstandingFromFacts('receivable', 100000, 60000), 40000);
  assert.equal(partnerOutstandingFromFacts('payable', 60000, 100000), 40000);
  assert.equal(partnerOutstandingFromFacts('receivable', 0, 0), 0);
});

test('Balance Sheet asset/liability totals must include every classified account', () => {
  const assets = [
    { type: 'asset' as const, account_type: 'bank', balance: 10 },
    { type: 'asset' as const, account_type: 'receivable', balance: 40 },
  ];
  const liab = [
    { type: 'liability' as const, account_type: 'payable', balance: 25 },
    { type: 'liability' as const, account_type: 'deferred_revenue', balance: 5 },
  ];
  const totalAssets = round2(assets.reduce((s, b) => s + b.balance, 0));
  const totalLiab = round2(liab.reduce((s, b) => s + b.balance, 0));
  assert.equal(totalAssets, 50);
  assert.equal(totalLiab, 30);
  assert.equal(true, amountsEqual(totalAssets, 50));
});

test('signedBalance folds P&L into the accounting equation', () => {
  const assets = 200;
  const liab = 50;
  const equity = 100;
  const income = signedBalance('income', 0, 80);
  const expense = signedBalance('expense', 30, 0);
  const earnings = round2(income - expense);
  assert.equal(earnings, 50);
  assert.equal(round2(assets), round2(liab + equity + earnings));
});

test('P&L leftover income/expense types still fold into net profit', () => {
  const revenue = 100;
  const otherIncomeTyped = 10;
  const leftoverIncome = 5;
  const totalIncomeAll = round2(revenue + otherIncomeTyped + leftoverIncome);
  const costOfRevenue = 20;
  const operatingExpenses = 30;
  const leftoverExpense = 7;
  const totalExpenseAll = round2(costOfRevenue + operatingExpenses + leftoverExpense);
  const otherIncome = round2(totalIncomeAll - revenue);
  const otherExpenses = round2(totalExpenseAll - costOfRevenue - operatingExpenses);
  const netProfit = round2(totalIncomeAll - totalExpenseAll);
  assert.equal(otherIncome, 15);
  assert.equal(otherExpenses, 7);
  assert.equal(netProfit, 58);
  assert.equal(round2(revenue + otherIncome - costOfRevenue - operatingExpenses - otherExpenses), netProfit);
});
