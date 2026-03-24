"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { MessageSquare, FileText, Receipt } from "lucide-react";
import { SalesAgentAccountingInquiriesPanel } from "@/components/sales-agent/SalesAgentAccountingInquiriesPanel";
import { QuotationPanel } from "@/components/admin/QuotationPanel";
import { InvoicePanel } from "@/components/admin/InvoicePanel";

type AccountingSubTab = "inquiries" | "quotation" | "customer-invoice";

export function SalesAgentAccountingPanel() {
  const [activeSubTab, setActiveSubTab] = useState<AccountingSubTab>("inquiries");

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        <Button
          variant={activeSubTab === "inquiries" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("inquiries")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "inquiries" ? "default" : "outline"}
        >
          <MessageSquare className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Inquiries</span>
        </Button>
        <Button
          variant={activeSubTab === "quotation" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("quotation")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "quotation" ? "default" : "outline"}
        >
          <FileText className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Quotation</span>
        </Button>
        <Button
          variant={activeSubTab === "customer-invoice" ? "default" : "ghost"}
          onClick={() => setActiveSubTab("customer-invoice")}
          className="rounded-b-none shrink-0 sidebar-button"
          data-variant={activeSubTab === "customer-invoice" ? "default" : "outline"}
        >
          <Receipt className="h-4 w-4 mr-2 sidebar-icon" />
          <span className="sidebar-text">Customer Invoice</span>
        </Button>
      </div>

      {/* Inquiries Sub-tab Content */}
      {activeSubTab === "inquiries" && (
        <SalesAgentAccountingInquiriesPanel />
      )}

      {/* Quotation Sub-tab Content */}
      {activeSubTab === "quotation" && (
        <QuotationPanel salesAgentMode />
      )}

      {/* Customer Invoice Sub-tab Content */}
      {activeSubTab === "customer-invoice" && (
        <InvoicePanel salesAgentMode />
      )}
    </div>
  );
}
