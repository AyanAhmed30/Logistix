/**
 * Sales → Accounting access bridge (Odoo-style).
 * Sales users who create invoices from Sales Orders get Billing-level
 * Accounting access so Create Invoice → open draft works without Access Denied.
 * Explicit Accounting roles always win when present.
 */
import {
  getAccountingAccessLevel,
  type AccountingAccessLevel,
} from '@/lib/accounting-roles';
import { hasSalesAccess } from '@/lib/module-permissions';

export type AccountingAccessIdentity = {
  isSuperAdmin?: boolean;
  /** Session / app user role (e.g. sales_agent, user) */
  role?: string | null;
  permissions?: string[] | null;
};

function identityHasSalesAccess(identity: AccountingAccessIdentity): boolean {
  if (identity.role === 'sales_agent') return true;
  return hasSalesAccess(identity.permissions);
}

/** Effective Accounting level: explicit role, else Sales ⇒ Billing. */
export function resolveEffectiveAccountingLevel(
  identity: AccountingAccessIdentity
): AccountingAccessLevel {
  if (identity.isSuperAdmin) return 'admin';
  const explicit = getAccountingAccessLevel(identity.permissions);
  if (explicit !== 'no') return explicit;
  if (identityHasSalesAccess(identity)) return 'billing';
  return 'no';
}

export function hasEffectiveAccountingAccess(
  identity: AccountingAccessIdentity
): boolean {
  return resolveEffectiveAccountingLevel(identity) !== 'no';
}
