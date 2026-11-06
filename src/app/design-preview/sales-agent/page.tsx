import { notFound } from 'next/navigation';
import { SalesAgentDashboardPreview } from '@/components/analytics/SalesAgentDashboardPreview';

/** Sample-data design preview. Development only, so it can never reach users. */
export default function SalesAgentDesignPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <SalesAgentDashboardPreview />;
}
