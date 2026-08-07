/**
 * Payment Terms Engine (Odoo-inspired).
 * Single source of truth for due dates and payment schedules.
 * Backward compatible with free-text payment_terms via parsePaymentTermDays.
 */

export type PaymentTermDelayType =
  | 'days_after'
  | 'days_after_end_of_month'
  | 'days_end_of_month';

export type PaymentTermValueType = 'percent' | 'fixed';

export type PaymentTermLineDef = {
  id?: string;
  sequence: number;
  value_amount_type: PaymentTermValueType;
  value_amount: number;
  nb_days: number;
  delay_type: PaymentTermDelayType;
};

export type PaymentTermDef = {
  id: string;
  name: string;
  code?: string | null;
  note?: string | null;
  lines: PaymentTermLineDef[];
};

export type PaymentScheduleItem = {
  sequence: number;
  due_date: string;
  /** Amount for this installment (when total known) */
  amount: number;
  /** Percent of total (0–100) when percent-based */
  percent: number;
  value_amount_type: PaymentTermValueType;
  nb_days: number;
  delay_type: PaymentTermDelayType;
};

export type PaymentScheduleResult = {
  /** Document-level due date (latest installment — when fully due) */
  due_date: string | null;
  /** Earliest installment due date */
  earliest_due_date: string | null;
  schedule: PaymentScheduleItem[];
  term_name: string | null;
};

export function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function endOfMonthIso(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return end.toISOString().slice(0, 10);
}

export function endOfNextMonthIso(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  const end = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  return end.toISOString().slice(0, 10);
}

/** Legacy free-text parser (Immediate, Net 30, 15 Days, End of Next Month). */
export function parsePaymentTermDays(paymentTerms: string | null | undefined): number {
  const raw = String(paymentTerms || '').trim().toLowerCase();
  if (!raw || raw.includes('immediate')) return 0;

  const net = raw.match(/net\s*(\d+)/i);
  if (net) return Math.max(0, Number(net[1]) || 0);

  const days = raw.match(/(\d+)\s*days?/i);
  if (days) return Math.max(0, Number(days[1]) || 0);

  if (raw.includes('end of next month')) return -1;
  return 0;
}

function computeLineDueDate(
  baseDate: string,
  line: Pick<PaymentTermLineDef, 'nb_days' | 'delay_type'>
): string {
  const days = Math.max(0, Number(line.nb_days) || 0);
  switch (line.delay_type) {
    case 'days_after_end_of_month': {
      const eom = endOfMonthIso(baseDate);
      return addDaysIso(eom, days);
    }
    case 'days_end_of_month': {
      // Odoo-style: end of next month when nb_days=0 commonly; else EOM + days
      if (days === 0) return endOfNextMonthIso(baseDate);
      return addDaysIso(endOfMonthIso(baseDate), days);
    }
    case 'days_after':
    default:
      return addDaysIso(baseDate, days);
  }
}

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Compute payment schedule from a structured term.
 * Supports percent and fixed installments. Document due_date = latest due.
 */
export function computePaymentSchedule(args: {
  documentDate: string | null | undefined;
  term: PaymentTermDef | null | undefined;
  totalAmount?: number;
}): PaymentScheduleResult {
  const base = String(args.documentDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(base)) {
    return {
      due_date: null,
      earliest_due_date: null,
      schedule: [],
      term_name: args.term?.name || null,
    };
  }

  const lines = [...(args.term?.lines || [])].sort(
    (a, b) => (a.sequence || 0) - (b.sequence || 0)
  );

  if (!lines.length) {
    return {
      due_date: base,
      earliest_due_date: base,
      schedule: [
        {
          sequence: 10,
          due_date: base,
          amount: round2(args.totalAmount || 0),
          percent: 100,
          value_amount_type: 'percent',
          nb_days: 0,
          delay_type: 'days_after',
        },
      ],
      term_name: args.term?.name || null,
    };
  }

  const total = Math.max(0, Number(args.totalAmount) || 0);
  const percentLines = lines.filter((l) => l.value_amount_type === 'percent');
  const fixedLines = lines.filter((l) => l.value_amount_type === 'fixed');
  const fixedSum = fixedLines.reduce((s, l) => s + (Number(l.value_amount) || 0), 0);
  const remainingForPercent = Math.max(0, total - fixedSum);
  const percentSum = percentLines.reduce((s, l) => s + (Number(l.value_amount) || 0), 0) || 100;

  const schedule: PaymentScheduleItem[] = [];
  let allocated = 0;

  lines.forEach((line, idx) => {
    const due = computeLineDueDate(base, line);
    let amount = 0;
    let percent = 0;

    if (line.value_amount_type === 'fixed') {
      amount = round2(Number(line.value_amount) || 0);
      percent = total > 0 ? round2((amount / total) * 100) : 0;
    } else {
      percent = Number(line.value_amount) || 0;
      if (idx === lines.length - 1 && total > 0) {
        // Last line gets remainder to avoid rounding drift
        amount = round2(total - allocated);
      } else {
        amount = round2((remainingForPercent * percent) / percentSum);
      }
    }

    allocated = round2(allocated + amount);
    schedule.push({
      sequence: line.sequence || (idx + 1) * 10,
      due_date: due,
      amount,
      percent,
      value_amount_type: line.value_amount_type,
      nb_days: line.nb_days,
      delay_type: line.delay_type,
    });
  });

  const dates = schedule.map((s) => s.due_date).sort();
  return {
    due_date: dates[dates.length - 1] || base,
    earliest_due_date: dates[0] || base,
    schedule,
    term_name: args.term?.name || null,
  };
}

/**
 * Primary due date API used by invoices/bills.
 * Prefer structured term; fall back to free-text parser.
 */
export function computeDueDateFromTerms(
  documentDate: string | null | undefined,
  paymentTerms: string | null | undefined,
  term?: PaymentTermDef | null
): string | null {
  if (term && term.lines?.length) {
    return computePaymentSchedule({
      documentDate,
      term,
      totalAmount: 0,
    }).due_date;
  }

  const inv = String(documentDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inv)) return null;

  const days = parsePaymentTermDays(paymentTerms);
  if (days === -1) return endOfNextMonthIso(inv);
  return addDaysIso(inv, days);
}

/** Aging bucket from days overdue (Odoo AR/AP aging). */
export type AgingBucket = 'current' | '1_30' | '31_60' | '61_90' | '90_plus';

export function agingBucketFromDaysOverdue(daysOverdue: number): AgingBucket {
  const d = Math.max(0, Math.floor(Number(daysOverdue) || 0));
  if (d <= 0) return 'current';
  if (d <= 30) return '1_30';
  if (d <= 60) return '31_60';
  if (d <= 90) return '61_90';
  return '90_plus';
}

export function daysOverdueFromDueDate(
  dueDate: string | null | undefined,
  asOfDate?: string | null
): number {
  const due = String(dueDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return 0;
  const asOf = String(asOfDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const dueMs = new Date(`${due}T12:00:00`).getTime();
  const asOfMs = new Date(`${asOf}T12:00:00`).getTime();
  if (Number.isNaN(dueMs) || Number.isNaN(asOfMs)) return 0;
  return Math.max(0, Math.floor((asOfMs - dueMs) / 86400000));
}

export function agingBucketLabel(bucket: AgingBucket): string {
  switch (bucket) {
    case 'current':
      return 'Current';
    case '1_30':
      return '1–30 Days';
    case '31_60':
      return '31–60 Days';
    case '61_90':
      return '61–90 Days';
    case '90_plus':
      return '90+ Days';
    default:
      return '—';
  }
}

export function normalizePaymentTermCode(code: string) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
}
