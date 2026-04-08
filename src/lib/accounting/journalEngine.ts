export type JournalEngineLine = {
  debit_amount: number;
  credit_amount: number;
};

export type JournalEngineEntry = {
  lines: JournalEngineLine[];
};

function toAmount(value: number) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function validateJournalEntry(entry: JournalEngineEntry) {
  const lines = Array.isArray(entry.lines) ? entry.lines : [];

  if (lines.length < 2) {
    throw new Error('Journal entry must have at least two lines');
  }

  let totalDebit = 0;
  let totalCredit = 0;
  let hasDebit = false;
  let hasCredit = false;

  for (const line of lines) {
    const debit = toAmount(line.debit_amount);
    const credit = toAmount(line.credit_amount);

    if (debit < 0 || credit < 0) {
      throw new Error('Invalid negative values in entry');
    }

    if (debit > 0) hasDebit = true;
    if (credit > 0) hasCredit = true;

    totalDebit += debit;
    totalCredit += credit;
  }

  totalDebit = roundAmount(totalDebit);
  totalCredit = roundAmount(totalCredit);

  if (!hasDebit || !hasCredit) {
    throw new Error('Entry must contain both debit and credit lines');
  }

  if (totalDebit !== totalCredit) {
    throw new Error('Total debit and credit must be equal');
  }
}

export function assertDraftForPosting(status: string) {
  if (status !== 'draft') {
    throw new Error('Only draft entries can be posted');
  }
}

export function assertMutableEntry(status: string) {
  if (status === 'posted') {
    throw new Error('Posted entries cannot be modified. Use reversal.');
  }
}

export function buildReversalLines<T extends { debit_amount: number; credit_amount: number }>(lines: T[]) {
  return lines.map((line) => ({
    ...line,
    debit_amount: line.credit_amount,
    credit_amount: line.debit_amount,
  }));
}
