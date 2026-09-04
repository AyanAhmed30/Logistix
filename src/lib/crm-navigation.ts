import type { LucideIcon } from "lucide-react";
import { Kanban, Users, CalendarCheck, BarChart3, FileText, ClipboardList } from "lucide-react";
import type { CrmModuleTab } from "@/lib/dashboard-access";

export type CrmNavItem = {
  id: CrmModuleTab | "crm-quotations" | "crm-inquiries";
  label: string;
  href: string;
  icon: LucideIcon;
  /** Permission tab required; quotations has none (placeholder). */
  permission?: CrmModuleTab;
  placeholder?: boolean;
};

/** Flat list kept for permission/path helpers. */
export const CRM_NAV_ITEMS: CrmNavItem[] = [
  {
    id: "crm-pipeline",
    label: "My Pipeline",
    href: "/crm/pipeline",
    icon: Kanban,
    permission: "crm-pipeline",
  },
  {
    id: "crm-activities",
    label: "My Activities",
    href: "/crm/activities",
    icon: CalendarCheck,
    permission: "crm-activities",
  },
  {
    id: "crm-quotations",
    label: "My Quotations",
    href: "/sales/quotations",
    icon: FileText,
  },
  {
    id: "crm-inquiries",
    label: "All Inquiries",
    href: "/crm/inquiries",
    icon: ClipboardList,
  },
  {
    id: "crm-customers",
    label: "Customers",
    href: "/crm/customers",
    icon: Users,
    permission: "crm-customers",
  },
  {
    id: "crm-reports",
    label: "Pipeline",
    href: "/crm/reports",
    icon: BarChart3,
    permission: "crm-reports",
  },
];

export type CrmMenuLink = {
  id: string;
  label: string;
  href: string;
  permission?: CrmModuleTab;
  placeholder?: boolean;
  description?: string;
};

export type CrmTopMenu = {
  id: "sales" | "reporting";
  label: string;
  items: CrmMenuLink[];
};

/** Odoo CRM top menus: Sales / Reporting */
export const CRM_TOP_MENUS: CrmTopMenu[] = [
  {
    id: "sales",
    label: "Sales",
    items: [
      {
        id: "my-pipeline",
        label: "My Pipeline",
        href: "/crm/pipeline",
        permission: "crm-pipeline",
        description: "Opportunities kanban",
      },
      {
        id: "my-activities",
        label: "My Activities",
        href: "/crm/activities",
        permission: "crm-activities",
        description: "Calls, meetings & to-dos",
      },
      {
        id: "my-quotations",
        label: "My Quotations",
        href: "/sales/quotations",
        description: "Open Sales quotations",
      },
      {
        id: "all-inquiries",
        label: "All Inquiries",
        href: "/crm/inquiries",
        description: "Submitted inquiries and workflow status",
      },
      {
        id: "customers",
        label: "Customers",
        href: "/crm/customers",
        permission: "crm-customers",
        description: "Customer contacts",
      },
    ],
  },
  {
    id: "reporting",
    label: "Reporting",
    items: [
      {
        id: "report-pipeline",
        label: "Pipeline",
        href: "/crm/reports",
        permission: "crm-reports",
        description: "Pipeline analysis",
      },
      {
        id: "report-activities",
        label: "Activities",
        href: "/crm/reports?view=activities",
        permission: "crm-reports",
        description: "Activity performance",
      },
    ],
  },
];

export type CrmBreadcrumb = {
  label: string;
  href?: string;
};

export type CrmPageMeta = {
  title: string;
  breadcrumbs: CrmBreadcrumb[];
  /** Show New / Create in control panel */
  showCreate?: boolean;
  createLabel?: string;
  searchPlaceholder?: string;
  /** Control-panel search drives this route */
  searchMode?: "customers" | "pipeline" | "inquiries" | "none";
  showFilters?: boolean;
  showFavorites?: boolean;
};

export function getCrmPageMeta(
  pathname: string,
  reportView?: string | null
): CrmPageMeta {
  const path = pathname.replace(/\/$/, "") || "/crm";

  if (path.startsWith("/crm/opportunities/new")) {
    return {
      title: "New Opportunity",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "My Pipeline", href: "/crm/pipeline" },
        { label: "New" },
      ],
      showCreate: false,
      searchMode: "none",
    };
  }

  if (path.startsWith("/crm/opportunities/") && path.includes("/inquiry")) {
    return {
      title: "Send Inquiry",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "My Pipeline", href: "/crm/pipeline" },
        { label: "Opportunity", href: path.replace(/\/inquiry.*$/, "") },
        { label: "Inquiry" },
      ],
      showCreate: false,
      searchMode: "none",
      showFilters: false,
      showFavorites: false,
    };
  }

  if (path.startsWith("/crm/opportunities/")) {
    return {
      title: "Opportunity",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "My Pipeline", href: "/crm/pipeline" },
        { label: "Opportunity" },
      ],
      showCreate: false,
      searchMode: "none",
    };
  }

  if (path.startsWith("/crm/customers/") && path !== "/crm/customers") {
    const isNew = path === "/crm/customers/new" || path.endsWith("/customers/new");
    return {
      title: isNew ? "New Contact" : "Customer",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "Customers", href: "/crm/customers" },
        { label: isNew ? "New" : "Customer" },
      ],
      showCreate: false,
      searchMode: "none",
      showFilters: false,
      showFavorites: false,
    };
  }

  if (path.startsWith("/crm/customers")) {
    return {
      title: "Customers",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "Customers" },
      ],
      showCreate: false,
      createLabel: "New",
      searchPlaceholder: "Search…",
      searchMode: "customers",
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith("/crm/activities")) {
    return {
      title: "My Activities",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "My Activities" },
      ],
      showCreate: false,
      createLabel: "New",
      searchPlaceholder: "Search…",
      searchMode: "none",
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith("/crm/reports")) {
    if (reportView === "activities") {
      return {
        title: "Activities Analysis",
        breadcrumbs: [
          { label: "Reporting", href: "/crm/reports" },
          { label: "Activities" },
        ],
        showCreate: false,
        searchPlaceholder: "Search…",
        searchMode: "none",
        showFilters: true,
        showFavorites: true,
      };
    }
    return {
      title: "Pipeline Analysis",
      breadcrumbs: [
        { label: "Reporting", href: "/crm/reports" },
        { label: "Pipeline" },
      ],
      showCreate: false,
      searchPlaceholder: "Search…",
      searchMode: "none",
      showFilters: true,
      showFavorites: true,
    };
  }

  if (path.startsWith("/crm/inquiries/") && path !== "/crm/inquiries") {
    return {
      title: "Inquiry",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "All Inquiries", href: "/crm/inquiries" },
        { label: "Inquiry" },
      ],
      showCreate: false,
      searchMode: "none",
      showFilters: false,
      showFavorites: false,
    };
  }

  if (path.startsWith("/crm/inquiries")) {
    return {
      title: "All Inquiries",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "All Inquiries" },
      ],
      showCreate: false,
      searchPlaceholder: "Search inquiries…",
      searchMode: "inquiries",
      showFilters: false,
      showFavorites: false,
    };
  }

  if (path.startsWith("/crm/quotations")) {
    return {
      title: "My Quotations",
      breadcrumbs: [
        { label: "Sales", href: "/crm/pipeline" },
        { label: "My Quotations" },
      ],
      showCreate: false,
      searchMode: "none",
    };
  }

  // Default: My Pipeline
  return {
    title: "My Pipeline",
    breadcrumbs: [
      { label: "Sales", href: "/crm/pipeline" },
      { label: "My Pipeline" },
    ],
    showCreate: false,
    createLabel: "New",
    searchPlaceholder: "Search…",
    searchMode: "pipeline",
    showFilters: true,
    showFavorites: true,
  };
}

export function getCrmNavItemForPath(pathname: string): CrmNavItem | null {
  const normalized = pathname.replace(/\/$/, "");
  if (normalized.startsWith("/crm/opportunities")) {
    return CRM_NAV_ITEMS.find((i) => i.id === "crm-pipeline") ?? null;
  }
  if (normalized.startsWith("/crm/reports")) {
    return CRM_NAV_ITEMS.find((i) => i.id === "crm-reports") ?? null;
  }
  return (
    CRM_NAV_ITEMS.find(
      (item) =>
        normalized === item.href || normalized.startsWith(`${item.href}/`)
    ) ?? null
  );
}

export function getCrmPermissionForPath(pathname: string): CrmModuleTab | null {
  const item = getCrmNavItemForPath(pathname);
  if (!item) return null;
  if (item.id === "crm-quotations" || item.id === "crm-inquiries") return null;
  return (item.permission as CrmModuleTab) || null;
}

/** CRM search scopes — extensible for Phase 2+ (opportunities, activities, etc.). */
export type CrmSearchScope =
  | "customers"
  | "opportunities"
  | "activities"
  | "meetings"
  | "notes";

export const CRM_SEARCH_SCOPES: Array<{
  key: CrmSearchScope;
  label: string;
  enabled: boolean;
}> = [
  { key: "customers", label: "Customers", enabled: true },
  { key: "opportunities", label: "Opportunities", enabled: false },
  { key: "activities", label: "Activities", enabled: false },
  { key: "meetings", label: "Meetings", enabled: false },
  { key: "notes", label: "Notes", enabled: false },
];

export type CrmFilterDefinition = {
  id: string;
  label: string;
  description?: string;
};

export const CRM_CUSTOMER_FILTERS: CrmFilterDefinition[] = [
  {
    id: "all",
    label: "All Contacts",
    description: "Every contact from the Contacts module",
  },
];

/** Odoo-style Filters menu options (shared control panel). */
export const CRM_CONTROL_FILTERS: CrmFilterDefinition[] = [
  { id: "all", label: "All", description: "Clear filters" },
  { id: "my", label: "My Pipeline", description: "Assigned to me" },
  { id: "open", label: "Open Opportunities", description: "Not won or lost" },
  {
    id: "customers",
    label: "All Contacts",
    description: "Contacts from the Contacts module",
  },
];
