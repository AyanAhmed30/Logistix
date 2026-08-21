/**
 * Chart of Accounts foundation helpers (Odoo-style).
 * Shared by Configuration UI and all accounting consumers.
 */

export type CoaClassification =
  | 'asset'
  | 'liability'
  | 'equity'
  | 'income'
  | 'expense'
  | 'view';

export type CoaAccountType =
  | 'receivable'
  | 'bank'
  | 'cash'
  | 'current_assets'
  | 'fixed_assets'
  | 'non_current_assets'
  | 'prepayments'
  | 'deferred_revenue'
  | 'payable'
  | 'credit_card'
  | 'current_liabilities'
  | 'non_current_liabilities'
  | 'equity'
  | 'retained_earnings'
  | 'current_year_earnings'
  | 'income'
  | 'other_income'
  | 'cost_of_revenue'
  | 'expense'
  | 'depreciation'
  | 'administrative'
  | 'view';

export const COA_ACCOUNT_TYPES_BY_CLASSIFICATION: Record<
  Exclude<CoaClassification, 'view'>,
  { value: CoaAccountType; label: string }[]
> = {
  asset: [
    { value: 'receivable', label: 'Receivable' },
    { value: 'bank', label: 'Bank' },
    { value: 'cash', label: 'Cash' },
    { value: 'current_assets', label: 'Current Assets' },
    { value: 'fixed_assets', label: 'Fixed Assets' },
    { value: 'non_current_assets', label: 'Non-current Assets' },
    { value: 'prepayments', label: 'Prepayments' },
  ],
  liability: [
    { value: 'payable', label: 'Payable' },
    { value: 'credit_card', label: 'Credit Card' },
    { value: 'current_liabilities', label: 'Current Liabilities' },
    { value: 'deferred_revenue', label: 'Deferred Revenue' },
    { value: 'non_current_liabilities', label: 'Non-current Liabilities' },
  ],
  equity: [
    { value: 'equity', label: 'Equity' },
    { value: 'retained_earnings', label: 'Retained Earnings' },
    { value: 'current_year_earnings', label: 'Current Year Earnings' },
  ],
  income: [
    { value: 'income', label: 'Sales / Income' },
    { value: 'other_income', label: 'Other Income' },
  ],
  expense: [
    { value: 'cost_of_revenue', label: 'Cost of Revenue' },
    { value: 'expense', label: 'Operating Expense' },
    { value: 'administrative', label: 'Administrative Expense' },
    { value: 'depreciation', label: 'Depreciation' },
  ],
};

export function coaAccountTypeLabel(t: string | null | undefined): string {
  if (!t) return '—';
  const all = Object.values(COA_ACCOUNT_TYPES_BY_CLASSIFICATION).flat();
  return all.find((x) => x.value === t)?.label || t.replace(/_/g, ' ');
}

export function coaClassificationLabel(t: string | null | undefined): string {
  switch (t) {
    case 'asset':
      return 'Assets';
    case 'liability':
      return 'Liabilities';
    case 'equity':
      return 'Equity';
    case 'income':
      return 'Income';
    case 'expense':
      return 'Expenses';
    case 'view':
      return 'View / Group';
    default:
      return String(t || '—');
  }
}

export function getCoaNormalBalance(
  type: CoaClassification
): 'debit' | 'credit' | 'none' {
  if (type === 'asset' || type === 'expense') return 'debit';
  if (type === 'liability' || type === 'equity' || type === 'income') return 'credit';
  return 'none';
}

export function normalizeCoaCode(code: string) {
  return String(code || '').trim().toUpperCase();
}

export function defaultAccountTypeForClassification(
  classification: CoaClassification
): CoaAccountType {
  if (classification === 'view') return 'view';
  const list = COA_ACCOUNT_TYPES_BY_CLASSIFICATION[classification];
  return list[0]?.value || 'expense';
}

/** CSV header for export/import */
export const COA_CSV_HEADERS = [
  'code',
  'name',
  'classification',
  'account_type',
  'parent_code',
  'allow_reconciliation',
  'is_active',
  'notes',
] as const;

export function accountsToCsv(
  rows: Array<{
    code: string;
    name: string;
    type: string;
    account_type: string | null;
    parent_code?: string | null;
    allow_reconciliation: boolean;
    is_active: boolean;
    notes?: string | null;
  }>
) {
  const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
  const lines = [
    COA_CSV_HEADERS.join(','),
    ...rows.map((r) =>
      [
        r.code,
        r.name,
        r.type,
        r.account_type || '',
        r.parent_code || '',
        r.allow_reconciliation ? '1' : '0',
        r.is_active ? '1' : '0',
        r.notes || '',
      ]
        .map(escape)
        .join(',')
    ),
  ];
  return lines.join('\n');
}

export function parseCoaCsv(text: string): Array<{
  code: string;
  name: string;
  classification: string;
  account_type: string;
  parent_code: string;
  allow_reconciliation: boolean;
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

  return lines.slice(1).map((line) => {
    const cols = parseLine(line);
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? String(cols[i] || '').trim() : '';
    };
    const active = get('is_active');
    const recon = get('allow_reconciliation');
    return {
      code: get('code'),
      name: get('name'),
      classification: get('classification') || get('type'),
      account_type: get('account_type'),
      parent_code: get('parent_code'),
      allow_reconciliation: recon === '1' || /^true$/i.test(recon),
      is_active: active === '' || active === '1' || /^true$/i.test(active),
      notes: get('notes'),
    };
  });
}
