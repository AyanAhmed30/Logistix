import { OperationsEmployeeAnalytics } from '@/components/analytics/OperationsAnalytics';

export default async function OperationsEmployeeAnalyticsPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return <OperationsEmployeeAnalytics username={decodeURIComponent(username)} />;
}
