import {
  MODULE_PERMISSION_GROUPS,
  SALES_ACCESS_LEVEL_OPTIONS,
  getSalesAccessLevel,
  type ModulePermissionDef,
} from '@/lib/module-permissions';

export type PortalUserAuditSnapshot = {
  full_name: string;
  email: string | null;
  phone: string | null;
  username: string;
  role: 'user' | 'admin';
  permissions: string[];
  companyIds: string[];
  companyNames: string[];
  default_organization_id: string | null;
  defaultCompanyName: string | null;
};

export type PortalUserAuditEntry = {
  action_type: string;
  field_name: string;
  previous_value: string | null;
  new_value: string | null;
  metadata?: Record<string, unknown> | null;
};

const PERMISSION_LABELS = new Map<string, string>();
for (const group of MODULE_PERMISSION_GROUPS) {
  for (const mod of group.modules) {
    PERMISSION_LABELS.set(mod.key, mod.label);
  }
}
for (const opt of SALES_ACCESS_LEVEL_OPTIONS) {
  if (opt.key) PERMISSION_LABELS.set(opt.key, `Sales · ${opt.label}`);
}
PERMISSION_LABELS.set('sales', 'Sales');
PERMISSION_LABELS.set('customers', 'Contacts');

function permissionLabel(key: string): string {
  return PERMISSION_LABELS.get(key) || key;
}

function salesAccessLabel(permissions: string[]): string {
  const level = getSalesAccessLevel(permissions);
  return (
    SALES_ACCESS_LEVEL_OPTIONS.find((o) => o.value === level)?.label || 'No'
  );
}

function roleDisplay(role: 'user' | 'admin'): string {
  return role === 'admin' ? 'Administrator' : 'User';
}

function normalizeList(values: string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].sort();
}

function listsEqual(a: string[], b: string[]): boolean {
  const na = normalizeList(a);
  const nb = normalizeList(b);
  if (na.length !== nb.length) return false;
  return na.every((value, index) => value === nb[index]);
}

function formatCompanyList(names: string[]): string {
  const sorted = [...names].filter(Boolean).sort((a, b) => a.localeCompare(b));
  return sorted.length > 0 ? sorted.join(', ') : '—';
}

function formatPermissionSummary(keys: string[]): string {
  const childKeys = keys.filter((key) => PERMISSION_LABELS.has(key));
  const labels = childKeys.map(permissionLabel).sort((a, b) => a.localeCompare(b));
  return labels.length > 0 ? labels.join(', ') : '—';
}

function pushFieldChange(
  entries: PortalUserAuditEntry[],
  fieldName: string,
  previousValue: string | null,
  newValue: string | null
) {
  const prev = (previousValue ?? '').trim();
  const next = (newValue ?? '').trim();
  if (prev === next) return;
  entries.push({
    action_type: 'field_changed',
    field_name: fieldName,
    previous_value: prev || null,
    new_value: next || null,
  });
}

export function buildPortalUserAuditEntries(
  before: PortalUserAuditSnapshot | null,
  after: PortalUserAuditSnapshot,
  options?: { includePasswordChange?: boolean }
): PortalUserAuditEntry[] {
  const entries: PortalUserAuditEntry[] = [];

  if (!before) {
    entries.push({
      action_type: 'created',
      field_name: 'User',
      previous_value: null,
      new_value: after.full_name || after.username,
    });
    return entries;
  }

  pushFieldChange(entries, 'Full Name', before.full_name, after.full_name);
  pushFieldChange(entries, 'Username', before.username, after.username);
  pushFieldChange(entries, 'Email', before.email, after.email);
  pushFieldChange(entries, 'Phone', before.phone, after.phone);

  if (before.role !== after.role) {
    entries.push({
      action_type: 'field_changed',
      field_name: 'Role',
      previous_value: roleDisplay(before.role),
      new_value: roleDisplay(after.role),
    });
  }

  if (!listsEqual(before.companyNames, after.companyNames)) {
    entries.push({
      action_type: 'field_changed',
      field_name: 'Organizations',
      previous_value: formatCompanyList(before.companyNames),
      new_value: formatCompanyList(after.companyNames),
    });
  }

  const beforeDefault = before.defaultCompanyName || '—';
  const afterDefault = after.defaultCompanyName || '—';
  if (beforeDefault !== afterDefault) {
    entries.push({
      action_type: 'field_changed',
      field_name: 'Default Organization',
      previous_value: beforeDefault,
      new_value: afterDefault,
    });
  }

  const beforeSales = salesAccessLabel(before.permissions);
  const afterSales = salesAccessLabel(after.permissions);
  if (beforeSales !== afterSales) {
    entries.push({
      action_type: 'field_changed',
      field_name: 'Sales Access',
      previous_value: beforeSales,
      new_value: afterSales,
    });
  }

  const beforePerms = normalizeList(
    before.permissions.filter((key) => PERMISSION_LABELS.has(key))
  );
  const afterPerms = normalizeList(
    after.permissions.filter((key) => PERMISSION_LABELS.has(key))
  );

  if (!listsEqual(beforePerms, afterPerms)) {
    const added = afterPerms.filter((key) => !beforePerms.includes(key));
    const removed = beforePerms.filter((key) => !afterPerms.includes(key));
    entries.push({
      action_type: 'module_access',
      field_name: 'Module Access',
      previous_value: formatPermissionSummary(beforePerms),
      new_value: formatPermissionSummary(afterPerms),
      metadata: {
        added: added.map(permissionLabel),
        removed: removed.map(permissionLabel),
      },
    });
  }

  if (options?.includePasswordChange) {
    entries.push({
      action_type: 'field_changed',
      field_name: 'Password',
      previous_value: '••••••••',
      new_value: 'Updated',
    });
  }

  return entries;
}

export function modulePermissionDefs(): ModulePermissionDef[] {
  return MODULE_PERMISSION_GROUPS.flatMap((group) => group.modules);
}
