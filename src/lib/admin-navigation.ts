import type { LucideIcon } from "lucide-react";
import {
  PlusCircle,
  UsersRound,
  Truck,
  Package,
  Container,
  FileText,
  ShoppingCart,
  ClipboardList,
  Receipt,
  ClipboardCheck,
  Calculator,
  Building2,
  BookUser,
  Settings,
  BarChart3,
  Cog,
  TrendingUp,
} from "lucide-react";

export type AdminTab =
  | "dashboard"
  | "create"
  | "profiles"
  | "tracking"
  | "notifications"
  | "management"
  | "console"
  | "loading-instruction"
  | "sales"
  | "operations"
  | "import-packing-list"
  | "import-invoice"
  | "accounting"
  | "inquiry-confirmation"
  | "calculator-config"
  | "contacts"
  | "organization";

export type AdminModule = "sales" | "operations" | "analytics" | "settings";

export type AdminSidebarItem = {
  tab: AdminTab;
  label: string;
  title: string;
  icon: LucideIcon;
  module: AdminModule | null;
};

export type AdminModuleDefinition = {
  id: AdminModule;
  label: string;
  description: string;
  icon: LucideIcon;
  accentClass: string;
  borderClass: string;
  iconBgClass: string;
};

export const ADMIN_MODULES: AdminModuleDefinition[] = [
  {
    id: "sales",
    label: "Sales",
    description: "Leads, customers, and sales pipeline tools",
    icon: ShoppingCart,
    accentClass: "text-[#0f4c5c]",
    borderClass: "border-[#0f4c5c]/20 hover:border-[#0f4c5c]/40",
    iconBgClass: "bg-[#0f4c5c]/10 text-[#0f4c5c]",
  },
  {
    id: "operations",
    label: "Operations",
    description: "Orders, consoles, imports, and fulfillment",
    icon: Cog,
    accentClass: "text-[#218C94]",
    borderClass: "border-[#218C94]/20 hover:border-[#218C94]/40",
    iconBgClass: "bg-[#218C94]/10 text-[#218C94]",
  },
  {
    id: "analytics",
    label: "Analytics",
    description: "Reports and business intelligence",
    icon: BarChart3,
    accentClass: "text-slate-700",
    borderClass: "border-slate-200 hover:border-slate-300",
    iconBgClass: "bg-slate-100 text-slate-600",
  },
  {
    id: "settings",
    label: "Settings",
    description: "Users, profiles, and organization setup",
    icon: Settings,
    accentClass: "text-slate-800",
    borderClass: "border-slate-200 hover:border-slate-300",
    iconBgClass: "bg-slate-100 text-slate-700",
  },
];

/** Sidebar items grouped by module. `module: null` = global (dashboard home). */
export const ADMIN_SIDEBAR_ITEMS: AdminSidebarItem[] = [
  { tab: "dashboard", label: "Dashboard", title: "Dashboard", icon: TrendingUp, module: null },
  { tab: "sales", label: "Sales", title: "Sales", icon: ShoppingCart, module: "sales" },
  { tab: "contacts", label: "Contacts", title: "Contacts", icon: BookUser, module: "sales" },
  {
    tab: "management",
    label: "Order Management",
    title: "Order Management",
    icon: Package,
    module: "operations",
  },
  { tab: "console", label: "Console", title: "Console", icon: Container, module: "operations" },
  { tab: "tracking", label: "Order Tracking", title: "Order Tracking", icon: Truck, module: "operations" },
  {
    tab: "loading-instruction",
    label: "Loading Instruction",
    title: "Loading Instruction",
    icon: FileText,
    module: "operations",
  },
  {
    tab: "import-packing-list",
    label: "Import Packing List",
    title: "Import Packing List",
    icon: ClipboardList,
    module: "operations",
  },
  {
    tab: "import-invoice",
    label: "Import Invoice",
    title: "Import Invoice",
    icon: Receipt,
    module: "operations",
  },
  {
    tab: "inquiry-confirmation",
    label: "Inquiry Confirmation",
    title: "Inquiry Confirmation",
    icon: ClipboardCheck,
    module: "operations",
  },
  {
    tab: "calculator-config",
    label: "Calculator Config",
    title: "Calculator Configuration",
    icon: Calculator,
    module: "operations",
  },
  { tab: "operations", label: "Operations", title: "Operations", icon: Settings, module: "operations" },
  { tab: "accounting", label: "Accounting", title: "Accounting", icon: Calculator, module: "operations" },
  {
    tab: "create",
    label: "Create New User",
    title: "Create New User or Sales Agent",
    icon: PlusCircle,
    module: "settings",
  },
  {
    tab: "organization",
    label: "Organization / Company",
    title: "Organization / Company",
    icon: Building2,
    module: "settings",
  },
  {
    tab: "profiles",
    label: "User Profiles",
    title: "User Profiles",
    icon: UsersRound,
    module: "settings",
  },
];

export function getModuleForTab(tab: AdminTab): AdminModule | null {
  if (tab === "dashboard" || tab === "notifications") return null;
  const item = ADMIN_SIDEBAR_ITEMS.find((entry) => entry.tab === tab);
  return item?.module ?? null;
}

export function getSidebarItemsForModule(module: AdminModule | null) {
  if (module === null) {
    return ADMIN_SIDEBAR_ITEMS.filter((item) => item.module === null);
  }
  return ADMIN_SIDEBAR_ITEMS.filter((item) => item.module === module);
}

export function getDefaultTabForModule(module: AdminModule): AdminTab {
  if (module === "analytics") return "dashboard";
  const first = ADMIN_SIDEBAR_ITEMS.find((item) => item.module === module);
  return first?.tab ?? "dashboard";
}

export function getModuleDefinition(module: AdminModule) {
  return ADMIN_MODULES.find((entry) => entry.id === module);
}
