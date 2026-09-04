"use client";

import { LeadPanel } from "@/components/sales-agent/LeadPanel";
import { PipelinePanel } from "@/components/sales-agent/PipelinePanel";
import { CustomerListPanel } from "@/components/sales-agent/CustomerListPanel";
import { InquiryTrackingPanel } from "@/components/sales-agent/InquiryTrackingPanel";
import { SalesAgentAccountingPanel } from "@/components/sales-agent/SalesAgentAccountingPanel";
import { LeadTransferTrackingPanel } from "@/components/sales-agent/LeadTransferTrackingPanel";
import { OrganizationCustomersPanel } from "@/components/organization/OrganizationCustomersPanel";
import { OrganizationQuotationsPanel } from "@/components/organization/OrganizationQuotationsPanel";
import { OperationsLeadsInquiryPanel } from "@/components/admin/OperationsLeadsInquiryPanel";
import { OrderManagementPanel } from "@/components/admin/OrderManagementPanel";
import { ConsolePanel } from "@/components/admin/ConsolePanel";
import { LoadingInstructionPanel } from "@/components/admin/LoadingInstructionPanel";
import { ImportPackingListPanel } from "@/components/admin/ImportPackingListPanel";
import { ImportInvoicePanel } from "@/components/admin/ImportInvoicePanel";
import { InquiryConfirmationPanel } from "@/components/admin/InquiryConfirmationPanel";
import { AdminCalculatorPanel } from "@/components/admin/AdminCalculatorPanel";
import { ContactsPanel, type ContactsPanelInitialPayload } from "@/components/admin/ContactsPanel";
import { BookOrderModal } from "@/components/user/BookOrderModal";
import { OrderHistoryPanel } from "@/components/user/OrderHistoryPanel";
import { UserScanProgressPanel } from "@/components/user/UserScanProgressPanel";
import { UserLoadingInstructionsPanel } from "@/components/user/UserLoadingInstructionsPanel";
import { UsbQrScannerInput } from "@/components/scan/UsbQrScannerInput";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useMemo, useState } from "react";
import {
  visiblePortalOpsTabs,
  visiblePortalSalesTabs,
  visiblePortalWarehouseTabs,
  type DashboardAccessState,
} from "@/lib/dashboard-access";
import type { Organization } from "@/app/actions/organizations";

type SalesTab = ReturnType<typeof visiblePortalSalesTabs>[number];
type OpsTab = ReturnType<typeof visiblePortalOpsTabs>[number];
type WarehouseTab = ReturnType<typeof visiblePortalWarehouseTabs>[number];

const SALES_LABELS: Record<SalesTab, string> = {
  lead: "Lead",
  pipeline: "Pipeline",
  "customer-list": "Customer List",
  "lead-transfer-tracking": "Lead Transfer Tracking",
  accounting: "Accounting",
  "inquiry-tracking": "Inquiry Tracking",
  customers: "Customers",
  quotations: "Quotations",
};

const OPS_LABELS: Record<OpsTab, string> = {
  "leads-inquiry": "Lead Inquiry",
  management: "Order Management",
  console: "Console",
  "loading-instruction": "Loading Instruction",
  "import-packing-list": "Import Packing List",
  "import-invoice": "Import Invoice",
  "inquiry-confirmation": "Inquiry Confirmation",
  "calculator-config": "Calculator Configuration",
};

const WAREHOUSE_LABELS: Record<WarehouseTab, string> = {
  "warehouse-book-order": "Book a New Order",
  "warehouse-history": "History",
  "warehouse-scan-progress": "Scan Progress",
  "warehouse-loading-instruction": "Loading Instruction",
};

export function PortalSalesModuleContent({
  access,
  organization,
}: {
  access: DashboardAccessState;
  organization: Organization | null;
}) {
  const tabs = useMemo(() => visiblePortalSalesTabs(access.permissions), [access.permissions]);
  const [activeTab, setActiveTab] = useState<SalesTab>(() => tabs[0] || "lead");

  const resolvedTab = tabs.includes(activeTab) ? activeTab : tabs[0];

  if (tabs.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        No Sales modules assigned. Contact your administrator.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((tab) => (
          <Button
            key={tab}
            variant={resolvedTab === tab ? "default" : "outline"}
            onClick={() => setActiveTab(tab)}
          >
            {SALES_LABELS[tab]}
          </Button>
        ))}
      </div>
      {resolvedTab === "lead" && <LeadPanel />}
      {resolvedTab === "pipeline" && <PipelinePanel />}
      {resolvedTab === "customer-list" && <CustomerListPanel />}
      {resolvedTab === "lead-transfer-tracking" && <LeadTransferTrackingPanel />}
      {resolvedTab === "accounting" && <SalesAgentAccountingPanel />}
      {resolvedTab === "inquiry-tracking" && <InquiryTrackingPanel />}
      {resolvedTab === "customers" && <OrganizationCustomersPanel />}
      {resolvedTab === "quotations" &&
        (organization ? (
          <OrganizationQuotationsPanel organization={organization} />
        ) : (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
            Company details are not available. Contact your administrator.
          </div>
        ))}
    </div>
  );
}

export function PortalOperationsModuleContent({
  access,
  focusTab = null,
  focusConfirmationId = null,
  focusLeadId = null,
  focusInquiryId = null,
}: {
  access: DashboardAccessState;
  focusTab?: string | null;
  focusConfirmationId?: string | null;
  focusLeadId?: string | null;
  focusInquiryId?: string | null;
}) {
  const tabs = useMemo(() => visiblePortalOpsTabs(access.permissions), [access.permissions]);
  const [activeTab, setActiveTab] = useState<OpsTab>(() => tabs[0] || "leads-inquiry");

  useEffect(() => {
    if (focusTab && tabs.includes(focusTab as OpsTab)) {
      setActiveTab(focusTab as OpsTab);
    }
  }, [focusTab, focusConfirmationId, focusLeadId, focusInquiryId, tabs]);

  const resolvedTab = tabs.includes(activeTab) ? activeTab : tabs[0];

  if (tabs.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        No Operations modules assigned. Contact your administrator.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((tab) => (
          <Button
            key={tab}
            variant={resolvedTab === tab ? "default" : "outline"}
            onClick={() => setActiveTab(tab)}
          >
            {OPS_LABELS[tab]}
          </Button>
        ))}
      </div>
      {resolvedTab === "leads-inquiry" && (
        <OperationsLeadsInquiryPanel focusLeadId={focusLeadId} focusInquiryId={focusInquiryId} />
      )}
      {resolvedTab === "management" && <OrderManagementPanel />}
      {resolvedTab === "console" && <ConsolePanel />}
      {resolvedTab === "loading-instruction" && <LoadingInstructionPanel />}
      {resolvedTab === "import-packing-list" && <ImportPackingListPanel />}
      {resolvedTab === "import-invoice" && <ImportInvoicePanel />}
      {resolvedTab === "inquiry-confirmation" && (
        <InquiryConfirmationPanel focusConfirmationId={focusConfirmationId} />
      )}
      {resolvedTab === "calculator-config" && <AdminCalculatorPanel />}
    </div>
  );
}

export function PortalWarehouseModuleContent({
  access,
}: {
  access: DashboardAccessState;
}) {
  const tabs = useMemo(() => visiblePortalWarehouseTabs(access.permissions), [access.permissions]);
  const [activeTab, setActiveTab] = useState<WarehouseTab>(() => tabs[0] || "warehouse-book-order");
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [scanProgressRefreshKey, setScanProgressRefreshKey] = useState(0);
  const [loadingRefreshKey, setLoadingRefreshKey] = useState(0);

  const resolvedTab = tabs.includes(activeTab) ? activeTab : tabs[0];
  const showScanner =
    resolvedTab === "warehouse-scan-progress" ||
    resolvedTab === "warehouse-loading-instruction";

  if (tabs.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-6 text-sm text-amber-900">
        No Warehouse modules assigned. Contact your administrator.
      </div>
    );
  }

  function selectTab(tab: WarehouseTab) {
    setActiveTab(tab);
    if (tab === "warehouse-book-order") {
      setIsOrderModalOpen(true);
    } else {
      setIsOrderModalOpen(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {tabs.map((tab) => (
          <Button
            key={tab}
            variant={resolvedTab === tab ? "default" : "outline"}
            onClick={() => selectTab(tab)}
          >
            {WAREHOUSE_LABELS[tab]}
          </Button>
        ))}
      </div>

      <UsbQrScannerInput enabled={!isOrderModalOpen} showCaptureField={showScanner} />

      {resolvedTab === "warehouse-book-order" ? (
        <Card className="bg-white border shadow-sm">
          <CardHeader>
            <CardTitle>Book a New Order</CardTitle>
            <CardDescription>
              Open the modal to create one order with multiple cartons.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setIsOrderModalOpen(true)}>Book a New Order</Button>
          </CardContent>
        </Card>
      ) : null}

      {resolvedTab === "warehouse-history" ? (
        <OrderHistoryPanel refreshKey={historyRefreshKey} />
      ) : null}

      <div
        className={resolvedTab === "warehouse-loading-instruction" ? undefined : "hidden"}
        aria-hidden={resolvedTab !== "warehouse-loading-instruction"}
      >
        <UserLoadingInstructionsPanel
          refreshKey={loadingRefreshKey}
          isVisible={resolvedTab === "warehouse-loading-instruction"}
          onAfterContainerFull={() => {
            setScanProgressRefreshKey((k) => k + 1);
            if (tabs.includes("warehouse-scan-progress")) {
              selectTab("warehouse-scan-progress");
            }
          }}
        />
      </div>

      <div
        className={resolvedTab === "warehouse-scan-progress" ? undefined : "hidden"}
        aria-hidden={resolvedTab !== "warehouse-scan-progress"}
      >
        <UserScanProgressPanel
          refreshKey={scanProgressRefreshKey}
          username={access.username}
        />
      </div>

      <BookOrderModal
        open={isOrderModalOpen}
        onOpenChange={setIsOrderModalOpen}
        onOrderSaved={() => {
          setHistoryRefreshKey((prev) => prev + 1);
          setScanProgressRefreshKey((prev) => prev + 1);
          setLoadingRefreshKey((prev) => prev + 1);
        }}
      />
    </div>
  );
}

export function PortalContactsModuleContent({
  initialPayload,
  onListLoaded,
}: {
  initialPayload?: ContactsPanelInitialPayload;
  onListLoaded?: () => void;
}) {
  return <ContactsPanel initialPayload={initialPayload} onListLoaded={onListLoaded} />;
}
