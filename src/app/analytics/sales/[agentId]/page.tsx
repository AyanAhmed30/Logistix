import { SalesAgentAnalytics } from '@/components/analytics/SalesAgentAnalytics';

export default async function SalesAgentAnalyticsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  return <SalesAgentAnalytics agentId={agentId} />;
}
