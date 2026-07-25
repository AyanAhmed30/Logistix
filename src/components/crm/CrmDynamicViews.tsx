'use client';

import dynamic from 'next/dynamic';
import {
  CrmFormSkeleton,
  CrmKanbanSkeleton,
  CrmPageSkeleton,
} from '@/components/crm/CrmSkeleton';

/** Client-only dynamic imports — `ssr: false` is not allowed in Server Components. */

export const CrmPipelineViewDynamic = dynamic(
  () =>
    import('@/components/crm/CrmPipelineView').then((m) => m.CrmPipelineView),
  { loading: () => <CrmKanbanSkeleton />, ssr: false }
);

export const CrmCustomersViewDynamic = dynamic(
  () =>
    import('@/components/crm/CrmCustomersView').then((m) => m.CrmCustomersView),
  { loading: () => <CrmPageSkeleton />, ssr: false }
);

export const CrmActivitiesViewDynamic = dynamic(
  () =>
    import('@/components/crm/CrmActivitiesView').then((m) => m.CrmActivitiesView),
  { loading: () => <CrmPageSkeleton />, ssr: false }
);

export const CrmReportsViewDynamic = dynamic(
  () => import('@/components/crm/CrmReportsView').then((m) => m.CrmReportsView),
  { loading: () => <CrmPageSkeleton rows={6} />, ssr: false }
);

export const CrmOpportunityFormViewDynamic = dynamic(
  () =>
    import('@/components/crm/CrmOpportunityFormView').then(
      (m) => m.CrmOpportunityFormView
    ),
  { loading: () => <CrmFormSkeleton />, ssr: false }
);
