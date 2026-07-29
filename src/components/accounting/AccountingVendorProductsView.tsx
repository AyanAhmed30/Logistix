"use client";

import { SalesProductsView } from "@/components/sales/SalesProductsView";
import { useAccountingShell } from "@/components/accounting/AccountingShell";

const BASE = "/accounting/vendors/products";

/** Accounting → Vendors → Products — same Sales catalog. */
export function AccountingVendorProductsView() {
  const { searchQuery, activeFilterId } = useAccountingShell();
  return (
    <SalesProductsView
      basePath={BASE}
      searchQuery={searchQuery}
      activeFilterId={activeFilterId}
    />
  );
}
