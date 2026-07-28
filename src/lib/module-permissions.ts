import {
  ACCOUNTING_ACCESS_LEVEL_KEYS,
  applyAccountingAccessLevel,
  getAccountingAccessLevel,
  hasAccountingAccess,
  type AccountingAccessLevel,
} from '@/lib/accounting-roles';

export type {
  AccountingAccessLevel,
} from '@/lib/accounting-roles';

export {
  ACCOUNTING_ACCESS_LEVEL_OPTIONS,
  ACCOUNTING_ACCESS_LEVEL_KEYS,
  applyAccountingAccessLevel,
  getAccountingAccessLevel,
  hasAccountingAccess,
  accountingAccessLevelKey,
  accountingCanAccessReports,
  accountingCanManageConfig,
  accountingCanManageAutomation,
  accountingCanManageCreditNotes,
  accountingCanManageRefunds,
  accountingCanDeleteInvoices,
  accountingCanRegisterPayments,
  accountingCanExportReports,
} from '@/lib/accounting-roles';

/**
 * Central Access Rights registry (Odoo-style).
 *
 * Sales uses a single access level (No / Own / All / Administrator).
 * Accounting uses Billing / Accountant / Administrator levels.
 * CRM, Operations, Warehouse keep child-module checkboxes.
 */

export type ModuleDepartment = 'sales' | 'operations' | 'warehouse' | 'crm' | 'accounting';

export type ModulePermissionDef = {
  key: string;
  label: string;
  department: ModuleDepartment;
};

/** Odoo Community Sales access levels. */
export type SalesAccessLevel = 'no' | 'own' | 'all' | 'admin';

export const SALES_ACCESS_LEVEL_OPTIONS: Array<{
  value: SalesAccessLevel;
  label: string;
  /** Stored permission key — null for No. */
  key: string | null;
}> = [
  { value: 'no', label: 'No', key: null },
  { value: 'own', label: 'User: Own Documents Only', key: 'sales-own' },
  { value: 'all', label: 'User: All Documents', key: 'sales-all' },
  { value: 'admin', label: 'Administrator', key: 'sales-admin' },
];

export const SALES_ACCESS_LEVEL_KEYS = {
  own: 'sales-own',
  all: 'sales-all',
  admin: 'sales-admin',
} as const;

/** Legacy Sales child keys (removed from UI — still recognized for migration). */
export const LEGACY_SALES_MODULE_KEYS = [
  'lead',
  'pipeline',
  'customer-list',
  'lead-transfer-tracking',
  'accounting',
  'inquiry-tracking',
  'customers',
  'quotations',
] as const;

/** @deprecated Empty — Sales no longer uses child checkboxes. Kept for type compat. */
export const SALES_MODULE_PERMISSIONS: ModulePermissionDef[] = [];

/** Top-level modules on the User Creation form. */
export const DEPARTMENT_ACCESS: Array<{ key: ModuleDepartment; label: string }> = [
  { key: 'sales', label: 'Sales' },
  { key: 'crm', label: 'CRM' },
  { key: 'accounting', label: 'Accounting' },
  { key: 'operations', label: 'Operations' },
  { key: 'warehouse', label: 'Warehouse' },
];

/** Accounting has no child checkboxes — access level only. */
export const ACCOUNTING_MODULE_PERMISSIONS: ModulePermissionDef[] = [];

/** Operations child modules. */
export const OPERATIONS_MODULE_PERMISSIONS: ModulePermissionDef[] = [
  { key: 'leads-inquiry', label: 'Lead Inquiry', department: 'operations' },
  { key: 'management', label: 'Order Management', department: 'operations' },
  { key: 'console', label: 'Console', department: 'operations' },
  { key: 'loading-instruction', label: 'Loading Instruction', department: 'operations' },
  { key: 'import-packing-list', label: 'Import Packing List', department: 'operations' },
  { key: 'import-invoice', label: 'Import Invoice', department: 'operations' },
  { key: 'inquiry-confirmation', label: 'Inquiry Confirmation', department: 'operations' },
  { key: 'calculator-config', label: 'Calculator Configuration', department: 'operations' },
];

/** CRM child modules. */
export const CRM_MODULE_PERMISSIONS: ModulePermissionDef[] = [
  { key: 'crm-pipeline', label: 'Pipeline', department: 'crm' },
  { key: 'crm-customers', label: 'Customers', department: 'crm' },
  { key: 'crm-activities', label: 'My Activities', department: 'crm' },
  { key: 'crm-reports', label: 'Reports', department: 'crm' },
];

/** Warehouse child modules. */
export const WAREHOUSE_MODULE_PERMISSIONS: ModulePermissionDef[] = [
  { key: 'warehouse-book-order', label: 'Book a New Order', department: 'warehouse' },
  { key: 'warehouse-history', label: 'History', department: 'warehouse' },
  { key: 'warehouse-scan-progress', label: 'Scan Progress', department: 'warehouse' },
  { key: 'warehouse-loading-instruction', label: 'Loading Instruction', department: 'warehouse' },
];

/** Hierarchical groups for the User form (Sales/Accounting use access levels). */
export const MODULE_PERMISSION_GROUPS = [
  { department: 'sales' as const, label: 'Sales', modules: SALES_MODULE_PERMISSIONS },
  { department: 'crm' as const, label: 'CRM', modules: CRM_MODULE_PERMISSIONS },
  { department: 'accounting' as const, label: 'Accounting', modules: ACCOUNTING_MODULE_PERMISSIONS },
  { department: 'operations' as const, label: 'Operations', modules: OPERATIONS_MODULE_PERMISSIONS },
  { department: 'warehouse' as const, label: 'Warehouse', modules: WAREHOUSE_MODULE_PERMISSIONS },
];

const LEGACY_SALES_KEYS = new Set<string>(LEGACY_SALES_MODULE_KEYS);
const SALES_LEVEL_KEYS = new Set<string>(Object.values(SALES_ACCESS_LEVEL_KEYS));
const ACCOUNTING_LEVEL_KEYS = new Set<string>(Object.values(ACCOUNTING_ACCESS_LEVEL_KEYS));
const CRM_KEYS = new Set(CRM_MODULE_PERMISSIONS.map((m) => m.key));
const OPS_KEYS = new Set(OPERATIONS_MODULE_PERMISSIONS.map((m) => m.key));
const WAREHOUSE_KEYS = new Set(WAREHOUSE_MODULE_PERMISSIONS.map((m) => m.key));

/** Contacts sidebar uses the `customers` permission key. */
export const CONTACTS_PERMISSION_KEY = 'customers';

export function parsePermissionKeys(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((k) => String(k || '').trim()).filter(Boolean))];
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      return parsePermissionKeys(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  return [];
}

export function getSalesAccessLevel(
  permissions: string[] | null | undefined
): SalesAccessLevel {
  const keys = parsePermissionKeys(permissions);
  if (keys.includes(SALES_ACCESS_LEVEL_KEYS.admin)) return 'admin';
  if (keys.includes(SALES_ACCESS_LEVEL_KEYS.all)) return 'all';
  if (keys.includes(SALES_ACCESS_LEVEL_KEYS.own)) return 'own';

  // Legacy: any sales parent or child ⇒ treat as All Documents (preserve access)
  if (
    keys.includes('sales') ||
    keys.some((k) => LEGACY_SALES_KEYS.has(k))
  ) {
    return 'all';
  }
  return 'no';
}

export function salesAccessLevelKey(level: SalesAccessLevel): string | null {
  return SALES_ACCESS_LEVEL_OPTIONS.find((o) => o.value === level)?.key ?? null;
}

/** Strip sales-related keys then apply the chosen Odoo Sales level + CRM/Contacts deps. */
export function applySalesAccessLevel(
  permissions: string[],
  level: SalesAccessLevel
): string[] {
  const next = parsePermissionKeys(permissions).filter(
    (k) =>
      k !== 'sales' &&
      !SALES_LEVEL_KEYS.has(k) &&
      !LEGACY_SALES_KEYS.has(k)
  );

  if (level === 'no') {
    return [...new Set(next)];
  }

  const levelKey = salesAccessLevelKey(level);
  if (levelKey) next.push(levelKey);
  next.push('sales');

  // Sales depends on Contacts + CRM
  next.push(CONTACTS_PERMISSION_KEY);
  next.push('crm');
  for (const m of CRM_MODULE_PERMISSIONS) next.push(m.key);

  return [...new Set(next)];
}

/**
 * Resolve effective child module keys for CRM / Ops / Warehouse.
 * Sales is represented only via access level keys (not child modules).
 */
export function resolveGrantedChildKeys(permissions: string[] | null | undefined): string[] {
  if (!permissions || permissions.length === 0) return [];

  const out = new Set<string>();
  const hasCrmParent = permissions.includes('crm');
  const hasOpsParent = permissions.includes('operations');
  const hasWarehouseParent = permissions.includes('warehouse');
  const crmChildren = permissions.filter((k) => CRM_KEYS.has(k));
  const opsChildren = permissions.filter((k) => OPS_KEYS.has(k));
  const warehouseChildren = permissions.filter((k) => WAREHOUSE_KEYS.has(k));

  // Sales access ⇒ Contacts (`customers`) for sidebar
  if (getSalesAccessLevel(permissions) !== 'no') {
    out.add(CONTACTS_PERMISSION_KEY);
  } else if (permissions.includes(CONTACTS_PERMISSION_KEY)) {
    out.add(CONTACTS_PERMISSION_KEY);
  }

  if (hasCrmParent && crmChildren.length === 0) {
    for (const m of CRM_MODULE_PERMISSIONS) out.add(m.key);
  } else {
    for (const k of crmChildren) out.add(k);
  }

  // Sales always implies full CRM child access
  if (getSalesAccessLevel(permissions) !== 'no') {
    for (const m of CRM_MODULE_PERMISSIONS) out.add(m.key);
  }

  if (hasOpsParent && opsChildren.length === 0) {
    for (const m of OPERATIONS_MODULE_PERMISSIONS) out.add(m.key);
  } else {
    for (const k of opsChildren) out.add(k);
  }

  if (hasWarehouseParent && warehouseChildren.length === 0) {
    for (const m of WAREHOUSE_MODULE_PERMISSIONS) out.add(m.key);
  } else {
    for (const k of warehouseChildren) out.add(k);
  }

  return [...out];
}

/** @deprecated Prefer resolveGrantedChildKeys — kept for compatibility. */
export function expandDepartmentPermissions(permissions: string[]): string[] {
  return resolveGrantedChildKeys(permissions);
}

/** Normalize for the User form (includes sales + accounting levels + CRM/ops/warehouse). */
export function toFormPermissionKeys(permissions: string[]): string[] {
  const raw = parsePermissionKeys(permissions);
  const level = getSalesAccessLevel(raw);
  const accountingLevel = getAccountingAccessLevel(raw);
  const hadStandaloneContacts =
    level === 'no' && raw.includes(CONTACTS_PERMISSION_KEY);

  const preserved = raw.filter(
    (k) =>
      k !== 'sales' &&
      !SALES_LEVEL_KEYS.has(k) &&
      !LEGACY_SALES_KEYS.has(k) &&
      k !== 'accounting' &&
      !ACCOUNTING_LEVEL_KEYS.has(k) &&
      k !== CONTACTS_PERMISSION_KEY
  );

  let out = applySalesAccessLevel(preserved, level);
  out = applyAccountingAccessLevel(out, accountingLevel);
  if (hadStandaloneContacts) {
    out = [...new Set([...out, CONTACTS_PERMISSION_KEY])];
  }
  return out;
}

/** Persist selected keys with Sales access level + CRM/Contacts dependencies. */
export function normalizeStoredPermissions(raw: string[]): string[] {
  const selected = parsePermissionKeys(raw);
  const level = getSalesAccessLevel(selected);

  const children = new Set<string>();

  // CRM
  if (selected.includes('crm') && !selected.some((k) => CRM_KEYS.has(k))) {
    for (const m of CRM_MODULE_PERMISSIONS) children.add(m.key);
  } else {
    for (const k of selected) {
      if (CRM_KEYS.has(k)) children.add(k);
    }
  }

  // Operations
  if (selected.includes('operations') && !selected.some((k) => OPS_KEYS.has(k))) {
    for (const m of OPERATIONS_MODULE_PERMISSIONS) children.add(m.key);
  } else {
    for (const k of selected) {
      if (OPS_KEYS.has(k)) children.add(k);
    }
  }

  // Warehouse
  if (selected.includes('warehouse') && !selected.some((k) => WAREHOUSE_KEYS.has(k))) {
    for (const m of WAREHOUSE_MODULE_PERMISSIONS) children.add(m.key);
  } else {
    for (const k of selected) {
      if (WAREHOUSE_KEYS.has(k)) children.add(k);
    }
  }

  // Standalone Contacts without Sales
  if (
    level === 'no' &&
    (selected.includes(CONTACTS_PERMISSION_KEY) || selected.includes('customers'))
  ) {
    children.add(CONTACTS_PERMISSION_KEY);
  }

  let out = [...children];

  if (
    CRM_MODULE_PERMISSIONS.length > 0 &&
    CRM_MODULE_PERMISSIONS.every((m) => children.has(m.key))
  ) {
    out.push('crm');
  }
  if (
    OPERATIONS_MODULE_PERMISSIONS.length > 0 &&
    OPERATIONS_MODULE_PERMISSIONS.every((m) => children.has(m.key))
  ) {
    out.push('operations');
  }
  if (
    WAREHOUSE_MODULE_PERMISSIONS.length > 0 &&
    WAREHOUSE_MODULE_PERMISSIONS.every((m) => children.has(m.key))
  ) {
    out.push('warehouse');
  }

  // Apply Sales + Accounting levels last so deps are enforced
  out = applySalesAccessLevel(out, level);
  out = applyAccountingAccessLevel(out, getAccountingAccessLevel(selected));

  return [...new Set(out)];
}

/** Which parent departments the user can see in the sidebar. */
export function toDepartmentAccess(permissions: string[]): ModuleDepartment[] {
  const children = resolveGrantedChildKeys(permissions);
  const result: ModuleDepartment[] = [];
  if (getSalesAccessLevel(permissions) !== 'no') {
    result.push('sales');
  }
  if (
    permissions.includes('crm') ||
    children.some((k) => CRM_KEYS.has(k)) ||
    getSalesAccessLevel(permissions) !== 'no'
  ) {
    result.push('crm');
  }
  if (hasAccountingAccess(permissions)) {
    result.push('accounting');
  }
  if (permissions.includes('operations') || children.some((k) => OPS_KEYS.has(k))) {
    result.push('operations');
  }
  if (permissions.includes('warehouse') || children.some((k) => WAREHOUSE_KEYS.has(k))) {
    result.push('warehouse');
  }
  return result;
}

/** Keys synced onto sales_agents.permissions (level + marker). */
export function filterSalesPermissions(permissions: string[]): string[] {
  const level = getSalesAccessLevel(permissions);
  if (level === 'no') return [];
  const key = salesAccessLevelKey(level);
  return key ? [key, 'sales', CONTACTS_PERMISSION_KEY] : ['sales', CONTACTS_PERMISSION_KEY];
}

export function filterOperationsPermissions(permissions: string[]): string[] {
  return resolveGrantedChildKeys(permissions).filter((key) => OPS_KEYS.has(key));
}

export function filterWarehousePermissions(permissions: string[]): string[] {
  return resolveGrantedChildKeys(permissions).filter((key) => WAREHOUSE_KEYS.has(key));
}

export function filterCrmPermissions(permissions: string[]): string[] {
  return resolveGrantedChildKeys(permissions).filter((key) => CRM_KEYS.has(key));
}

export function hasSalesAccess(permissions: string[] | null | undefined): boolean {
  return getSalesAccessLevel(permissions) !== 'no';
}

export function hasOperationsAccess(permissions: string[] | null | undefined): boolean {
  if (!permissions || permissions.length === 0) return false;
  return toDepartmentAccess(permissions).includes('operations');
}

export function hasWarehouseAccess(permissions: string[] | null | undefined): boolean {
  if (!permissions || permissions.length === 0) return false;
  return toDepartmentAccess(permissions).includes('warehouse');
}

export function hasCrmAccess(permissions: string[] | null | undefined): boolean {
  if (!permissions || permissions.length === 0) return false;
  return toDepartmentAccess(permissions).includes('crm');
}

export function hasDepartmentAccess(
  permissions: string[] | null | undefined,
  department: ModuleDepartment
): boolean {
  if (department === 'sales') return hasSalesAccess(permissions);
  if (department === 'crm') return hasCrmAccess(permissions);
  if (department === 'accounting') return hasAccountingAccess(permissions);
  if (department === 'operations') return hasOperationsAccess(permissions);
  return hasWarehouseAccess(permissions);
}

export function hasModulePermission(
  permissions: string[] | null | undefined,
  key: string
): boolean {
  if (!permissions || permissions.length === 0) return false;
  if (key === 'sales') return hasSalesAccess(permissions);
  if (key === 'crm') return hasCrmAccess(permissions);
  if (key === 'accounting') return hasAccountingAccess(permissions);
  if (key === 'operations') return hasOperationsAccess(permissions);
  if (key === 'warehouse') return hasWarehouseAccess(permissions);

  // Legacy Sales submodule keys → any Sales access level grants them
  if (LEGACY_SALES_KEYS.has(key) || SALES_LEVEL_KEYS.has(key)) {
    return hasSalesAccess(permissions);
  }

  if (ACCOUNTING_LEVEL_KEYS.has(key)) {
    return hasAccountingAccess(permissions);
  }

  return resolveGrantedChildKeys(permissions).includes(key);
}

/** @deprecated Prefer filterSalesPermissions / sales access levels. */
export const LEGACY_SALES_AGENT_PERMISSION_KEYS = [
  SALES_ACCESS_LEVEL_KEYS.all,
  'sales',
  CONTACTS_PERMISSION_KEY,
];
