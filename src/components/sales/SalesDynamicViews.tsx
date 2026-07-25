'use client';

import dynamic from 'next/dynamic';
import {
  SalesKanbanSkeleton,
  SalesPageSkeleton,
  SalesReportSkeleton,
} from '@/components/sales/SalesSkeleton';

/** Client-only dynamic imports — `ssr: false` is not allowed in Server Components. */

export const SalesQuotationsViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesQuotationsView').then(
      (m) => m.SalesQuotationsView
    ),
  { loading: () => <SalesKanbanSkeleton />, ssr: false }
);

export const SalesCustomersViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesCustomersView').then(
      (m) => m.SalesCustomersView
    ),
  { loading: () => <SalesPageSkeleton />, ssr: false }
);

export const SalesQuotationFormViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesQuotationFormView').then(
      (m) => m.SalesQuotationFormView
    ),
  { loading: () => <SalesPageSkeleton rows={8} />, ssr: false }
);

export const SalesProductsViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesProductsView').then(
      (m) => m.SalesProductsView
    ),
  { loading: () => <SalesPageSkeleton />, ssr: false }
);

export const SalesProductFormViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesProductFormView').then(
      (m) => m.SalesProductFormView
    ),
  { loading: () => <SalesPageSkeleton rows={6} />, ssr: false }
);

export const SalesOrdersViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesOrdersView').then((m) => m.SalesOrdersView),
  { loading: () => <SalesKanbanSkeleton />, ssr: false }
);

export const SalesReportsViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesReportsView').then(
      (m) => m.SalesReportsView
    ),
  { loading: () => <SalesReportSkeleton />, ssr: false }
);

export const SalesOrdersToInvoiceViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesOrdersToInvoiceView').then(
      (m) => m.SalesOrdersToInvoiceView
    ),
  { loading: () => <SalesPageSkeleton />, ssr: false }
);

export const SalesOrdersToUpsellViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesOrdersToUpsellView').then(
      (m) => m.SalesOrdersToUpsellView
    ),
  { loading: () => <SalesPageSkeleton />, ssr: false }
);

export const SalesInvoicePreviewViewDynamic = dynamic(
  () =>
    import('@/components/sales/SalesInvoicePreviewView').then(
      (m) => m.SalesInvoicePreviewView
    ),
  { loading: () => <SalesPageSkeleton rows={8} />, ssr: false }
);
