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
  BookOpen,
  Calculator,
  Link2,
  Building2,
  Landmark,
  Lock,
  ListTree,
  BookMarked,
  Percent,
  CalendarClock,
  Coins,
  SlidersHorizontal,
  TrendingUp,
  Scale,
  ScrollText,
  ContactRound,
  Hourglass,
} from 'lucide-react';

export type AccountingNavId =
  | 'accounting-dashboard'
  | 'accounting-accounting-menu'
  | 'accounting-journal-entries'
  | 'accounting-reconcile'
  | 'accounting-assets'
  | 'accounting-asset-categories'
  | 'accounting-loans'
  | 'accounting-tax-returns'
  | 'accounting-lock-dates'
  | 'accounting-configuration-menu'
  | 'accounting-chart-of-accounts'
  | 'accounting-journals'
  | 'accounting-taxes'
  | 'accounting-payment-terms'
  | 'accounting-currencies'
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
  | 'accounting-reports-menu'
  | 'accounting-report-balance-sheet'
  | 'accounting-report-profit-loss'
  | 'accounting-report-cash-flow'
  | 'accounting-report-trial-balance'
  | 'accounting-report-general-ledger'
  | 'accounting-report-partner-ledger'
  | 'accounting-report-aged-receivable'
  | 'accounting-report-aged-payable'
  | 'accounting-report-tax'
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
      id:
        | 'accounting-accounting-menu'
        | 'accounting-configuration-menu'
        | 'accounting-customers-menu'
        | 'accounting-vendors-menu'
        | 'accounting-reports-menu';
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
    | 'products'
    | 'journal-entries'
    | 'reconcile'
    | 'assets'
    | 'loans'
    | 'tax-returns'
    | 'lock-dates'
    | 'chart-of-accounts'
    | 'journals'
    | 'taxes'
    | 'payment-terms'
    | 'currencies';
  showCreate?: boolean;
  showFilters?: boolean;
  showFavorites?: boolean;
  filters?: { id: string; label: string }[];
};

/** Odoo Configuration submenu (foundation settings) */
export const ACCOUNTING_CONFIGURATION_MENU: AccountingNavChild[] = [
  {
    id: 'accounting-chart-of-accounts',
    label: 'Chart of Accounts',
    href: '/accounting/configuration/chart-of-accounts',
    icon: ListTree,
  },
  {
    id: 'accounting-journals',
    label: 'Journals',
    href: '/accounting/configuration/journals',
    icon: BookMarked,
  },
  {
    id: 'accounting-taxes',
    label: 'Taxes',
    href: '/accounting/configuration/taxes',
    icon: Percent,
  },
  {
    id: 'accounting-payment-terms',
    label: 'Payment Terms',
    href: '/accounting/configuration/payment-terms',
    icon: CalendarClock,
  },
  {
    id: 'accounting-currencies',
    label: 'Currencies',
    href: '/accounting/configuration/currencies',
    icon: Coins,
  },
  {
    id: 'accounting-lock-dates',
    label: 'Lock Dates',
    href: '/accounting/configuration/lock-dates',
    icon: Lock,
  },
];

/** Odoo Accounting submenu (GL foundation) */
export const ACCOUNTING_ACCOUNTING_MENU: AccountingNavChild[] = [
  {
    id: 'accounting-journal-entries',
    label: 'Journal Entries',
    href: '/accounting/journal-entries',
    icon: BookOpen,
  },
  {
    id: 'accounting-reconcile',
    label: 'Reconcile',
    href: '/accounting/reconcile',
    icon: Link2,
  },
  {
    id: 'accounting-assets',
    label: 'Assets',
    href: '/accounting/assets',
    icon: Building2,
  },
  {
    id: 'accounting-loans',
    label: 'Loans',
    href: '/accounting/loans',
    icon: Landmark,
  },
  {
    id: 'accounting-tax-returns',
    label: 'Tax Returns',
    href: '/accounting/tax-returns',
    icon: Receipt,
  },
];

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

/** Reporting — Statement + Ledger reports */
export const ACCOUNTING_REPORTS_MENU: AccountingNavChild[] = [
  {
    id: 'accounting-report-balance-sheet',
    label: 'Balance Sheet',
    href: '/accounting/reports?statement=balance_sheet',
    icon: Landmark,
  },
  {
    id: 'accounting-report-profit-loss',
    label: 'Profit & Loss',
    href: '/accounting/reports?statement=profit_loss',
    icon: TrendingUp,
  },
  {
    id: 'accounting-report-cash-flow',
    label: 'Cash Flow Statement',
    href: '/accounting/reports?statement=cash_flow',
    icon: Wallet,
  },
  {
    id: 'accounting-report-trial-balance',
    label: 'Trial Balance',
    href: '/accounting/reports?statement=trial_balance',
    icon: Scale,
  },
  {
    id: 'accounting-report-general-ledger',
    label: 'General Ledger',
    href: '/accounting/reports?statement=general_ledger',
    icon: ScrollText,
  },
  {
    id: 'accounting-report-partner-ledger',
    label: 'Partner Ledger',
    href: '/accounting/reports?statement=partner_ledger',
    icon: ContactRound,
  },
  {
    id: 'accounting-report-aged-receivable',
    label: 'Aged Receivable',
    href: '/accounting/reports?statement=aged_receivable',
    icon: Hourglass,
  },
  {
    id: 'accounting-report-aged-payable',
    label: 'Aged Payable',
    href: '/accounting/reports?statement=aged_payable',
    icon: Hourglass,
  },
  {
    id: 'accounting-report-tax',
    label: 'Tax Report',
    href: '/accounting/reports?statement=tax_report',
    icon: Percent,
  },
];

/** Top-level nav (Accounting + Customers + Vendors dropdowns). */
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
    id: 'accounting-accounting-menu',
    label: 'Accounting',
    icon: Calculator,
    children: ACCOUNTING_ACCOUNTING_MENU,
  },
  {
    type: 'menu',
    id: 'accounting-configuration-menu',
    label: 'Configuration',
    icon: SlidersHorizontal,
    children: ACCOUNTING_CONFIGURATION_MENU,
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
    type: 'menu',
    id: 'accounting-reports-menu',
    label: 'Reporting',
    icon: BarChart3,
    children: ACCOUNTING_REPORTS_MENU,
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
  ...ACCOUNTING_ACCOUNTING_MENU,
  ...ACCOUNTING_CONFIGURATION_MENU,
  ...ACCOUNTING_CUSTOMERS_MENU,
  ...ACCOUNTING_VENDORS_MENU,
  {
    id: 'accounting-refunds',
    label: 'Refunds',
    href: '/accounting/refunds',
    icon: Undo2,
  },
  ...ACCOUNTING_REPORTS_MENU,
  {
    id: 'accounting-automation',
    label: 'Automation',
    href: '/accounting/automation',
    icon: Settings2,
  },
];

export function getAccountingPageMeta(pathname: string): AccountingPageMeta {
  if (
    pathname.startsWith('/accounting/journal-entries/') &&
    pathname !== '/accounting/journal-entries'
  ) {
    return {
      title: 'Journal Entry',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting', href: '/accounting/journal-entries' },
        { label: 'Journal Entries', href: '/accounting/journal-entries' },
        { label: 'Entry' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/journal-entries')) {
    return {
      title: 'Journal Entries',
      subtitle: 'General ledger journal entries',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Journal Entries' },
      ],
      searchMode: 'journal-entries',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'posted', label: 'Posted' },
        { id: 'cancelled', label: 'Cancelled' },
      ],
    };
  }

  if (pathname.startsWith('/accounting/reconcile')) {
    return {
      title: 'Journal Items to reconcile',
      subtitle: undefined,
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Reconcile' },
      ],
      searchMode: 'reconcile',
      showCreate: false,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'with_residual', label: 'With residual' },
        { id: 'posted', label: 'Posted' },
        { id: 'all', label: 'All' },
      ],
    };
  }

  if (
    pathname.startsWith('/accounting/assets/') &&
    pathname !== '/accounting/assets' &&
    !pathname.startsWith('/accounting/assets/categories')
  ) {
    return {
      title: 'Asset',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting', href: '/accounting/journal-entries' },
        { label: 'Assets', href: '/accounting/assets' },
        { label: 'Asset' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }

  if (pathname.startsWith('/accounting/assets/categories')) {
    return {
      title: 'Asset Categories',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Assets', href: '/accounting/assets' },
        { label: 'Categories' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }

  if (pathname.startsWith('/accounting/assets')) {
    return {
      title: 'Assets',
      subtitle: 'Fixed assets and depreciation',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Assets' },
      ],
      searchMode: 'assets',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'running', label: 'Running' },
        { id: 'fully_depreciated', label: 'Fully Depreciated' },
        { id: 'disposed', label: 'Disposed' },
      ],
    };
  }

  if (
    pathname.startsWith('/accounting/loans/') &&
    pathname !== '/accounting/loans'
  ) {
    return {
      title: 'Loan',
      subtitle: 'Loan details and installments',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Loans', href: '/accounting/loans' },
        { label: 'Loan' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }

  if (pathname.startsWith('/accounting/loans')) {
    return {
      title: 'Loans',
      subtitle: 'Loan management and amortization',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Loans' },
      ],
      searchMode: 'loans',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'active', label: 'Active' },
        { id: 'partially_paid', label: 'Partially Paid' },
        { id: 'fully_paid', label: 'Fully Paid' },
        { id: 'closed', label: 'Closed' },
      ],
    };
  }

  if (
    pathname.startsWith('/accounting/tax-returns/') &&
    pathname !== '/accounting/tax-returns'
  ) {
    return {
      title: 'Tax Return',
      subtitle: 'GST / VAT return details',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Tax Returns', href: '/accounting/tax-returns' },
        { label: 'Return' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }

  if (pathname.startsWith('/accounting/tax-returns')) {
    return {
      title: 'Tax Returns',
      subtitle: 'Tax dashboard, reports, and returns',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Accounting' },
        { label: 'Tax Returns' },
      ],
      searchMode: 'tax-returns',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'all', label: 'All' },
        { id: 'draft', label: 'Draft' },
        { id: 'generated', label: 'Generated' },
        { id: 'confirmed', label: 'Confirmed' },
        { id: 'filed', label: 'Filed' },
        { id: 'cancelled', label: 'Cancelled' },
      ],
    };
  }

  if (pathname.startsWith('/accounting/lock-dates') ||
      pathname.startsWith('/accounting/configuration/lock-dates')) {
    return {
      title: 'Lock Dates',
      subtitle: 'Fiscal lock, journal locks, soft lock, and year-end closing',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        {
          label: 'Configuration',
          href: '/accounting/configuration/lock-dates',
        },
        { label: 'Lock Dates' },
      ],
      searchMode: 'none',
      showFilters: false,
      showFavorites: false,
    };
  }

  if (
    pathname.startsWith('/accounting/configuration/chart-of-accounts/') &&
    pathname !== '/accounting/configuration/chart-of-accounts'
  ) {
    return {
      title: 'Account',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration', href: '/accounting/configuration/chart-of-accounts' },
        { label: 'Chart of Accounts', href: '/accounting/configuration/chart-of-accounts' },
        { label: 'Account' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/configuration/chart-of-accounts')) {
    return {
      title: 'Chart of Accounts',
      subtitle: 'Accounts used by journals, invoices, payments, and reports',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration' },
        { label: 'Chart of Accounts' },
      ],
      searchMode: 'chart-of-accounts',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'active', label: 'Active' },
        { id: 'archived', label: 'Archived' },
        { id: 'all', label: 'All' },
      ],
    };
  }

  if (
    pathname.startsWith('/accounting/configuration/journals/') &&
    pathname !== '/accounting/configuration/journals'
  ) {
    return {
      title: 'Journal',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration', href: '/accounting/configuration/journals' },
        { label: 'Journals', href: '/accounting/configuration/journals' },
        { label: 'Journal' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/configuration/journals')) {
    return {
      title: 'Journals',
      subtitle: 'Transaction journals for invoices, bills, payments, and entries',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration' },
        { label: 'Journals' },
      ],
      searchMode: 'journals',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'active', label: 'Active' },
        { id: 'archived', label: 'Archived' },
        { id: 'all', label: 'All' },
      ],
    };
  }

  if (
    pathname.startsWith('/accounting/configuration/taxes/') &&
    pathname !== '/accounting/configuration/taxes'
  ) {
    return {
      title: 'Tax',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration', href: '/accounting/configuration/taxes' },
        { label: 'Taxes', href: '/accounting/configuration/taxes' },
        { label: 'Tax' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/configuration/taxes')) {
    return {
      title: 'Taxes',
      subtitle: 'Sales, purchase, and withholding tax configuration',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration' },
        { label: 'Taxes' },
      ],
      searchMode: 'taxes',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'active', label: 'Active' },
        { id: 'archived', label: 'Archived' },
        { id: 'all', label: 'All' },
      ],
    };
  }

  if (
    pathname.startsWith('/accounting/configuration/payment-terms/') &&
    pathname !== '/accounting/configuration/payment-terms'
  ) {
    return {
      title: 'Payment Term',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        {
          label: 'Configuration',
          href: '/accounting/configuration/payment-terms',
        },
        {
          label: 'Payment Terms',
          href: '/accounting/configuration/payment-terms',
        },
        { label: 'Payment Term' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/configuration/payment-terms')) {
    return {
      title: 'Payment Terms',
      subtitle: 'Due date policies for invoices, bills, and receivables',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration' },
        { label: 'Payment Terms' },
      ],
      searchMode: 'payment-terms',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'active', label: 'Active' },
        { id: 'archived', label: 'Archived' },
        { id: 'all', label: 'All' },
      ],
    };
  }

  if (
    pathname.startsWith('/accounting/configuration/currencies/') &&
    pathname !== '/accounting/configuration/currencies'
  ) {
    return {
      title: 'Currency',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        {
          label: 'Configuration',
          href: '/accounting/configuration/currencies',
        },
        {
          label: 'Currencies',
          href: '/accounting/configuration/currencies',
        },
        { label: 'Currency' },
      ],
      searchMode: 'none',
      showFilters: false,
    };
  }
  if (pathname.startsWith('/accounting/configuration/currencies')) {
    return {
      title: 'Currencies',
      subtitle: 'Exchange rates and monetary precision for the ERP',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Configuration' },
        { label: 'Currencies' },
      ],
      searchMode: 'currencies',
      showCreate: true,
      showFilters: true,
      showFavorites: true,
      filters: [
        { id: 'active', label: 'Active' },
        { id: 'archived', label: 'Archived' },
        { id: 'all', label: 'All' },
      ],
    };
  }

  if (pathname.startsWith('/accounting/reports')) {
    return {
      title: 'Reporting',
      subtitle: 'Statement reports from posted journal entries',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Reporting', href: '/accounting/reports' },
        { label: 'Statement Reports' },
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
  if (pathname === '/accounting/credit-notes/new') {
    return {
      title: 'New Credit Note',
      subtitle: 'Create a draft customer credit note',
      breadcrumbs: [
        { label: 'Accounting', href: '/accounting' },
        { label: 'Customers', href: '/accounting/customers' },
        { label: 'Credit Notes', href: '/accounting/credit-notes' },
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

export function isAccountingGlMenuPath(pathname: string): boolean {
  return (
    pathname.startsWith('/accounting/journal-entries') ||
    pathname.startsWith('/accounting/reconcile') ||
    pathname.startsWith('/accounting/assets') ||
    pathname.startsWith('/accounting/loans') ||
    pathname.startsWith('/accounting/tax-returns') ||
    pathname.startsWith('/accounting/lock-dates')
  );
}

export function isConfigurationMenuPath(pathname: string): boolean {
  return pathname.startsWith('/accounting/configuration');
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
  menuId:
    | 'accounting-accounting-menu'
    | 'accounting-configuration-menu'
    | 'accounting-customers-menu'
    | 'accounting-vendors-menu'
    | 'accounting-reports-menu',
  pathname: string
): boolean {
  if (menuId === 'accounting-accounting-menu') {
    return isAccountingGlMenuPath(pathname);
  }
  if (menuId === 'accounting-configuration-menu') {
    return isConfigurationMenuPath(pathname);
  }
  if (menuId === 'accounting-customers-menu') return isCustomersMenuPath(pathname);
  if (menuId === 'accounting-reports-menu') {
    return pathname.startsWith('/accounting/reports');
  }
  return isVendorsMenuPath(pathname);
}
