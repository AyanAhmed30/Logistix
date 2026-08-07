/**
 * Journals foundation helpers (Odoo-style transaction engine).
 * Shared by Configuration UI and all accounting consumers.
 */

export type AccountingJournalType =
  | 'sales'
  | 'purchase'
  | 'bank'
  | 'cash'
  | 'general';

export const ACCOUNTING_JOURNAL_TYPES: {
  value: AccountingJournalType;
  label: string;
}[] = [
  { value: 'sales', label: 'Sales' },
  { value: 'purchase', label: 'Purchase' },
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'general', label: 'Miscellaneous' },
];

import { FALLBACK_CURRENCY_CODES } from '@/lib/accounting-currencies';

/** @deprecated Prefer searchAccountingCurrencies / Currency Engine. */
export const ACCOUNTING_JOURNAL_CURRENCIES = FALLBACK_CURRENCY_CODES;

export function accountingJournalTypeLabel(t: string | null | undefined): string {
  const hit = ACCOUNTING_JOURNAL_TYPES.find((x) => x.value === t);
  return hit?.label || String(t || '—');
}

export function normalizeJournalCode(code: string) {
  return String(code || '').trim().toUpperCase();
}

export function normalizeJournalName(name: string) {
  return String(name || '').trim();
}

export function defaultSequencePrefix(code: string, type: AccountingJournalType) {
  const c = normalizeJournalCode(code);
  if (c) return c;
  switch (type) {
    case 'sales':
      return 'SJ';
    case 'purchase':
      return 'PJ';
    case 'bank':
      return 'BNK';
    case 'cash':
      return 'CSH';
    default:
      return 'MISC';
  }
}

export const JOURNAL_CSV_HEADERS = [
  'code',
  'name',
  'type',
  'currency',
  'default_debit_account_code',
  'default_credit_account_code',
  'sequence_prefix',
  'is_active',
  'notes',
] as const;

export function journalsToCsv(
  rows: Array<{
    code: string;
    name: string;
    type: string;
    currency: string;
    default_debit_account_code?: string | null;
    default_credit_account_code?: string | null;
    sequence_prefix?: string | null;
    is_active: boolean;
    notes?: string | null;
  }>
) {
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    JOURNAL_CSV_HEADERS.join(','),
    ...rows.map((r) =>
      [
        r.code,
        r.name,
        r.type,
        r.currency || 'PKR',
        r.default_debit_account_code || '',
        r.default_credit_account_code || '',
        r.sequence_prefix || '',
        r.is_active ? '1' : '0',
        r.notes || '',
      ]
        .map(escape)
        .join(',')
    ),
  ];
  return lines.join('\n');
}

export function parseJournalCsv(text: string): Array<{
  code: string;
  name: string;
  type: string;
  currency: string;
  default_debit_account_code: string;
  default_credit_account_code: string;
  sequence_prefix: string;
  is_active: boolean;
  notes: string;
}> {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const parseLine = (line: string) => {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') {
          inQ = false;
        } else {
          cur += ch;
        }
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const header = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const get = (cols: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? String(cols[i] || '').trim() : '';
  };

  return lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const active = get(cols, 'is_active');
    return {
      code: get(cols, 'code'),
      name: get(cols, 'name'),
      type: get(cols, 'type'),
      currency: (get(cols, 'currency') || 'PKR').toUpperCase(),
      default_debit_account_code: get(cols, 'default_debit_account_code'),
      default_credit_account_code: get(cols, 'default_credit_account_code'),
      sequence_prefix: get(cols, 'sequence_prefix'),
      is_active: active === '' || active === '1' || /^true$/i.test(active),
      notes: get(cols, 'notes'),
    };
  });
}
