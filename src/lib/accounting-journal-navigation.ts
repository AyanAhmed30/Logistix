/**
 * Odoo-style Journal Entry list navigation:
 * auto entries → source document; manual → JE form.
 * Driven by source_type + source_id (not reference parsing).
 */

import type { AccountingJournalEntrySourceType } from '@/app/actions/accounting/journal-entries';

export function journalEntrySourceHref(args: {
  entryId: string;
  sourceType?: AccountingJournalEntrySourceType | string | null;
  sourceId?: string | null;
  isManual?: boolean | null;
}): string {
  const entryId = String(args.entryId || '').trim();
  const sourceId = args.sourceId ? String(args.sourceId).trim() : '';
  const sourceType = String(args.sourceType || '').trim();

  // Prefer relational source links whenever present (Odoo behavior).
  if (sourceId && sourceType && sourceType !== 'manual') {
    switch (sourceType) {
      case 'customer_invoice':
      case 'invoice':
        return `/accounting/invoices/${sourceId}`;
      case 'customer_payment':
      case 'payment':
        return `/accounting/payments/${sourceId}`;
      case 'credit_note':
        return `/accounting/credit-notes/${sourceId}`;
      case 'vendor_bill':
        return `/accounting/bills/${sourceId}`;
      case 'vendor_payment':
        return `/accounting/vendor-payments/${sourceId}`;
      case 'vendor_refund':
        return `/accounting/vendor-refunds/${sourceId}`;
      case 'asset_purchase':
      case 'asset_disposal':
        return `/accounting/assets/${sourceId}`;
      case 'asset_depreciation':
        return `/accounting/journal-entries/${entryId}`;
      case 'loan_disbursement':
        return `/accounting/loans/${sourceId}`;
      case 'loan_repayment':
        // source_id is installment id — open JE form; loan linked via reference
        return `/accounting/journal-entries/${entryId}`;
      case 'tax_return':
        return `/accounting/tax-returns/${sourceId}`;
      case 'year_closing':
        return `/accounting/configuration/lock-dates`;
      default:
        break;
    }
  }

  return `/accounting/journal-entries/${entryId}`;
}
