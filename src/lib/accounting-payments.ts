export type AccountingPaymentMethod = 'cash' | 'bank_transfer' | 'cheque';

export type AccountingPaymentState =
  | 'not_paid'
  | 'in_payment'
  | 'partial'
  | 'paid'
  | 'overdue';

export type AccountingPaymentJournal = 'bank' | 'cash';

const METHOD_LABELS: Record<AccountingPaymentMethod, string> = {
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
};

export function paymentMethodLabel(method: string) {
  return METHOD_LABELS[method as AccountingPaymentMethod] || method;
}

export function paymentStateLabel(state: string) {
  switch (state) {
    case 'not_paid':
      return 'Not Paid';
    case 'in_payment':
      return 'In Payment';
    case 'partial':
      return 'Partial';
    case 'paid':
      return 'Paid';
    case 'overdue':
      return 'Overdue';
    default:
      return state;
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Open amount from document total, payments applied to the document,
 * and posted credit notes / vendor refunds. Single formula for write-back.
 */
export function outstandingFromComponents(opts: {
  total: number;
  amountPaid: number;
  adjustments?: number;
}): number {
  return round2(
    Math.max(
      0,
      (Number(opts.total) || 0) -
        (Number(opts.amountPaid) || 0) -
        (Number(opts.adjustments) || 0)
    )
  );
}

/**
 * Posted credit notes already reduce invoice residual via adjustments.
 * Only customer payments may increase amount_paid during a match.
 */
export function invoicePaidDeltaFromReconcileCredits(opts: {
  invoiceDebitAmount: number;
  remainingPaymentCredits: number;
}): { paidDelta: number; remainingPaymentCredits: number } {
  const debit = round2(Math.max(0, Number(opts.invoiceDebitAmount) || 0));
  const remaining = round2(Math.max(0, Number(opts.remainingPaymentCredits) || 0));
  const paidDelta = round2(Math.min(debit, remaining));
  return {
    paidDelta,
    remainingPaymentCredits: round2(Math.max(0, remaining - paidDelta)),
  };
}

/** Portion of a credit note that absorbs open invoice residual (Odoo auto-reconcile). */
export function creditNoteAppliedToOpenInvoice(opts: {
  creditNoteTotal: number;
  invoiceOpenBeforeNote: number;
}): number {
  return round2(
    Math.min(
      Math.max(0, Number(opts.creditNoteTotal) || 0),
      Math.max(0, Number(opts.invoiceOpenBeforeNote) || 0)
    )
  );
}

/**
 * Amount of a payment that actually reduces document residual.
 * Unreconciled bank (outstanding receipts) does not reduce Amount Due.
 */
export function appliedPaymentAmount(opts: {
  amount: number;
  reconcile_status?: string | null;
  amount_reconciled?: number | null;
}): number {
  const amount = round2(Math.max(0, Number(opts.amount) || 0));
  const status = String(opts.reconcile_status || '')
    .trim()
    .toLowerCase();
  if (status === 'outstanding' || status === 'unreconciled') return 0;
  if (status === 'partial') {
    return round2(Math.max(0, Number(opts.amount_reconciled) || 0));
  }
  return amount;
}

/** Read-path snapshot: stored residual wins; preserve In Payment. */
export function documentPaymentSnapshot(opts: {
  total: number;
  amountPaid: number;
  dueDate: string | null | undefined;
  workflowStatus: string;
  amountResidual?: number | null;
  storedPaymentState?: string | null;
  journal?: AccountingPaymentJournal | null;
}) {
  return computePaymentState({
    total: opts.total,
    amountPaid: opts.amountPaid,
    dueDate: opts.dueDate,
    workflowStatus: opts.workflowStatus,
    amountResidual: opts.amountResidual,
    journal: opts.journal,
    preferInPayment: opts.storedPaymentState === 'in_payment',
  });
}

export function computePaymentState(opts: {
  total: number;
  amountPaid: number;
  dueDate: string | null | undefined;
  workflowStatus: string;
  /** Bank payments stay In Payment until treated as reconciled (cash → Paid). */
  journal?: AccountingPaymentJournal | null;
  preferInPayment?: boolean;
  /**
   * Posted residual from the invoice/bill (payments + credit notes / refunds).
   * Prefer this over total − paid so Review/Reporting/dashboard share one outstanding.
   */
  amountResidual?: number | null;
}): {
  paymentState: AccountingPaymentState;
  outstanding: number;
  amountPaid: number;
} {
  const total = round2(Math.max(0, opts.total));
  const amountPaid = round2(Math.max(0, opts.amountPaid));
  const outstanding =
    opts.amountResidual != null && Number.isFinite(Number(opts.amountResidual))
      ? round2(Math.max(0, Number(opts.amountResidual)))
      : round2(Math.max(0, total - amountPaid));

  if (opts.workflowStatus === 'cancelled') {
    return {
      paymentState: amountPaid > 0 ? (outstanding <= 0.004 ? 'paid' : 'partial') : 'not_paid',
      outstanding,
      amountPaid,
    };
  }

  // Draft invoices are never Paid/Partial until posted (Odoo: Draft → Posted → Paid)
  if (opts.workflowStatus === 'draft') {
    return {
      paymentState: 'not_paid',
      outstanding,
      amountPaid,
    };
  }

  const bankStyle = opts.preferInPayment === true || opts.journal === 'bank';

  if (outstanding <= 0.004) {
    if (amountPaid > 0.004 && bankStyle) {
      return { paymentState: 'in_payment', outstanding: 0, amountPaid };
    }
    return { paymentState: 'paid', outstanding: 0, amountPaid };
  }
  if (amountPaid > 0.004 || (bankStyle && opts.preferInPayment)) {
    if (bankStyle) {
      return { paymentState: 'in_payment', outstanding, amountPaid };
    }
    return { paymentState: 'partial', outstanding, amountPaid };
  }

  const due = opts.dueDate ? new Date(opts.dueDate) : null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (due && !Number.isNaN(due.getTime()) && due < today) {
    return { paymentState: 'overdue', outstanding, amountPaid };
  }

  return { paymentState: 'not_paid', outstanding, amountPaid };
}
