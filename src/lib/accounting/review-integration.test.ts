import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computePaymentState,
  outstandingFromComponents,
  appliedPaymentAmount,
  documentPaymentSnapshot,
  creditNoteAppliedToOpenInvoice,
  invoicePaidDeltaFromReconcileCredits,
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
import {
  aggregateTaxReportFromJournalLines,
  signedTaxAmount,
  taxableNetForSection,
} from './financial-reporting/tax-report-journal';
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

test('Bank invoice stays In Payment with full residual until receipts are matched', () => {
  const before = documentPaymentSnapshot({
    total: 100000,
    amountPaid: 0,
    dueDate: '2099-01-31',
    workflowStatus: 'posted',
    amountResidual: 100000,
    storedPaymentState: 'in_payment',
    journal: 'bank',
  });
  assert.equal(before.outstanding, 100000);
  assert.equal(before.paymentState, 'in_payment');

  const afterMatch = documentPaymentSnapshot({
    total: 100000,
    amountPaid: 60000,
    dueDate: '2099-01-31',
    workflowStatus: 'posted',
    amountResidual: 40000,
    storedPaymentState: 'partial',
  });
  assert.equal(afterMatch.outstanding, 40000);
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

test('Lock domain is derived from journal source type', async () => {
  const { lockDomainFromJournalSource } = await import('../accounting-lock-date-math');
  assert.equal(lockDomainFromJournalSource('customer_invoice'), 'sale');
  assert.equal(lockDomainFromJournalSource('credit_note'), 'sale');
  assert.equal(lockDomainFromJournalSource('vendor_bill'), 'purchase');
  assert.equal(lockDomainFromJournalSource('vendor_refund'), 'purchase');
  assert.equal(lockDomainFromJournalSource('tax_return'), 'tax');
  assert.equal(lockDomainFromJournalSource('manual'), 'general');
  assert.equal(lockDomainFromJournalSource('asset_purchase'), 'purchase');
  assert.equal(lockDomainFromJournalSource('asset_depreciation'), 'general');
  assert.equal(lockDomainFromJournalSource('loan_repayment'), 'general');
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

test('Sale/purchase locks do not block miscellaneous journals', async () => {
  const { evaluateAccountingLockSettings } = await import(
    '../accounting-lock-date-math'
  );
  const settings = {
    sale_lock_date: '2026-06-30',
    purchase_lock_date: '2026-06-30',
  };
  const saleBlocked = evaluateAccountingLockSettings({
    date: '2026-06-29',
    domain: 'sale',
    settings,
  });
  const purchaseBlocked = evaluateAccountingLockSettings({
    date: '2026-06-29',
    domain: 'purchase',
    settings,
  });
  const generalAllowed = evaluateAccountingLockSettings({
    date: '2026-06-29',
    domain: 'general',
    settings,
  });
  assert.ok(saleBlocked && /sales lock date/i.test(saleBlocked));
  assert.ok(purchaseBlocked && /purchase lock date/i.test(purchaseBlocked));
  assert.equal(generalAllowed, null);

  const fiscal = evaluateAccountingLockSettings({
    date: '2026-06-30',
    domain: 'general',
    settings: { hard_lock_date: '2026-06-30' },
  });
  assert.ok(fiscal && /fiscal lock date/i.test(fiscal));
  const afterFiscal = evaluateAccountingLockSettings({
    date: '2026-07-01',
    domain: 'general',
    settings: { hard_lock_date: '2026-06-30' },
  });
  assert.equal(afterFiscal, null);

  const period = evaluateAccountingLockSettings({
    date: '2026-06-29',
    domain: 'sale',
    settings: { period_lock_date: '2026-06-30' },
  });
  assert.ok(period && /period lock date/i.test(period));
});

test('Credit note applied to open invoice cannot exceed residual', () => {
  assert.equal(
    creditNoteAppliedToOpenInvoice({
      creditNoteTotal: 40000,
      invoiceOpenBeforeNote: 100000,
    }),
    40000
  );
  assert.equal(
    creditNoteAppliedToOpenInvoice({
      creditNoteTotal: 40000,
      invoiceOpenBeforeNote: 0,
    }),
    0
  );
  const first = invoicePaidDeltaFromReconcileCredits({
    invoiceDebitAmount: 40000,
    remainingPaymentCredits: 0,
  });
  assert.equal(first.paidDelta, 0);
  const second = invoicePaidDeltaFromReconcileCredits({
    invoiceDebitAmount: 40000,
    remainingPaymentCredits: 60000,
  });
  assert.equal(second.paidDelta, 40000);
  assert.equal(second.remainingPaymentCredits, 20000);
});

test('Annual / deferred month keys are inclusive and ordered', () => {
  assert.deepEqual(monthKeysBetween('2026-01-15', '2026-03-02'), [
    '2026-01',
    '2026-02',
    '2026-03',
  ]);
});

test('Tax report from journal items uses posted debit/credit, not document headers', () => {
  assert.equal(signedTaxAmount('sales', 0, 18000), 18000);
  assert.equal(signedTaxAmount('sales', 18000, 0), -18000);
  assert.equal(signedTaxAmount('purchases', 18000, 0), 18000);
  assert.equal(signedTaxAmount('purchases', 0, 18000), -18000);

  const invoiceLines = [
    { id: 'ar', entry_id: 'e1', account_id: '1300', debit: 118000, credit: 0, tax_label: null, source_type: 'customer_invoice' },
    { id: 'rev', entry_id: 'e1', account_id: '4100', debit: 0, credit: 100000, tax_label: null, source_type: 'customer_invoice' },
    { id: 'tax', entry_id: 'e1', account_id: '2200', debit: 0, credit: 18000, tax_label: 'GST 18% (18.0%)', source_type: 'customer_invoice' },
  ];
  assert.equal(
    taxableNetForSection('sales', invoiceLines, new Set(['tax'])),
    100000
  );

  const report = aggregateTaxReportFromJournalLines({
    lines: invoiceLines,
    masters: [
      {
        id: 'tax-s',
        type: 'sales_tax',
        rate_value: 18,
        invoice_label: 'GST 18%',
        name: 'GST Sales 18%',
        account_id: '2200',
      },
    ],
  });
  assert.equal(report.sales.length, 1);
  assert.equal(report.sales[0].net, 100000);
  assert.equal(report.sales[0].tax, 18000);
  assert.equal(report.purchases.length, 0);

  const noise = aggregateTaxReportFromJournalLines({
    lines: [
      ...invoiceLines,
      {
        id: 'other-asset',
        entry_id: 'e9',
        account_id: '1400',
        debit: 500000,
        credit: 0,
        tax_label: null,
        source_type: 'misc',
      },
    ],
    masters: [
      {
        id: 'tax-s',
        type: 'sales_tax',
        rate_value: 18,
        invoice_label: 'GST 18%',
        name: 'GST Sales 18%',
        account_id: '2200',
      },
      {
        id: 'tax-p',
        type: 'purchase_tax',
        rate_value: 18,
        invoice_label: 'GST 18%',
        name: 'GST Purchase 18%',
        account_id: '1400',
      },
    ],
  });
  assert.equal(noise.sales[0].tax, 18000);
  assert.equal(noise.purchases.length, 0);
});

test('Tax report prefers computed rate from posted amounts over a stale tax_label', () => {
  const lines = [
    { id: 'ar', entry_id: 'e1', account_id: '1300', debit: 118000, credit: 0, tax_label: null, source_type: 'customer_invoice' },
    { id: 'rev', entry_id: 'e1', account_id: '4100', debit: 0, credit: 100000, tax_label: null, source_type: 'customer_invoice' },
    { id: 'tax', entry_id: 'e1', account_id: '2200', debit: 0, credit: 18000, tax_label: 'GST 18% (10.0%)', source_type: 'customer_invoice' },
  ];
  const report = aggregateTaxReportFromJournalLines({
    lines,
    masters: [
      {
        id: 'tax-s',
        type: 'sales_tax',
        rate_value: 18,
        invoice_label: 'GST 18%',
        name: 'GST Sales 18%',
        account_id: '2200',
      },
    ],
  });
  assert.equal(report.sales.length, 1);
  assert.equal(report.sales[0].tax, 18000);
  assert.equal(report.sales[0].net, 100000);
  assert.match(report.sales[0].label, /18\.0\s*%/);
});

test('Tax report ignores income/expense accounts even if mis-mapped as tax accounts', () => {
  const lines = [
    { id: 'ar', entry_id: 'e1', account_id: '1300', debit: 100000, credit: 0, tax_label: null, source_type: 'customer_invoice' },
    { id: 'rev', entry_id: 'e1', account_id: '4100', debit: 0, credit: 100000, tax_label: null, source_type: 'customer_invoice' },
  ];
  const report = aggregateTaxReportFromJournalLines({
    lines,
    masters: [
      {
        id: 'bad',
        type: 'purchase_tax',
        rate_value: 0,
        invoice_label: 'Mis-mapped',
        name: 'Mis-mapped',
        account_id: '4100',
      },
    ],
    accountClassById: new Map([
      ['1300', 'asset'],
      ['4100', 'income'],
    ]),
  });
  assert.equal(report.sales.length, 0);
  assert.equal(report.purchases.length, 0);
});

test('Tax report uses tax_label lines only when the entry has labels', () => {
  const lines = [
    { id: 'ar', entry_id: 'e1', account_id: '1300', debit: 118000, credit: 0, tax_label: 'GST 18% (18.0%)', source_type: 'customer_invoice' },
    { id: 'rev', entry_id: 'e1', account_id: '4100', debit: 0, credit: 100000, tax_label: 'GST 18% (18.0%)', source_type: 'customer_invoice' },
    { id: 'tax', entry_id: 'e1', account_id: '2200', debit: 0, credit: 18000, tax_label: 'GST 18% (18.0%)', source_type: 'customer_invoice' },
  ];
  const report = aggregateTaxReportFromJournalLines({
    lines,
    masters: [
      {
        id: 'tax-s',
        type: 'sales_tax',
        rate_value: 18,
        invoice_label: 'GST 18%',
        name: 'GST Sales 18%',
        account_id: '2200',
      },
    ],
    accountClassById: new Map([
      ['1300', 'asset'],
      ['4100', 'income'],
      ['2200', 'liability'],
    ]),
    accountTypeById: new Map([
      ['1300', 'receivable'],
      ['4100', 'income'],
      ['2200', 'current_liabilities'],
    ]),
  });
  assert.equal(report.sales.length, 1);
  assert.equal(report.sales[0].tax, 18000);
  assert.equal(report.sales[0].net, 100000);
});

test('Asset straight-line schedule depreciates original minus salvage into posted-ready lines', async () => {
  const { buildAssetDepreciationSchedule, computeBookValue } = await import(
    '../accounting-assets'
  );
  const lines = buildAssetDepreciationSchedule({
    originalValue: 123456,
    salvageValue: 0,
    method: 'straight_line',
    methodPeriod: 'monthly',
    numberOfDepreciations: 12,
    firstDepreciationDate: '2026-08-01',
  });
  assert.equal(lines.length, 12);
  const total = lines.reduce((s, l) => s + l.amount, 0);
  assert.equal(Math.round(total * 100) / 100, 123456);
  assert.equal(lines[0].amount, 10288);
  assert.equal(lines[0].depreciation_date, '2026-08-01');
  assert.equal(computeBookValue(123456, lines[0].amount), 113168);
});

test('Loan reducing-balance schedule principal sums to original and closes at zero', async () => {
  const { buildLoanAmortizationSchedule, summarizeLoanSchedule } = await import(
    '../accounting-loans'
  );
  const lines = buildLoanAmortizationSchedule({
    principal: 55555,
    annualRatePercent: 12,
    numberOfInstallments: 12,
    firstInstallmentDate: '2026-08-01',
    frequency: 'monthly',
    interestMethod: 'reducing_balance',
  });
  assert.equal(lines.length, 12);
  const principalSum = Math.round(
    lines.reduce((s, l) => s + l.principal_amount, 0) * 100
  ) / 100;
  assert.equal(principalSum, 55555);
  assert.equal(lines[lines.length - 1].closing_balance, 0);
  assert.ok(lines[0].interest_amount > 0);
  const summary = summarizeLoanSchedule(lines);
  assert.equal(summary.totalPrincipal, 55555);
  assert.ok(summary.totalInterest > 0);
});

test('Journal entry source hrefs connect assets, depreciation, loans, and repayments', async () => {
  const { journalEntrySourceHref } = await import('../accounting-journal-navigation');
  assert.equal(
    journalEntrySourceHref({
      entryId: 'je-1',
      sourceType: 'asset_purchase',
      sourceId: 'asset-1',
    }),
    '/accounting/assets/asset-1'
  );
  assert.equal(
    journalEntrySourceHref({
      entryId: 'je-2',
      sourceType: 'asset_depreciation',
      sourceId: 'dep-1',
    }),
    '/accounting/review/depreciation-schedule?line=dep-1'
  );
  assert.equal(
    journalEntrySourceHref({
      entryId: 'je-3',
      sourceType: 'loan_disbursement',
      sourceId: 'loan-1',
    }),
    '/accounting/loans/loan-1'
  );
  assert.equal(
    journalEntrySourceHref({
      entryId: 'je-4',
      sourceType: 'loan_repayment',
      sourceId: 'inst-1',
    }),
    '/accounting/loans/installment/inst-1'
  );
});

test('Invoiced not delivered qty is invoiced minus delivered, never negative', async () => {
  const { invoicedNotDeliveredQty } = await import('./invoiced-not-delivered');
  assert.equal(invoicedNotDeliveredQty(10, 4), 6);
  assert.equal(invoicedNotDeliveredQty(10, 10), 0);
  assert.equal(invoicedNotDeliveredQty(4, 10), 0);
  assert.equal(invoicedNotDeliveredQty(0, 0), 0);
});

test('Deferred review does not claim a recognition engine', async () => {
  const { DEFERRED_RECOGNITION_ENGINE_SUPPORTED } = await import(
    './financial-reporting/deferred-report'
  );
  assert.equal(DEFERRED_RECOGNITION_ENGINE_SUPPORTED, false);
});
