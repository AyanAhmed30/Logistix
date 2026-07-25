/**
 * Sales module navigation — Odoo Community Sales layout reference.
 * Theme/branding stay Logistix; structure mirrors Odoo Orders / Products / Reporting.
 */

export type SalesMenuLink = {
  id: string;
  label: string;
  href: string;
  /** Permission key; department sales is also required at layout. */
  permission?: string;
  placeholder?: boolean;
  description?: string;
};

export type SalesTopMenu = {
  id: 'orders' | 'products' | 'reporting' | 'to-invoice';
  label: string;
  items: SalesMenuLink[];
};

export const SALES_TOP_MENUS: SalesTopMenu[] = [
  {
    id: 'orders',
    label: 'Orders',
    items: [
      {
        id: 'quotations',
        label: 'Quotations',
        href: '/sales/quotations',
        permission: 'quotations',
        description: 'Sales quotations',
      },
      {
        id: 'orders',
        label: 'Orders',
        href: '/sales/orders',
        permission: 'quotations',
        description: 'Confirmed sales orders',
      },
      {
        id: 'customers',
        label: 'Customers',
        href: '/sales/customers',
        permission: 'customers',
        description: 'Contacts marked as customers',
      },
    ],
  },
  {
    id: 'to-invoice',
    label: 'To Invoice',
    items: [
      {
        id: 'orders-to-invoice',
        label: 'Orders to Invoice',
        href: '/sales/to-invoice',
        permission: 'quotations',
        description: 'Confirmed orders ready to invoice',
      },
      {
        id: 'orders-to-upsell',
        label: 'Orders to Upsell',
        href: '/sales/to-invoice/upsell',
        permission: 'quotations',
        description: 'Orders eligible for additional sales',
      },
    ],
  },
  {
    id: 'products',
    label: 'Products',
    items: [
      {
        id: 'products',
        label: 'Products',
        href: '/sales/products',
        description: 'Sellable products',
      },
    ],
  },
  {
    id: 'reporting',
    label: 'Reporting',
    items: [
      {
        id: 'report-sales',
        label: 'Sales',
        href: '/sales/reports',
        description: 'Quotations and sales analysis',
      },
      {
        id: 'report-products',
        label: 'Products',
        href: '/sales/reports?view=products',
        description: 'Product performance',
      },
      {
        id: 'report-salesperson',
        label: 'Salespersons',
        href: '/sales/reports?view=salesperson',
        description: 'Salesperson performance',
      },
      {
        id: 'report-customers',
        label: 'Customers',
        href: '/sales/reports?view=customers',
        description: 'Customer analysis',
      },
      {
        id: 'report-organization',
        label: 'Organizations',
        href: '/sales/reports?view=organization',
        description: 'Organization reports',
      },
    ],
  },
];

export type SalesBreadcrumb = { label: string; href?: string };

export type SalesPageMeta = {
  title: string;
  breadcrumbs: SalesBreadcrumb[];
  showCreate?: boolean;
  createLabel?: string;
  searchPlaceholder?: string;
  searchMode?: 'quotations' | 'customers' | 'products' | 'none';
  showFilters?: boolean;
  showFavorites?: boolean;
};

export function getSalesPageMeta(pathname: string): SalesPageMeta {
  const path = pathname.replace(/\/$/, '') || '/sales';

  if (path.startsWith('/sales/quotations/new')) {
    return {
      title: 'New Quotation',
      breadcrumbs: [
        { label: 'Orders', href: '/sales/quotations' },
        { label: 'Quotations', href: '/sales/quotations' },
        { label: 'New' },
      ],
      showCreate: false,
      searchMode: 'none',
    };
  }

  if (path.startsWith('/sales/quotations/')) {
    return {
      title: 'Quotation',
      breadcrumbs: [
        { label: 'Orders', href: '/sales/quotations' },
        { label: 'Quotations', href: '/sales/quotations' },
        { label: 'Quotation' },
      ],
      showCreate: false,
      searchMode: 'none',
    };
  }

  if (path.startsWith('/sales/quotations')) {
    return {
      title: 'Quotations',
      breadcrumbs: [
        { label: 'Orders', href: '/sales/quotations' },
        { label: 'Quotations' },
      ],
      showCreate: true,
      createLabel: 'New',
      searchPlaceholder: 'Search…',
      searchMode: 'quotations',
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith('/sales/customers')) {
    return {
      title: 'Customers',
      breadcrumbs: [
        { label: 'Orders', href: '/sales/quotations' },
        { label: 'Customers' },
      ],
      showCreate: false,
      searchPlaceholder: 'Search…',
      searchMode: 'customers',
      showFilters: false,
      showFavorites: true,
    };
  }

  if (path.startsWith('/sales/orders/') && path !== '/sales/orders') {
    return {
      title: 'Sales Order',
      breadcrumbs: [
        { label: 'Orders', href: '/sales/orders' },
        { label: 'Orders', href: '/sales/orders' },
        { label: 'Sales Order' },
      ],
      showCreate: false,
      searchMode: 'none',
    };
  }

  if (path.startsWith('/sales/orders')) {
    return {
      title: 'Sales Orders',
      breadcrumbs: [
        { label: 'Orders', href: '/sales/orders' },
        { label: 'Orders' },
      ],
      showCreate: false,
      searchPlaceholder: 'Search…',
      searchMode: 'quotations',
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith('/sales/products/new') || path.match(/\/sales\/products\/[^/]+$/)) {
    return {
      title: path.endsWith('/new') ? 'New Product' : 'Product',
      breadcrumbs: [
        { label: 'Products', href: '/sales/products' },
        { label: path.endsWith('/new') ? 'New' : 'Product' },
      ],
      showCreate: false,
      searchMode: 'none',
    };
  }

  if (path.startsWith('/sales/products')) {
    return {
      title: 'Products',
      breadcrumbs: [{ label: 'Products' }],
      showCreate: true,
      createLabel: 'New',
      searchPlaceholder: 'Search products…',
      searchMode: 'products',
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith('/sales/to-invoice/upsell')) {
    return {
      title: 'Orders to Upsell',
      breadcrumbs: [
        { label: 'To Invoice', href: '/sales/to-invoice' },
        { label: 'Orders to Upsell' },
      ],
      showCreate: false,
      searchPlaceholder: 'Search…',
      searchMode: 'quotations',
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith('/sales/invoices/')) {
    return {
      title: 'Customer Invoice',
      breadcrumbs: [
        { label: 'Orders to Invoice', href: '/sales/to-invoice' },
        { label: 'Invoice' },
      ],
      showCreate: false,
      searchMode: 'none',
    };
  }

  if (
    path.startsWith('/sales/to-invoice/') &&
    path !== '/sales/to-invoice' &&
    !path.startsWith('/sales/to-invoice/upsell')
  ) {
    return {
      title: 'Sales Order',
      breadcrumbs: [
        { label: 'Orders to Invoice', href: '/sales/to-invoice' },
        { label: 'Sales Order' },
      ],
      showCreate: false,
      searchMode: 'none',
    };
  }

  if (path.startsWith('/sales/to-invoice')) {
    return {
      title: 'Orders to Invoice',
      breadcrumbs: [
        { label: 'Orders to Invoice' },
      ],
      showCreate: false,
      searchPlaceholder: 'Search…',
      searchMode: 'quotations',
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith('/sales/reports')) {
    return {
      title: 'Sales Analysis',
      breadcrumbs: [
        { label: 'Reporting', href: '/sales/reports' },
        { label: 'Sales' },
      ],
      showCreate: false,
      searchPlaceholder: 'Search report…',
      searchMode: 'quotations',
      showFilters: false,
      showFavorites: true,
    };
  }

  return {
    title: 'Sales',
    breadcrumbs: [{ label: 'Sales' }],
    showCreate: false,
    searchMode: 'none',
  };
}

export type SalesFilterDefinition = {
  id: string;
  label: string;
  description?: string;
};

export const SALES_QUOTATION_FILTERS: SalesFilterDefinition[] = [
  { id: 'all', label: 'All', description: 'All quotations' },
  { id: 'draft', label: 'Draft', description: 'Not sent yet' },
  { id: 'sent', label: 'Sent', description: 'Sent to customer' },
  { id: 'review', label: 'Customer Review', description: 'Awaiting customer' },
  { id: 'expired', label: 'Expired', description: 'Past expiration date' },
  { id: 'confirmed', label: 'Sales Orders', description: 'Confirmed quotations' },
  { id: 'cancelled', label: 'Cancelled', description: 'Cancelled quotations' },
];

export const SALES_PRODUCT_FILTERS: SalesFilterDefinition[] = [
  { id: 'active', label: 'Active', description: 'Sellable products' },
  { id: 'archived', label: 'Archived', description: 'Hidden from new quotations' },
  { id: 'all', label: 'All', description: 'Active and archived' },
];

export const SALES_ORDER_FILTERS: SalesFilterDefinition[] = [
  { id: 'all', label: 'All', description: 'Confirmed sales orders' },
  { id: 'locked', label: 'Locked', description: 'Locked sales orders' },
  { id: 'waiting', label: 'Waiting', description: 'Delivery waiting (placeholder)' },
  { id: 'ready', label: 'Ready', description: 'Ready to deliver (placeholder)' },
  { id: 'delivered', label: 'Delivered', description: 'Delivered (placeholder)' },
  { id: 'cancelled', label: 'Cancelled', description: 'Cancelled orders' },
];

export const SALES_TO_INVOICE_FILTERS: SalesFilterDefinition[] = [
  { id: 'to_invoice', label: 'To Invoice', description: 'Ready to create invoice' },
  { id: 'invoiced', label: 'Fully Invoiced', description: 'Invoice already created' },
  { id: 'no', label: 'Nothing to Invoice', description: 'No invoicing needed' },
  { id: 'all', label: 'All', description: 'All confirmed orders' },
];

export const SALES_UPSELL_FILTERS: SalesFilterDefinition[] = [
  { id: 'all', label: 'All', description: 'All upsell candidates' },
  { id: 'invoiced', label: 'Fully Invoiced', description: 'Best upsell candidates' },
  { id: 'to_invoice', label: 'To Invoice', description: 'Pending invoice first' },
];

export function getSalesFiltersForPath(pathname: string): SalesFilterDefinition[] {
  if (pathname.includes('/sales/products')) return SALES_PRODUCT_FILTERS;
  if (pathname.includes('/sales/to-invoice/upsell')) return SALES_UPSELL_FILTERS;
  if (pathname.includes('/sales/to-invoice')) return SALES_TO_INVOICE_FILTERS;
  if (pathname.includes('/sales/orders')) return SALES_ORDER_FILTERS;
  return SALES_QUOTATION_FILTERS;
}

export type SalesOrderInvoiceStatus = 'no' | 'to_invoice' | 'invoiced';

export function salesInvoiceStatusLabel(status: SalesOrderInvoiceStatus | string) {
  switch (status) {
    case 'to_invoice':
      return 'To Invoice';
    case 'invoiced':
      return 'Fully Invoiced';
    case 'no':
    default:
      return 'Nothing to Invoice';
  }
}

export const SALES_ORDER_GROUP_BY_OPTIONS: SalesFilterDefinition[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'delivery', label: 'Delivery Status' },
  { id: 'salesperson', label: 'Salesperson' },
  { id: 'customer', label: 'Customer' },
];

export function salesDeliveryStatusLabel(
  status: 'waiting' | 'ready' | 'delivered' | string
) {
  switch (status) {
    case 'ready':
      return 'Ready';
    case 'delivered':
      return 'Delivered';
    case 'waiting':
    default:
      return 'Waiting';
  }
}

export const SALES_GROUP_BY_OPTIONS: SalesFilterDefinition[] = [
  { id: 'none', label: 'No grouping' },
  { id: 'status', label: 'Status' },
  { id: 'salesperson', label: 'Salesperson' },
  { id: 'customer', label: 'Customer' },
];

/** Map DB status → Odoo-style display status */
export type SalesQuotationUiStatus =
  | 'draft'
  | 'sent'
  | 'review'
  | 'confirmed'
  | 'cancelled'
  | 'expired';

export function mapQuotationDbStatusToUi(
  status: string | null | undefined
): SalesQuotationUiStatus {
  switch (String(status || '').toLowerCase()) {
    case 'quotation_sent':
    case 'sent':
      return 'sent';
    case 'customer_review':
    case 'review':
      return 'review';
    case 'sales_order':
    case 'confirmed':
      return 'confirmed';
    case 'cancelled':
    case 'canceled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'quotation':
    case 'draft':
    default:
      return 'draft';
  }
}

export function mapQuotationUiStatusToDb(ui: SalesQuotationUiStatus): string {
  switch (ui) {
    case 'sent':
      return 'quotation_sent';
    case 'review':
      return 'customer_review';
    case 'confirmed':
      return 'sales_order';
    case 'cancelled':
      return 'cancelled';
    case 'expired':
      return 'expired';
    case 'draft':
    default:
      return 'quotation';
  }
}

export function salesQuotationStatusLabel(ui: SalesQuotationUiStatus): string {
  switch (ui) {
    case 'sent':
      return 'Quotation Sent';
    case 'review':
      return 'Customer Review';
    case 'confirmed':
      return 'Sales Order';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    case 'draft':
    default:
      return 'Quotation';
  }
}
