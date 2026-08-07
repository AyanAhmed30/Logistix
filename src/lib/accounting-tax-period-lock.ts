/**
 * Shared tax period lock checks — re-exports unified lock engine.
 * Prefer getAccountingDocumentLockError for domain-specific checks.
 */

export {
  getAccountingDocumentLockError,
  getTaxPeriodLockError,
  type AccountingLockDomain,
} from '@/lib/accounting-lock-dates';
