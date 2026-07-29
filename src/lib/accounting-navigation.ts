/**
 * Accounting module navigation (Odoo-inspired Customers + Vendors menus).
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  FileText,
  FileMinus2,
  Undo2,
  BarChart3,
  Settings2,
  Wallet,
  Package,
  Truck,
  Receipt,
} from 'lucide-react';

export type AccountingNavId =
  | 'accounting-dashboard'
  | 'accounting-customers-menu'
  | 'accounting-vendors-menu'
  | 'accounting-invoices'
  | 'accounting-credit-notes'
  | 'accounting-payments'
  | 'accounting-products'
  | 'accounting-customers'
  | 'accounting-bills'
  | 'accounting-vendor-refunds'
  | 'accounting-vendor-payments'
  | 'accounting-vendor-products'
  | 'accounting-vendors'
  | 'accounting-refunds'
  | 'accounting-reports'
  | 'accounting-automation';

export type AccountingNavItem = {
  id: AccountingNavId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type AccountingNavChild = {
  id: AccountingNavId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type AccountingNavEntry =
  | { type: 'link'; item: AccountingNavItem }
  | {
      type: 'menu';
      id: 'accounting-customers-menu' | 'accounting-vendors-menu';
      label: string;
      icon: LucideIcon;
      children: AccountingNavChild[];
    };

export type AccountingPageMeta = {
  title: string;
  subtitle?: string;
  breadcrumbs: { label: string; href?: string }[];
  searchMode:
    | 'none'
    | 'customers'
    | 'vendors'
    | 'invoices'
    | 'bills'
    | 'credit-notes'
    | 'vendor-refunds'
    | 'refunds'
    | 'payments'
    | 'vendor-payments'
    | 'products';
  showCreate?: boolean;
  showFilters?: boolean;
  showFavorites?: boolean;
  filters?: { id: string; label: string }[];
};

/** Odoo Customers submenu */
export const ACCOUNTING_CUSTOMERS_MENU: AccountingNavChild[] = [
  {
    id: 'accounting-invoices',
    label: 'Invoices',
    href: '/accounting/invoices',
    icon: FileText,
  },
  {
    id: 'accounting-credit-notes',
    label: 'Credit Notes',
    href: '/accounting/credit-notes',
    icon: FileMinus2,
  },
  {
    id: 'accounting-payments',
    label: 'Payments',
    href: '/accounting/payments',
    icon: Wallet,
  },
  {
    id: 'accounting-products',
    label: 'Products',
    href: '/accounting/customers/products',
    icon: Package,
  },
  {
    id: 'accounting-customers',
    label: 'Customers',
    href: '/accounting/customers',
    icon: Users,
  },
];

/** Odoo Vendors submenu */
export const ACCOUNTING_VENDORS_MENU: AccountingNavChild[] = [
  {
    id: 'accounting-bills',
    label: 'Bills',
    href: '/accounting/bills',
    icon: Receipt,
  },
  {
    id: 'accounting-vendor-refunds',
    label: 'Refunds',
    href: '/accounting/vendor-refunds',
    icon: FileMinus2,
  },
  {
    id: 'accounting-vendor-payments',
    label: 'Payments',
    href: '/accounting/vendor-payments',
    icon: Wallet,
  },
  {
    id: 'accounting-vendor-products',
    label: 'Products',
    href: '/accounting/vendors/products',
    icon: Package,
  },
  {
    id: 'accounting-vendors',
    label: 'Vendors',
    href: '/accounting/vendors',
    icon: Truck,
  },
];

/** Top-level nav (Customers + Vendors dropdowns). */
export const ACCOUNTING_NAV_STRUCTURE: AccountingNavEntry[] = [
  {
    type: 'link',
    item: {
      id: 'accounting-dashboard',
      label: 'Dashboard',
      href: '/accounting',
      icon: LayoutDashboard,
    },
  },
  {
    type: 'menu',
    id: 'accounting-customers-menu',
    label: 'Customers',
    icon: Users,
    children: ACCOUNTING_CUSTOMERS_MENU,
  },
  {
    type: 'menu',
    id: 'accounting-vendors-menu',
    label: 'Vendors',
    icon: Truck,
    children: ACCOUNTING_VENDORS_MENU,
  },
  {
    type: 'link',
    item: {
      id: 'accounting-refunds',
      label: 'Refunds',
      href: '/accounting/refunds',
      icon: Undo2,
    },
  },
  {
    type: 'link',
    item: {
      id: 'accounting-reports',
      label: 'Reports',
      href: '/accounting/reports',
      icon: BarChart3,
    },
  },
  {
    type: 'link',
    item: {
      id: 'accounting-automation',
      label: 'Automation',
      href: '/accounting/automation',
      icon: Settings2,
    },
  },
];

/** Flat list for access filtering / legacy helpers. */
export const ACCOUNTING_NAV_ITEMS: AccountingNavItem[] = [
  {
    id: 'accounting-dashboard',
    label: 'Dashboard',
    href: '/accounting',
    icon: LayoutDashboard,
  },
  ...ACCOUNTING_CUSTOMERS_MENU,
  ...ACCOUNTING_VENDORS_MENU,
  {
    id: 'accounting-refunds',
    label: 'Refunds',
    href: '/accounting/refunds',
    icon: Undo2,
  },
  {
    id: 'accounting-reports',
    label: 'Reports',
    href: '/accounting/reports',
    icon: BarChart3,
  },
  {
    id: 'accounting-automation',
    label: 'Automation',
    href: '/accounting/automation',
    icon: Settings2,
  },
];

export function getAccountingPageMeta(pathname: string): AccountingPageMeta {
  if (pathname.startsWith('/accounting/reports')) {
    return {
      title: 'Reports',
      subtitle: 'Revenue, customers, invoices, payments, aging',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Reports' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/automation')) {
    return {
      title: 'Automation & Security',
      subtitle: 'Templates, reminders, audit logs',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Automation' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }

  // —— Vendors ——
  if (pathname.startsWith('/accounting/vendor-payments/') && pathname !== '/accounting/vendor-payments') {
    return {
      title: 'Vendor Payment',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Payments', href: '/accounting/vendor-payments' },
        { label: 'Payment' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/vendor-payments')) {
    return {
      title: 'Vendor Payments',
      subtitle: 'Payments to vendors',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Payments' },
      ],
      searchMode: 'vendor-payments',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/vendor-refunds/') && pathname !== '/accounting/vendor-refunds') {
    return {
      title: 'Vendor Refund',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Refunds', href: '/accounting/vendor-refunds' },
        { label: 'Refund' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/vendor-refunds')) {
    return {
      title: 'Vendor Refunds',
      subtitle: 'Credits and returns against vendor bills',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Refunds' },
      ],
      searchMode: 'vendor-refunds',
      showFilters: true,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'posted', label: 'Posted' },
        { id: 'cancelled', label: 'Cancelled' },
      ],
    };
  }
  if (pathname.startsWith('/accounting/vendors/products')) {
    const isForm =
      pathname !== '/accounting/vendors/products' &&
      pathname !== '/accounting/vendors/products/';
    return {
      title: isForm ? 'Product' : 'Products',
      subtitle: 'Same catalog as Sales Products',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        {
          label: 'Products',
          href: isForm ? '/accounting/vendors/products' : undefined,
        },
        ...(isForm ? [{ label: 'Product' }] : []),
      ],
      searchMode: isForm ? 'none' : 'products',
      showFilters: !isForm,
      filters: isForm
        ? undefined
        : [
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'archived', label: 'Archived' },
          ],
    };
  }
  if (pathname === '/accounting/bills/new') {
    return {
      title: 'New Bill',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Bills', href: '/accounting/bills' },
        { label: 'New' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/bills/') && pathname !== '/accounting/bills') {
    return {
      title: 'Vendor Bill',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Bills', href: '/accounting/bills' },
        { label: 'Bill' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/bills')) {
    return {
      title: 'Bills',
      subtitle: 'Vendor bills',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Bills' },
      ],
      searchMode: 'bills',
      showFilters: true,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'posted', label: 'Posted' },
        { id: 'paid', label: 'Paid' },
        { id: 'cancelled', label: 'Cancelled' },
      ],
    };
  }
  if (pathname === '/accounting/vendors/new') {
    return {
      title: 'New Vendor',
      subtitle: 'Shared with Contacts',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'New' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.match(/\/accounting\/vendors\/[^/]+\/(ledger|statement|bills|timeline|transactions)/)) {
    const segment = pathname.split('/').pop() || 'Vendor';
    const titles: Record<string, string> = {
      ledger: 'Vendor Ledger',
      statement: 'Vendor Statement',
      bills: 'Vendor Bills',
      timeline: 'Vendor Timeline',
      transactions: 'Transaction History',
    };
    return {
      title: titles[segment] || 'Vendor',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: titles[segment] || 'Vendor' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (
    pathname.startsWith('/accounting/vendors/') &&
    pathname !== '/accounting/vendors' &&
    !pathname.startsWith('/accounting/vendors/products')
  ) {
    return {
      title: 'Vendor',
      subtitle: 'Accounting profile · shared with Contacts',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors', href: '/accounting/vendors' },
        { label: 'Vendor' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/vendors')) {
    return {
      title: 'Vendors',
      subtitle: 'Contacts marked as Vendors',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Vendors' },
      ],
      searchMode: 'vendors',
      showFilters: false,
    };
  }

  // —— Customers (existing) ——
  if (pathname.startsWith('/accounting/payments/') && pathname !== '/accounting/payments') {
    return {
      title: 'Payment',
      subtitle: 'Customer payment',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Payments', href: '/accounting/payments' },
        { label: 'Payment' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/payments')) {
    return {
      title: 'Payments',
      subtitle: 'Customer payments',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Payments' },
      ],
      searchMode: 'payments',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/customers/products')) {
    const isForm =
      pathname !== '/accounting/customers/products' &&
      pathname !== '/accounting/customers/products/';
    return {
      title: isForm ? 'Product' : 'Products',
      subtitle: 'Same catalog as Sales Products',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        {
          label: 'Products',
          href: isForm ? '/accounting/customers/products' : undefined,
        },
        ...(isForm ? [{ label: 'Product' }] : []),
      ],
      searchMode: isForm ? 'none' : 'products',
      showFilters: !isForm,
      showFavorites: false,
      filters: isForm
        ? undefined
        : [
            { id: 'all', label: 'All' },
            { id: 'active', label: 'Active' },
            { id: 'archived', label: 'Archived' },
          ],
    };
  }
  if (pathname === '/accounting/customers/new') {
    return {
      title: 'New Customer',
      subtitle: 'Shared with Contacts',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'New' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/credit-notes/') && pathname !== '/accounting/credit-notes') {
    return {
      title: 'Credit Note',
      subtitle: 'Return / credit against invoice',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Credit Notes', href: '/accounting/credit-notes' },
        { label: 'Credit Note' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/credit-notes')) {
    return {
      title: 'Credit Notes',
      subtitle: 'Credits and returns against customer invoices',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Credit Notes' },
      ],
      searchMode: 'credit-notes',
      showFilters: true,
      showFavorites: false,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'posted', label: 'Posted' },
        { id: 'cancelled', label: 'Cancelled' },
      ],
    };
  }
  if (pathname.startsWith('/accounting/refunds')) {
    return {
      title: 'Refund History',
      subtitle: 'Cash / bank refunds issued to customers',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Refunds' },
      ],
      searchMode: 'refunds',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname === '/accounting/invoices/new') {
    return {
      title: 'New Invoice',
      subtitle: 'Create a draft customer invoice',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Invoices', href: '/accounting/invoices' },
        { label: 'New' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/invoices/') && pathname !== '/accounting/invoices') {
    return {
      title: 'Customer Invoice',
      subtitle: 'Customer invoice',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Invoices', href: '/accounting/invoices' },
        { label: 'Invoice' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/invoices')) {
    return {
      title: 'Invoices',
      subtitle: 'Customer invoices',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Invoices' },
      ],
      searchMode: 'invoices',
      showFilters: true,
      showFavorites: false,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'posted', label: 'Posted' },
        { id: 'paid', label: 'Paid' },
        { id: 'cancelled', label: 'Cancelled' },
      ],
    };
  }
  if (pathname.match(/\/accounting\/customers\/[^/]+\/(ledger|statement|invoices|timeline|transactions)/)) {
    const segment = pathname.split('/').pop() || 'Customer';
    const titles: Record<string, string> = {
      ledger: 'Customer Ledger',
      statement: 'Customer Statement',
      invoices: 'Customer Invoices',
      timeline: 'Customer Timeline',
      transactions: 'Transaction History',
    };
    return {
      title: titles[segment] || 'Customer',
      subtitle: 'Customer accounting',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: titles[segment] || 'Customer' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/customers/') && pathname !== '/accounting/customers') {
    return {
      title: 'Customer',
      subtitle: 'Accounting profile · shared with Contacts',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Customer' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/customers')) {
    return {
      title: 'Customers',
      subtitle: 'Same records as Contacts',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers' },
      ],
      searchMode: 'customers',
      showFilters: false,
      showFavorites: false,
    };
  }
  return {
    title: 'Accounting',
    subtitle: 'Customers, vendors, invoices, reports, and automation',
    breadcrumbs: [{ label: 'Accounting' }],
    searchMode: 'none',
    showFilters: false,
    showFavorites: false,
  };
}

export function defaultAccountingRoute(): string {
  return '/accounting';
}

export function isCustomersMenuPath(pathname: string): boolean {
  return (
    pathname.startsWith('/accounting/invoices') ||
    pathname.startsWith('/accounting/credit-notes') ||
    pathname.startsWith('/accounting/payments') ||
    pathname.startsWith('/accounting/customers')
  );
}

export function isVendorsMenuPath(pathname: string): boolean {
  return (
    pathname.startsWith('/accounting/bills') ||
    pathname.startsWith('/accounting/vendor-refunds') ||
    pathname.startsWith('/accounting/vendor-payments') ||
    pathname.startsWith('/accounting/vendors')
  );
}

export function isMenuPathActive(
  menuId: 'accounting-customers-menu' | 'accounting-vendors-menu',
  pathname: string
): boolean {
  if (menuId === 'accounting-customers-menu') return isCustomersMenuPath(pathname);
  return isVendorsMenuPath(pathname);
}
