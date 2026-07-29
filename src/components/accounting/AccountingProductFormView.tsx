"use client";

import { SalesProductFormView } from "@/components/sales/SalesProductFormView";

const BASE = "/accounting/customers/products";

export function AccountingProductFormView({
  productId,
}: {
  productId: string | null;
}) {
  return <SalesProductFormView productId={productId} basePath={BASE} />;
}
