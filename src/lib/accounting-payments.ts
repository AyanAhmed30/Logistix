export type AccountingPaymentMethod = 'cash' | 'bank_transfer' | 'cheque';

export type AccountingPaymentState =
  | 'not_paid'
  | 'partial'
  | 'paid'
  | 'overdue';

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

export function computePaymentState(opts: {
  total: number;
  amountPaid: number;
  dueDate: string | null | undefined;
  workflowStatus: string;
}): {
  paymentState: AccountingPaymentState;
  outstanding: number;
  amountPaid: number;
} {
  const total = round2(Math.max(0, opts.total));
  const amountPaid = round2(Math.max(0, opts.amountPaid));
  const outstanding = round2(Math.max(0, total - amountPaid));

  if (opts.workflowStatus === 'cancelled') {
    return {
      paymentState: amountPaid > 0 ? (outstanding <= 0.004 ? 'paid' : 'partial') : 'not_paid',
      outstanding,
      amountPaid,
    };
  }

  if (outstanding <= 0.004) {
    return { paymentState: 'paid', outstanding: 0, amountPaid };
  }
  if (amountPaid > 0.004) {
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
