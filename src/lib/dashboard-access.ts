import type { SessionAppUserRole } from '@/lib/auth/session';
import type { AdminModule } from '@/lib/admin-navigation';
import {
  hasDepartmentAccess,
  hasModulePermission,
} from '@/lib/module-permissions';

export type DashboardAccessState = {
  isSuperAdmin: boolean;
  isPortalAccount: boolean;
  isOrganizationAdmin: boolean;
  appUserId: string | null;
  appUserRole: SessionAppUserRole | null;
  username: string;
  fullName: string | null;
  permissions: string[];
};

export function isPortalDashboardAccess(access: DashboardAccessState): boolean {
  return access.isPortalAccount && !access.isSuperAdmin;
}

export function visibleModulesForAccess(access: DashboardAccessState): AdminModule[] {
  if (access.isSuperAdmin) {
    return ['contacts', 'crm', 'sales', 'operations', 'warehouse', 'hr', 'analytics', 'settings'];
  }

  const modules: AdminModule[] = [];
  // Contacts: explicit customers key OR any Sales access (Sales depends on Contacts)
  if (
    hasModulePermission(access.permissions, 'customers') ||
    hasDepartmentAccess(access.permissions, 'sales')
  ) {
    modules.push('contacts');
  }
  if (hasDepartmentAccess(access.permissions, 'crm')) modules.push('crm');
  if (hasDepartmentAccess(access.permissions, 'sales')) modules.push('sales');
  if (hasDepartmentAccess(access.permissions, 'operations')) modules.push('operations');
  if (hasDepartmentAccess(access.permissions, 'warehouse')) modules.push('warehouse');
  if (hasDepartmentAccess(access.permissions, 'hr')) modules.push('hr');
  const hasSalesOrOps =
    hasDepartmentAccess(access.permissions, 'sales') ||
    hasDepartmentAccess(access.permissions, 'operations');
  if (hasSalesOrOps) modules.push('analytics');
  modules.push('settings');
  return modules;
}

/** Map admin sidebar tab keys to portal module permission keys. */
const ADMIN_TAB_PERMISSION: Record<string, string> = {
  sales: 'pipeline',
  contacts: 'customers',
  management: 'management',
  console: 'console',
  tracking: 'management',
  'loading-instruction': 'loading-instruction',
  'import-packing-list': 'import-packing-list',
  'import-invoice': 'import-invoice',
  'inquiry-confirmation': 'inquiry-confirmation',
  'calculator-config': 'calculator-config',
  operations: 'leads-inquiry',
  accounting: 'accounting',
};

export function canAccessAdminTab(
  access: DashboardAccessState,
  tab: string,
  module: AdminModule | null
): boolean {
  if (access.isSuperAdmin) return true;

  if (module === 'analytics') return true;
  if (module === 'settings') return true;
  if (module === 'contacts') {
    return (
      hasModulePermission(access.permissions, 'customers') ||
      hasDepartmentAccess(access.permissions, 'sales')
    );
  }

  const permKey = ADMIN_TAB_PERMISSION[tab];
  if (!permKey) {
    if (module === 'sales') return hasDepartmentAccess(access.permissions, 'sales');
    if (module === 'operations') return hasDepartmentAccess(access.permissions, 'operations');
    if (module === 'warehouse') return hasDepartmentAccess(access.permissions, 'warehouse');
    if (module === 'hr') return hasDepartmentAccess(access.permissions, 'hr');
    return false;
  }

  return hasModulePermission(access.permissions, permKey);
}

/** Portal sales module tabs (permission key → panel). */
export const PORTAL_SALES_TABS = [
  'lead',
  'pipeline',
  'customer-list',
  'lead-transfer-tracking',
  'accounting',
  'inquiry-tracking',
  'customers',
  'quotations',
] as const;

export const PORTAL_OPS_TABS = [
  'leads-inquiry',
  'management',
  'console',
  'loading-instruction',
  'import-packing-list',
  'import-invoice',
  'inquiry-confirmation',
  'calculator-config',
] as const;

export function visiblePortalSalesTabs(permissions: string[]) {
  return PORTAL_SALES_TABS.filter((key) => hasModulePermission(permissions, key));
}

export function visiblePortalOpsTabs(permissions: string[]) {
  return PORTAL_OPS_TABS.filter((key) => hasModulePermission(permissions, key));
}

/** Portal warehouse module tabs (permission key → panel). */
export const PORTAL_WAREHOUSE_TABS = [
  'warehouse-book-order',
  'warehouse-history',
  'warehouse-scan-progress',
  'warehouse-loading-instruction',
] as const;

export function visiblePortalWarehouseTabs(permissions: string[]) {
  return PORTAL_WAREHOUSE_TABS.filter((key) => hasModulePermission(permissions, key));
}

/** CRM module sidebar tabs (permission key → route segment). */
export const CRM_MODULE_TABS = [
  'crm-pipeline',
  'crm-customers',
  'crm-activities',
  'crm-reports',
] as const;

export type CrmModuleTab = (typeof CRM_MODULE_TABS)[number];

export function visibleCrmModuleTabs(permissions: string[]): CrmModuleTab[] {
  return CRM_MODULE_TABS.filter((key) => hasModulePermission(permissions, key));
}

export function canAccessCrmRoute(
  access: DashboardAccessState,
  permissionKey: CrmModuleTab
): boolean {
  if (access.isSuperAdmin) return true;
  return hasModulePermission(access.permissions, permissionKey);
}

export function defaultCrmRouteForAccess(access: DashboardAccessState): string {
  if (access.isSuperAdmin) return '/crm/pipeline';
  const tabs = visibleCrmModuleTabs(access.permissions);
  if (tabs.includes('crm-pipeline')) return '/crm/pipeline';
  if (tabs.includes('crm-customers')) return '/crm/customers';
  if (tabs.includes('crm-activities')) return '/crm/activities';
  if (tabs.includes('crm-reports')) return '/crm/reports';
  return '/crm/pipeline';
}

export function defaultSalesRouteForAccess(access: DashboardAccessState): string {
  if (access.isSuperAdmin) return '/sales/quotations';
  if (hasModulePermission(access.permissions, 'quotations')) return '/sales/quotations';
  if (hasModulePermission(access.permissions, 'customers')) return '/sales/customers';
  if (hasDepartmentAccess(access.permissions, 'sales')) return '/sales/quotations';
  return '/sales/quotations';
}

/** HR module sidebar tabs (permission key → route). */
export const HR_MODULE_TABS = [
  'employee_profile_management',
  'attendance_leave_tracking',
  'document_management',
  'payroll_management',
  'report_generation',
] as const;

export type HrModuleTab = (typeof HR_MODULE_TABS)[number];

export const HR_TAB_ROUTES: Record<HrModuleTab, string> = {
  employee_profile_management: '/hr/employees',
  attendance_leave_tracking: '/hr/attendance',
  document_management: '/hr/documents',
  payroll_management: '/hr/payroll',
  report_generation: '/hr/reports',
};

export function visibleHrModuleTabs(permissions: string[]): HrModuleTab[] {
  return HR_MODULE_TABS.filter((key) => hasModulePermission(permissions, key));
}

export function canAccessHrRoute(
  access: DashboardAccessState,
  permissionKey: HrModuleTab
): boolean {
  if (access.isSuperAdmin) return true;
  return hasModulePermission(access.permissions, permissionKey);
}

export function defaultHrRouteForAccess(access?: DashboardAccessState): string {
  if (!access || access.isSuperAdmin) return '/hr';
  const tabs = visibleHrModuleTabs(access.permissions);
  if (tabs.length === 0) return '/hr';
  if (tabs.length === HR_MODULE_TABS.length) return '/hr';
  return HR_TAB_ROUTES[tabs[0]] || '/hr';
}
