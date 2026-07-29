"use client";

import { SalesProductFormView } from "@/components/sales/SalesProductFormView";

const BASE = "/accounting/vendors/products";

export function AccountingVendorProductFormView({
  productId,
}: {
  productId: string | null;
}) {
  return <SalesProductFormView productId={productId} basePath={BASE} />;
}
