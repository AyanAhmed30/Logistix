"use client";

import { useMemo, useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { deleteUser, updateUser } from "@/app/actions/user";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  Settings,
  UserCog,
  MessageSquare,
  Wrench,
  FolderTree,
  BookOpen,
  BookText,
  DollarSign,
  ClipboardList,
  FileText,
  UsersRound,
  Receipt,
  ClipboardCheck,
  PlusCircle,
} from "lucide-react";
import {
  type AdminModule,
  type AdminTab,
  getModuleDefinition,
  getSidebarItemsForModule,
} from "@/lib/admin-navigation";
import { AdminModuleCards } from "@/components/admin/AdminModuleCards";
import { AdminAnalyticsPlaceholder } from "@/components/admin/AdminAnalyticsPlaceholder";
import { AdminSettingsLayout } from "@/components/admin/AdminSettingsLayout";
import { ClientErrorBoundary } from "@/components/error/ClientErrorBoundary";
import { OrderTrackingPanel } from "@/components/admin/OrderTrackingPanel";
import { AdminNotificationsPanel } from "@/components/admin/AdminNotificationsPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { OperationsLeadsInquiryPanel } from "@/components/admin/OperationsLeadsInquiryPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { QuotationPanel } from "@/components/admin/QuotationPanel";
import { InvoicePanel } from "@/components/admin/InvoicePanel";
import { AccountingInquiriesPanel } from "@/components/admin/AccountingInquiriesPanel";
import { InquiryConfirmationPanel } from "@/components/admin/InquiryConfirmationPanel";
import { prefetchInquiryConfirmationsList } from "@/lib/admin-inquiry-confirmations-cache";
import { AdminCalculatorPanel } from "@/components/admin/AdminCalculatorPanel";
import { ChartOfAccountsPanel } from "@/components/admin/ChartOfAccountsPanel";
import { JournalsPanel } from "@/components/admin/JournalsPanel";
import { JournalEntriesPanel } from "@/components/admin/JournalEntriesPanel";
import { PartnersPanel } from "@/components/admin/PartnersPanel";
import { VendorBillsPanel } from "@/components/admin/VendorBillsPanel";
import { PaymentsPanel } from "@/components/admin/PaymentsPanel";
import { ReconciliationPanel } from "@/components/admin/ReconciliationPanel";
import { ContactsPanel } from "@/components/admin/ContactsPanel";
import { OrganizationPanel } from "@/components/admin/OrganizationPanel";
import { UsersManagementPanel } from "@/components/admin/UsersManagementPanel";
import { useDashboardAccess } from "@/contexts/DashboardAccessContext";
import {
  canAccessAdminTab,
  defaultSalesRouteForAccess,
  isPortalDashboardAccess,
} from "@/lib/dashboard-access";
import {
  PortalContactsModuleContent,
  PortalOperationsModuleContent,
  PortalWarehouseModuleContent,
} from "@/components/admin/PortalModulePanels";
import { PortalUserProfilePanel } from "@/components/admin/PortalUserProfilePanel";
import { OrganizationUsersManagementPanel } from "@/components/admin/OrganizationUsersManagementPanel";
import type { Organization } from "@/app/actions/organizations";

function LegacySalesRedirect({ href }: { href: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(href);
  }, [router, href]);
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-10 text-center text-sm text-secondary-muted">
      Opening Sales module…
    </div>
  );
}

type AppUser = {
  id: string;
  username: string;
  password: string;
  created_at: string;
};

type Props = {
  users: AppUser[];
  userCount: number;
  activeTab: AdminTab;
  activeModule: AdminModule | null;
  onTabChange: (tab: AdminTab) => void;
  onModuleSelect: (module: AdminModule) => void;
  onBackToModules: () => void;
  quotationPayload?: {
    contactId?: string | null;
    quotationId?: string | null;
    token: number;
  } | null;
  contactPayload?: {
    contactId?: string | null;
    token: number;
  } | null;
  invoicePayload?: {
    invoiceId?: string | null;
    token: number;
  } | null;
  portalOrganization?: Organization | null;
};

export function AdminUserManager({
  users,
  userCount,
  activeTab,
  activeModule,
  onTabChange,
  onModuleSelect,
  onBackToModules,
  quotationPayload,
  contactPayload,
  invoicePayload,
  portalOrganization = null,
}: Props) {
  const access = useDashboardAccess();
  const isPortal = isPortalDashboardAccess(access);
  const router = useRouter();
  const [accountingSubTab, setAccountingSubTab] = useState<"quotation" | "customer-invoice" | "vendor-bills" | "payments" | "reconciliation" | "inquiries" | "chart-of-accounts" | "journals" | "journal-entries" | "partners" | null>(
    activeTab === "accounting" ? "inquiries" : null
  );
  const [operationsSubTab, setOperationsSubTab] = useState<"operations" | "leads-inquiry" | null>(
    activeTab === "operations" ? "operations" : null
  );
  const [editOpen, setEditOpen] = useState(false);
  const [editUser, setEditUser] = useState<AppUser | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState<AppUser | null>(null);
  const [isPending, startTransition] = useTransition();

  // Track previous activeTab to detect tab changes
  const prevActiveTabRef = useRef(activeTab);
  
  // Handle sub-tab initialization/reset when activeTab changes
  // Using setTimeout to defer setState calls outside of effect synchronous execution
  useEffect(() => {
    const prevActiveTab = prevActiveTabRef.current;
    
    if (prevActiveTab !== activeTab) {
      prevActiveTabRef.current = activeTab;
      
      // Defer state updates to avoid synchronous setState in effect
      setTimeout(() => {
        if (activeTab === "accounting") {
          setAccountingSubTab("inquiries");
        } else if (prevActiveTab === "accounting") {
          setAccountingSubTab(null);
        }

        if (activeTab === "operations") {
          setOperationsSubTab("operations");
        } else if (prevActiveTab === "operations") {
          setOperationsSubTab(null);
        }
      }, 0);
    }
  }, [activeTab]);

  // When a cross-module payload arrives for the quotation module, make sure
  // the accounting "Quotation" sub-tab is active.
  useEffect(() => {
    if (!quotationPayload?.token) return;
    if (activeTab === "accounting") {
      Promise.resolve().then(() => {
        setAccountingSubTab("quotation");
      });
    }
  }, [quotationPayload?.token, activeTab]);

  // When a cross-module payload arrives for the invoice module, make sure
  // the accounting "Customer Invoice" sub-tab is active.
  useEffect(() => {
    if (!invoicePayload?.token) return;
    if (activeTab === "accounting") {
      Promise.resolve().then(() => {
        setAccountingSubTab("customer-invoice");
      });
    }
  }, [invoicePayload?.token, activeTab]);

  const sortedUsers = useMemo(() => {
    return [...users].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [users]);

  function handleEditSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editUser) return;
    const formData = new FormData(event.currentTarget);
    formData.set("id", editUser.id);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!username || !password) {
      toast.error("Username and password are required");
      return;
    }

    startTransition(async () => {
      const result = await updateUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("User updated", {
        className: "bg-green-400 text-white border-green-400",
      });
      setEditOpen(false);
      setEditUser(null);
      router.refresh();
    });
  }

  function handleDelete(user: AppUser) {
    setDeleteUserTarget(user);
    setDeleteOpen(true);
  }

  function confirmDelete() {
    if (!deleteUserTarget) return;
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", deleteUserTarget.id);
      const result = await deleteUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("User deleted", {
        className: "bg-green-400 text-white border-green-400",
      });
      setDeleteOpen(false);
      setDeleteUserTarget(null);
      router.refresh();
    });
  }

  function openEdit(user: AppUser) {
    setEditUser(user);
    setEditOpen(true);
  }

  function handleTabSelect(tab: AdminTab) {
    onTabChange(tab);
  }

  const moduleNavItems = getSidebarItemsForModule(activeModule)
    .filter((item) => item.module !== null)
    .filter(
      (item) =>
        !isPortal || canAccessAdminTab(access, item.tab, activeModule)
    );
  const moduleDefinition = activeModule ? getModuleDefinition(activeModule) : null;
  const isSettingsModule = activeModule === "settings";
  const isSettingsTab =
    !isPortal &&
    (activeTab === "create" || activeTab === "organization");
  const usesPortalModuleShell =
    isPortal &&
    (activeModule === "operations" ||
      activeModule === "warehouse" ||
      activeModule === "contacts" ||
      activeModule === "settings");
  const showModuleHeader =
    activeModule &&
    moduleDefinition &&
    activeTab !== "notifications" &&
    (!isSettingsModule || isPortal);

  function handleSettingsTabSelect(tab: AdminTab) {
    handleTabSelect(tab);
  }

  const panelResetKey = [
    activeTab,
    activeModule ?? "none",
    operationsSubTab,
    accountingSubTab,
  ].join(":");

  return (
    <div className="pt-20">
      <section className="px-6 pb-10 md:px-10 space-y-6">
        {showModuleHeader ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                className="gap-2 border-dashed"
                onClick={onBackToModules}
                title="Back to Modules"
              >
                <ArrowLeft className="h-4 w-4 shrink-0" />
                <span>Back to Modules</span>
              </Button>
              <div>
                <h2 className="text-lg font-black text-primary-dark">{moduleDefinition.label}</h2>
                <p className="text-xs text-secondary-muted">{moduleDefinition.description}</p>
              </div>
            </div>
            {moduleNavItems.length > 0 && !usesPortalModuleShell ? (
              <div className="flex flex-wrap gap-2 border-b pb-3">
                {moduleNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Button
                      key={item.tab}
                      variant={activeTab === item.tab ? "default" : "outline"}
                      className="justify-start gap-2"
                      title={item.title}
                      onClick={() => {
                        if (item.tab === "inquiry-confirmation") {
                          void prefetchInquiryConfirmationsList().catch(() => undefined);
                        }
                        handleTabSelect(item.tab);
                      }}
                      onMouseEnter={
                        item.tab === "inquiry-confirmation"
                          ? () => {
                              void prefetchInquiryConfirmationsList().catch(() => undefined);
                            }
                          : undefined
                      }
                      onFocus={
                        item.tab === "inquiry-confirmation"
                          ? () => {
                              void prefetchInquiryConfirmationsList().catch(() => undefined);
                            }
                          : undefined
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <ClientErrorBoundary
          resetKey={panelResetKey}
          title="This section is temporarily unavailable"
          description="Something went wrong in this module. Try again or switch to another tab."
          compact
        >
        {isPortal && activeModule === "sales" ? (
          <LegacySalesRedirect href={defaultSalesRouteForAccess(access)} />
        ) : isPortal && activeModule === "operations" ? (
          <PortalOperationsModuleContent access={access} />
        ) : isPortal && activeModule === "warehouse" ? (
          <PortalWarehouseModuleContent access={access} />
        ) : isPortal && activeModule === "contacts" ? (
          <PortalContactsModuleContent initialPayload={contactPayload ?? undefined} />
        ) : isPortal && activeModule === "settings" ? (
          access.isOrganizationAdmin ? (
            <OrganizationUsersManagementPanel />
          ) : (
            <PortalUserProfilePanel />
          )
        ) : activeTab === "dashboard" ? (
          activeModule === "analytics" ? (
            <AdminAnalyticsPlaceholder />
          ) : (
            <AdminModuleCards onModuleSelect={onModuleSelect} access={access} />
          )
        ) : activeTab === "notifications" ? (
          <AdminNotificationsPanel />
        ) : activeTab === "tracking" ? (
          <OrderTrackingPanel />
        ) : activeTab === "management" ? (
          <OrderManagementPanel />
        ) : activeTab === "console" ? (
          <ConsolePanel />
        ) : activeTab === "loading-instruction" ? (
          <LoadingInstructionPanel />
        ) : activeTab === "sales" ? (
          <LegacySalesRedirect href={defaultSalesRouteForAccess(access)} />
        ) : activeTab === "contacts" || activeModule === "contacts" ? (
          <ContactsPanel initialPayload={contactPayload ?? undefined} />
        ) : activeTab === "operations" ? (
          <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex gap-2 border-b overflow-x-auto">
              <Button
                variant={operationsSubTab === "operations" ? "default" : "ghost"}
                onClick={() => setOperationsSubTab("operations")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={operationsSubTab === "operations" ? "default" : "outline"}
              >
                <Settings className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Operations</span>
              </Button>
              <Button
                variant={operationsSubTab === "leads-inquiry" ? "default" : "ghost"}
                onClick={() => setOperationsSubTab("leads-inquiry")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={operationsSubTab === "leads-inquiry" ? "default" : "outline"}
              >
                <ClipboardList className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Leads Inquiry</span>
              </Button>
            </div>

            {/* Operations Sub-tab Content */}
            {operationsSubTab === "operations" && (
              <OperationsPanel />
            )}

            {/* Leads Inquiry Sub-tab Content */}
            {operationsSubTab === "leads-inquiry" && (
              <OperationsLeadsInquiryPanel adminCalculatorMode />
            )}
          </div>
        ) : activeTab === "inquiry-confirmation" ? (
          <InquiryConfirmationPanel />
        ) : activeTab === "calculator-config" ? (
          <AdminCalculatorPanel />
        ) : activeTab === "import-packing-list" ? (
          <ImportPackingListPanel />
        ) : activeTab === "import-invoice" ? (
          <ImportInvoicePanel />
        ) : activeTab === "accounting" ? (
          <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex gap-2 border-b overflow-x-auto">
              <Button
                variant={accountingSubTab === "inquiries" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("inquiries")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "inquiries" ? "default" : "outline"}
              >
                <MessageSquare className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Inquiries</span>
              </Button>
              <Button
                variant={accountingSubTab === "quotation" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("quotation")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "quotation" ? "default" : "outline"}
              >
                <FileText className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Quotation</span>
              </Button>
              <Button
                variant={accountingSubTab === "chart-of-accounts" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("chart-of-accounts")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "chart-of-accounts" ? "default" : "outline"}
              >
                <FolderTree className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Chart of Accounts</span>
              </Button>
              <Button
                variant={accountingSubTab === "journals" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("journals")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "journals" ? "default" : "outline"}
              >
                <BookOpen className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Journals</span>
              </Button>
              <Button
                variant={accountingSubTab === "journal-entries" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("journal-entries")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "journal-entries" ? "default" : "outline"}
              >
                <BookText className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Journal Entries</span>
              </Button>
              <Button
                variant={accountingSubTab === "partners" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("partners")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "partners" ? "default" : "outline"}
              >
                <UsersRound className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Partners</span>
              </Button>
              <Button
                variant={accountingSubTab === "customer-invoice" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("customer-invoice")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "customer-invoice" ? "default" : "outline"}
              >
                <Receipt className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Customer Invoice</span>
              </Button>
              <Button
                variant={accountingSubTab === "vendor-bills" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("vendor-bills")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "vendor-bills" ? "default" : "outline"}
              >
                <Receipt className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Vendor Bills</span>
              </Button>
              <Button
                variant={accountingSubTab === "payments" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("payments")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "payments" ? "default" : "outline"}
              >
                <DollarSign className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Payments</span>
              </Button>
              <Button
                variant={accountingSubTab === "reconciliation" ? "default" : "ghost"}
                onClick={() => setAccountingSubTab("reconciliation")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={accountingSubTab === "reconciliation" ? "default" : "outline"}
              >
                <ClipboardCheck className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Reconciliation</span>
              </Button>
            </div>

            {/* Inquiries Sub-tab Content */}
            {accountingSubTab === "inquiries" && (
              <AccountingInquiriesPanel />
            )}

            {/* Quotation Sub-tab Content */}
            {accountingSubTab === "quotation" && (
              <QuotationPanel initialPayload={quotationPayload ?? undefined} />
            )}

            {accountingSubTab === "chart-of-accounts" && (
              <ChartOfAccountsPanel />
            )}

            {accountingSubTab === "journals" && (
              <JournalsPanel />
            )}

            {accountingSubTab === "journal-entries" && (
              <JournalEntriesPanel />
            )}

            {accountingSubTab === "partners" && (
              <PartnersPanel />
            )}

            {/* Customer Invoice Sub-tab Content */}
            {accountingSubTab === "customer-invoice" && (
              <InvoicePanel initialPayload={invoicePayload} />
            )}

            {accountingSubTab === "vendor-bills" && (
              <VendorBillsPanel />
            )}

            {accountingSubTab === "payments" && (
              <PaymentsPanel />
            )}

            {accountingSubTab === "reconciliation" && (
              <ReconciliationPanel />
            )}
          </div>
        ) : isSettingsTab ? (
          <AdminSettingsLayout
            activeTab={activeTab}
            onTabSelect={handleSettingsTabSelect}
            onBackToModules={onBackToModules}
          >
            {activeTab === "create" ? (
              <UsersManagementPanel />
            ) : (
              <OrganizationPanel />
            )}
          </AdminSettingsLayout>
        ) : null}
        </ClientErrorBoundary>
      </section>


      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update credentials for this user profile.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-username">Username</Label>
              <Input
                id="edit-username"
                name="username"
                defaultValue={editUser?.username ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-password">Password</Label>
              <Input
                id="edit-password"
                name="password"
                type="password"
                defaultValue={editUser?.password ?? ""}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Delete {deleteUserTarget?.username}? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isPending}
            >
              {isPending ? "Deleting..." : "Delete User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
