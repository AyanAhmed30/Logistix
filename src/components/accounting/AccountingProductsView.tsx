"use client";

import { SalesProductsView } from "@/components/sales/SalesProductsView";
import { useAccountingShell } from "@/components/accounting/AccountingShell";

const BASE = "/accounting/customers/products";

/** Accounting → Customers → Products — same Sales catalog, no duplicate data. */
export function AccountingProductsView() {
  const { searchQuery, activeFilterId } = useAccountingShell();
  return (
    <SalesProductsView
      basePath={BASE}
      searchQuery={searchQuery}
      activeFilterId={activeFilterId}
    />
  );
}
