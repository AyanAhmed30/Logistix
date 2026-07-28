/**
 * Accounting module navigation.
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
} from 'lucide-react';

export type AccountingNavId =
  | 'accounting-dashboard'
  | 'accounting-customers'
  | 'accounting-invoices'
  | 'accounting-credit-notes'
  | 'accounting-refunds'
  | 'accounting-reports'
  | 'accounting-automation';

export type AccountingNavItem = {
  id: AccountingNavId;
  label: string;
  href: string;
  icon: LucideIcon;
};

export type AccountingPageMeta = {
  title: string;
  subtitle?: string;
  breadcrumbs: { label: string; href?: string }[];
  searchMode: 'none' | 'customers' | 'invoices' | 'credit-notes' | 'refunds';
  showCreate?: boolean;
  showFilters?: boolean;
  showFavorites?: boolean;
  filters?: { id: string; label: string }[];
};

export const ACCOUNTING_NAV_ITEMS: AccountingNavItem[] = [
  {
    id: 'accounting-dashboard',
    label: 'Dashboard',
    href: '/accounting',
    icon: LayoutDashboard,
  },
  {
    id: 'accounting-customers',
    label: 'Customers',
    href: '/accounting/customers',
    icon: Users,
  },
  {
    id: 'accounting-invoices',
    label: 'Customer Invoices',
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
  if (pathname.startsWith('/accounting/credit-notes/') && pathname !== '/accounting/credit-notes') {
    return {
      title: 'Credit Note',
      subtitle: 'Return / credit against invoice',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
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
  if (pathname.startsWith('/accounting/invoices/') && pathname !== '/accounting/invoices') {
    return {
      title: 'Customer Invoice',
      subtitle: 'Draft invoice from Sales Order',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customer Invoices', href: '/accounting/invoices' },
        { label: 'Invoice' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }
  if (pathname.startsWith('/accounting/invoices')) {
    return {
      title: 'Customer Invoices',
      subtitle: 'Invoices issued to customers',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customer Invoices' },
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
    subtitle: 'Customers, invoices, reports, and automation',
    breadcrumbs: [{ label: 'Accounting' }],
    searchMode: 'none',
    showFilters: false,
    showFavorites: false,
  };
}

export function defaultAccountingRoute(): string {
  return '/accounting';
}
