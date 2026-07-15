"use client";

import { useMemo, useState, useTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createUser, deleteUser, updateUser } from "@/app/actions/user";
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
import { OrderTrackingPanel } from "@/components/admin/OrderTrackingPanel";
import { AdminNotificationsPanel } from "@/components/admin/AdminNotificationsPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { SalesPanel } from "@/components/admin/SalesPanel";
import { OperationsPanel } from "@/components/admin/OperationsPanel";
import { OperationsLeadsInquiryPanel } from "@/components/admin/OperationsLeadsInquiryPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { SalesAgentPanel } from "@/components/admin/SalesAgentPanel";
import { QuotationPanel } from "@/components/admin/QuotationPanel";
import { InvoicePanel } from "@/components/admin/InvoicePanel";
import { AccountingInquiriesPanel } from "@/components/admin/AccountingInquiriesPanel";
import { InquiryConfirmationPanel } from "@/components/admin/InquiryConfirmationPanel";
import { prefetchInquiryConfirmationsList } from "@/lib/admin-inquiry-confirmations-cache";
import { OperationsUserPanel } from "@/components/admin/OperationsUserPanel";
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
}: Props) {
  const router = useRouter();
  // Initialize sub-tabs based on activeTab
  const [createSubTab, setCreateSubTab] = useState<"user" | "sales-agent" | "operations-user" | null>(
    activeTab === "create" ? "user" : null
  );
  const [createSalesAgentOpen, setCreateSalesAgentOpen] = useState(false);
  const [createOpsUserOpen, setCreateOpsUserOpen] = useState(false);
  const [profilesSubTab, setProfilesSubTab] = useState<"users" | "sales-agent" | "operations-users" | null>(
    activeTab === "profiles" ? "users" : null
  );
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
        if (activeTab === "create") {
          setCreateSubTab("user");
        } else if (prevActiveTab === "create") {
          setCreateSubTab(null);
        }

        if (activeTab === "profiles") {
          setProfilesSubTab("users");
        } else if (prevActiveTab === "profiles") {
          setProfilesSubTab(null);
        }

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

  function handleCreateSubmitFromTab(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(event.currentTarget);
    const username = String(formData.get("username") || "").trim();
    const password = String(formData.get("password") || "").trim();

    if (!username || !password) {
      toast.error("Username and password are required");
      return;
    }

    startTransition(async () => {
      const result = await createUser(formData);
      if (result && "error" in result) {
        toast.error(result.error, {
          className: "bg-red-600 text-white border-red-600",
        });
        return;
      }
      toast.success("User account generated", {
        className: "bg-green-400 text-white border-green-400",
      });
      form.reset();
      router.refresh();
    });
  }

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

  const moduleNavItems = getSidebarItemsForModule(activeModule).filter(
    (item) => item.module !== null
  );
  const moduleDefinition = activeModule ? getModuleDefinition(activeModule) : null;
  const isSettingsModule = activeModule === "settings";
  const isSettingsTab =
    activeTab === "create" || activeTab === "organization" || activeTab === "profiles";

  function handleSettingsTabSelect(tab: AdminTab) {
    if (tab === "create") {
      handleTabSelect("create");
      setCreateSubTab("user");
      return;
    }
    handleTabSelect(tab);
  }

  return (
    <div className="pt-20">
      <section className="px-6 pb-10 md:px-10 space-y-6">
        {activeModule &&
        moduleDefinition &&
        activeTab !== "notifications" &&
        !isSettingsModule ? (
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
            {moduleNavItems.length > 0 ? (
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
                        if (item.tab === "create") {
                          handleTabSelect("create");
                          setCreateSubTab("user");
                          return;
                        }
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

        {activeTab === "dashboard" ? (
          activeModule === "analytics" ? (
            <AdminAnalyticsPlaceholder />
          ) : (
            <AdminModuleCards onModuleSelect={onModuleSelect} />
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
          <SalesPanel />
        ) : activeTab === "contacts" ? (
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
          <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex gap-2 border-b overflow-x-auto">
              <Button
                variant={createSubTab === "user" ? "default" : "ghost"}
                onClick={() => setCreateSubTab("user")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={createSubTab === "user" ? "default" : "outline"}
              >
                <UsersRound className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Create User</span>
              </Button>
              <Button
                variant={createSubTab === "sales-agent" ? "default" : "ghost"}
                onClick={() => setCreateSubTab("sales-agent")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={createSubTab === "sales-agent" ? "default" : "outline"}
              >
                <UserCog className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Create Sales Agent</span>
              </Button>
              <Button
                variant={createSubTab === "operations-user" ? "default" : "ghost"}
                onClick={() => setCreateSubTab("operations-user")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={createSubTab === "operations-user" ? "default" : "outline"}
              >
                <Wrench className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Create Operations User</span>
              </Button>
            </div>

            {/* Create User Sub-tab Content - Only show when this tab is selected */}
            {createSubTab === "user" && (
              <Card className="bg-white border shadow-sm">
                <CardHeader>
                  <CardTitle>Create New User</CardTitle>
                  <CardDescription>
                    Add a new member account to the Logistix system.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateSubmitFromTab} className="space-y-4 max-w-md">
                    <div className="space-y-2">
                      <Label htmlFor="create-username-tab">Username</Label>
                      <Input id="create-username-tab" name="username" placeholder="johndoe" required />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="create-password-tab">Password</Label>
                      <Input
                        id="create-password-tab"
                        name="password"
                        type="password"
                        placeholder="••••••••"
                        required
                      />
                    </div>
                    <Button type="submit" disabled={isPending}>
                      {isPending ? "Creating..." : "Generate User Account"}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Create Sales Agent Sub-tab Content - Only show when this tab is selected */}
            {createSubTab === "sales-agent" && (
              <>
                <Card className="bg-white border shadow-sm">
                  <CardHeader>
                    <CardTitle>Create Sales Agent</CardTitle>
                    <CardDescription>
                      Click the button below to open the Sales Agent creation form.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => {
                        // Stay within the "Create New User" tab and open the Sales Agent creation view
                        setCreateSalesAgentOpen(true);
                      }}
                    >
                      <UserCog className="h-4 w-4 mr-2" />
                      Open Sales Agent Creation
                    </Button>
                  </CardContent>
                </Card>

                {createSalesAgentOpen && (
                  <div className="mt-6">
                    <SalesAgentPanel
                      initialCreateOpen
                      onCreateOpenChange={setCreateSalesAgentOpen}
                    />
                  </div>
                )}
              </>
            )}

            {/* Create Operations User Sub-tab Content */}
            {createSubTab === "operations-user" && (
              <>
                <Card className="bg-white border shadow-sm">
                  <CardHeader>
                    <CardTitle>Create Operations User</CardTitle>
                    <CardDescription>
                      Click the button below to open the Operations User creation form.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button
                      onClick={() => {
                        setCreateOpsUserOpen(true);
                      }}
                    >
                      <Wrench className="h-4 w-4 mr-2" />
                      Open Operations User Creation
                    </Button>
                  </CardContent>
                </Card>

                {createOpsUserOpen && (
                  <div className="mt-6">
                    <OperationsUserPanel
                      initialCreateOpen
                      onCreateOpenChange={setCreateOpsUserOpen}
                    />
                  </div>
                )}
              </>
            )}

          </div>
            ) : activeTab === "organization" ? (
              <OrganizationPanel />
            ) : (
          <div className="space-y-6">
            {/* Sub-tabs */}
            <div className="flex gap-2 border-b overflow-x-auto">
              <Button
                variant={profilesSubTab === "users" ? "default" : "ghost"}
                onClick={() => setProfilesSubTab("users")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={profilesSubTab === "users" ? "default" : "outline"}
              >
                <UsersRound className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Users</span>
              </Button>
              <Button
                variant={profilesSubTab === "sales-agent" ? "default" : "ghost"}
                onClick={() => setProfilesSubTab("sales-agent")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={profilesSubTab === "sales-agent" ? "default" : "outline"}
              >
                <UserCog className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Sales Agent</span>
              </Button>
              <Button
                variant={profilesSubTab === "operations-users" ? "default" : "ghost"}
                onClick={() => setProfilesSubTab("operations-users")}
                className="rounded-b-none shrink-0 sidebar-button"
                data-variant={profilesSubTab === "operations-users" ? "default" : "outline"}
              >
                <Wrench className="h-4 w-4 mr-2 sidebar-icon" />
                <span className="sidebar-text">Operations Users</span>
              </Button>
            </div>

            {/* Users Sub-tab Content - Only show when this tab is selected */}
            {profilesSubTab === "users" && (
              <>
                <Card className="bg-white border shadow-sm">
                  <CardHeader>
                    <CardTitle>Admin Profile</CardTitle>
                    <CardDescription>Total users in the system</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-black text-primary-dark">
                      {userCount.toString().padStart(2, "0")}
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-white border shadow-sm">
                  <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <CardTitle>User Profiles</CardTitle>
                      <CardDescription>
                        View, update, and remove user accounts in real time.
                      </CardDescription>
                    </div>
                    <Button onClick={() => {
                      handleTabSelect("create");
                      setCreateSubTab("user");
                    }}>
                      <PlusCircle className="h-4 w-4 mr-2" />
                      Create New User
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {sortedUsers.length === 0 ? (
                      <div className="py-16 text-center text-secondary-muted">
                        No users found. Create your first account to get started.
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Username</TableHead>
                            <TableHead>Password</TableHead>
                            <TableHead>Created</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {sortedUsers.map((user) => (
                            <TableRow key={user.id}>
                              <TableCell className="font-semibold">{user.username}</TableCell>
                              <TableCell className="text-secondary-muted">{user.password}</TableCell>
                              <TableCell className="text-secondary-muted">
                                {new Date(user.created_at).toLocaleString()}
                              </TableCell>
                              <TableCell className="text-right space-x-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEdit(user)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  onClick={() => handleDelete(user)}
                                  disabled={isPending}
                                >
                                  Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </>
            )}

            {/* Sales Agent Sub-tab Content - Only show when this tab is selected */}
            {profilesSubTab === "sales-agent" && (
              <SalesAgentPanel
                initialCreateOpen={createSalesAgentOpen}
                onCreateOpenChange={setCreateSalesAgentOpen}
              />
            )}

            {/* Operations Users Sub-tab Content */}
            {profilesSubTab === "operations-users" && (
              <OperationsUserPanel
                initialCreateOpen={createOpsUserOpen}
                onCreateOpenChange={setCreateOpsUserOpen}
              />
            )}
          </div>
            )}
          </AdminSettingsLayout>
        ) : null}
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
