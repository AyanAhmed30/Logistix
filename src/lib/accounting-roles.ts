/**
 * Accounting access levels (Odoo-inspired).
 * Stored as permission keys on app_users.permissions.
 */

export type AccountingAccessLevel = 'no' | 'billing' | 'accountant' | 'admin';

export const ACCOUNTING_ACCESS_LEVEL_OPTIONS: Array<{
  value: AccountingAccessLevel;
  label: string;
  key: string | null;
}> = [
  { value: 'no', label: 'No Access', key: null },
  { value: 'billing', label: 'Billing User', key: 'accounting-billing' },
  { value: 'accountant', label: 'Accountant', key: 'accounting-accountant' },
  { value: 'admin', label: 'Accounting Administrator', key: 'accounting-admin' },
];

export const ACCOUNTING_ACCESS_LEVEL_KEYS = {
  billing: 'accounting-billing',
  accountant: 'accounting-accountant',
  admin: 'accounting-admin',
} as const;

const LEVEL_KEYS = new Set<string>(Object.values(ACCOUNTING_ACCESS_LEVEL_KEYS));

export function parseAccountingPermissionKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((k) => String(k || '').trim()).filter(Boolean))];
  }
  return [];
}

export function getAccountingAccessLevel(
  permissions: string[] | null | undefined
): AccountingAccessLevel {
  const keys = parseAccountingPermissionKeys(permissions);
  if (keys.includes(ACCOUNTING_ACCESS_LEVEL_KEYS.admin) || keys.includes('accounting-admin')) {
    return 'admin';
  }
  if (keys.includes(ACCOUNTING_ACCESS_LEVEL_KEYS.accountant)) return 'accountant';
  if (keys.includes(ACCOUNTING_ACCESS_LEVEL_KEYS.billing)) return 'billing';
  // Legacy parent-only key ⇒ accountant (safe default for granted module)
  if (keys.includes('accounting') && !keys.some((k) => LEVEL_KEYS.has(k))) {
    return 'accountant';
  }
  return 'no';
}

export function accountingAccessLevelKey(
  level: AccountingAccessLevel
): string | null {
  return ACCOUNTING_ACCESS_LEVEL_OPTIONS.find((o) => o.value === level)?.key ?? null;
}

/** Strip accounting keys then apply chosen level. */
export function applyAccountingAccessLevel(
  permissions: string[],
  level: AccountingAccessLevel
): string[] {
  const next = parseAccountingPermissionKeys(permissions).filter(
    (k) => k !== 'accounting' && !LEVEL_KEYS.has(k)
  );
  if (level === 'no') return [...new Set(next)];
  const levelKey = accountingAccessLevelKey(level);
  if (levelKey) next.push(levelKey);
  next.push('accounting');
  return [...new Set(next)];
}

export function hasAccountingAccess(permissions: string[] | null | undefined): boolean {
  return getAccountingAccessLevel(permissions) !== 'no';
}

/** Capability matrix */
export function accountingCanViewCustomers(level: AccountingAccessLevel) {
  return level !== 'no';
}

export function accountingCanManageInvoices(level: AccountingAccessLevel) {
  return level === 'billing' || level === 'accountant' || level === 'admin';
}

export function accountingCanRegisterPayments(level: AccountingAccessLevel) {
  return level === 'billing' || level === 'accountant' || level === 'admin';
}

export function accountingCanDeleteInvoices(level: AccountingAccessLevel) {
  return level === 'accountant' || level === 'admin';
}

export function accountingCanAccessReports(level: AccountingAccessLevel) {
  return level === 'accountant' || level === 'admin';
}

export function accountingCanManageCreditNotes(level: AccountingAccessLevel) {
  return level === 'accountant' || level === 'admin';
}

export function accountingCanManageRefunds(level: AccountingAccessLevel) {
  return level === 'accountant' || level === 'admin';
}

export function accountingCanManageConfig(level: AccountingAccessLevel) {
  return level === 'admin';
}

export function accountingCanManageAutomation(level: AccountingAccessLevel) {
  return level === 'admin';
}

export function accountingCanExportReports(level: AccountingAccessLevel) {
  return level === 'accountant' || level === 'admin';
}

/** Lock dates, journal locks, period locks — Accountant+ */
export function accountingCanManageLockDates(level: AccountingAccessLevel) {
  return level === 'accountant' || level === 'admin';
}

/** Year-end close / reopen / hard lock — Admin only (also uses accountingCanManageConfig) */
export function accountingCanCloseFiscalYear(level: AccountingAccessLevel) {
  return level === 'admin';
}
