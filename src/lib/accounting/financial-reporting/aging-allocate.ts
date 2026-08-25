/**
 * Allocate a partner's posted AR/AP outstanding onto documents for aging buckets.
 * Grand total is always the ledger outstanding — documents only provide due dates.
 */

import { round2 } from '@/lib/accounting/financial-reporting/types';

export type AgingAllocDocument = {
  id: string;
  reference: string;
  due_date: string;
  document_date: string;
  journal_entry_id: string | null;
  /** Max amount to put on this document (document residual). 0 = skip. */
  cap: number;
};

export type AgingAllocResult = {
  document_id: string;
  reference: string;
  due_date: string;
  document_date: string;
  journal_entry_id: string | null;
  amount: number;
};

/**
 * FIFO by due date. Leftover ledger residual (no remaining document cap)
 * is returned as a synthetic "Posted journal items" row.
 */
export function allocateOutstandingToDocuments(opts: {
  outstanding: number;
  documents: AgingAllocDocument[];
  leftoverReference?: string;
  asOf: string;
}): AgingAllocResult[] {
  const leftoverRef = opts.leftoverReference || 'Posted journal items';
  let remaining = round2(opts.outstanding);
  if (Math.abs(remaining) < 0.004) return [];

  const docs = opts.documents
    .slice()
    .filter((d) => (Number(d.cap) || 0) > 0.004)
    .sort((a, b) => {
      const dd = String(a.due_date).localeCompare(String(b.due_date));
      if (dd !== 0) return dd;
      return String(a.document_date).localeCompare(String(b.document_date));
    });

  const out: AgingAllocResult[] = [];
  const positive = remaining > 0;

  for (const doc of docs) {
    if (Math.abs(remaining) < 0.004) break;
    const cap = round2(Math.max(0, Number(doc.cap) || 0));
    if (cap < 0.004) continue;
    const take = positive
      ? round2(Math.min(remaining, cap))
      : round2(-Math.min(Math.abs(remaining), cap));
    if (Math.abs(take) < 0.004) continue;
    out.push({
      document_id: doc.id,
      reference: doc.reference,
      due_date: doc.due_date,
      document_date: doc.document_date,
      journal_entry_id: doc.journal_entry_id,
      amount: take,
    });
    remaining = round2(remaining - take);
  }

  if (Math.abs(remaining) > 0.004) {
    out.push({
      document_id: `ledger:${opts.asOf}`,
      reference: leftoverRef,
      due_date: opts.asOf,
      document_date: opts.asOf,
      journal_entry_id: null,
      amount: remaining,
    });
  }

  return out;
}

export function partnerOutstandingFromFacts(
  side: 'receivable' | 'payable',
  debit: number,
  credit: number
) {
  const d = Number(debit) || 0;
  const c = Number(credit) || 0;
  return side === 'receivable' ? round2(d - c) : round2(c - d);
}
