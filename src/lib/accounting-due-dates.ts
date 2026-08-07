/**
 * Due-date helpers — re-export Payment Terms Engine for backward compatibility.
 * Prefer importing from `@/lib/accounting-payment-terms` for new code.
 */

export {
  parsePaymentTermDays,
  addDaysIso,
  endOfNextMonthIso,
  computeDueDateFromTerms,
  computePaymentSchedule,
  agingBucketFromDaysOverdue,
  daysOverdueFromDueDate,
} from '@/lib/accounting-payment-terms';
